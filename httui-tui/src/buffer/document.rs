use httui_core::blocks::{parse_blocks, parser::ParsedBlock, serialize_block};
use ropey::Rope;

use crate::buffer::block::{BlockId, BlockNode, ExecutionState};
use crate::buffer::cursor::Cursor;
use crate::buffer::segment::Segment;
use crate::error::TuiResult;
use crate::vim::undo::{Snapshot, UndoStack};

/// In-memory representation of a markdown note, as a flat sequence of
/// typed segments (prose / block). Produced by
/// [`Document::from_markdown`] and rendered back via
/// [`Document::to_markdown`].
///
/// Round-1 mutation API: insert/delete a single char (or newline) at
/// the cursor. Block segments are read-only — calls are no-ops when
/// the cursor sits on a `BlockSelected`. Undo / redo arrive with the
/// vim engine round 3.
pub struct Document {
    segments: Vec<Segment>,
    cursor: Cursor,
    next_block_id: u64,
    dirty: bool,
    undo: UndoStack,
}

impl Document {
    /// Parse a markdown string into a segmented document. Prose runs
    /// outside executable fences are kept verbatim in a [`Rope`]; known
    /// block types (http / db-* / e2e, and anything else registered in
    /// the core parser) become [`Segment::Block`].
    pub fn from_markdown(src: &str) -> TuiResult<Self> {
        let parsed = parse_blocks(src);
        let lines: Vec<&str> = src.lines().collect();

        let mut segments: Vec<Segment> = Vec::with_capacity(parsed.len() * 2 + 1);
        let mut next_id = 0u64;
        let mut line_cursor = 0usize;

        for block in &parsed {
            if block.line_start > line_cursor {
                let prose = lines[line_cursor..block.line_start].join("\n");
                if !prose.is_empty() {
                    segments.push(Segment::Prose(Rope::from_str(&prose)));
                }
            }
            segments.push(Segment::Block(BlockNode {
                id: BlockId(next_id),
                block_type: block.block_type.clone(),
                alias: block.alias.clone(),
                display_mode: block.display_mode.clone(),
                params: block.params.clone(),
                state: ExecutionState::Idle,
                cached_result: None,
            }));
            next_id += 1;
            line_cursor = block.line_end + 1;
        }

        if line_cursor < lines.len() {
            let prose = lines[line_cursor..].join("\n");
            if !prose.is_empty() {
                segments.push(Segment::Prose(Rope::from_str(&prose)));
            }
        }

        // Inject empty prose padding so the cursor never gets stranded
        // on a block: prepend before a leading block, append after a
        // trailing block, and slip an empty prose between adjacent
        // blocks. These synthetic empties round-trip cleanly because
        // `to_markdown` skips empty prose runs.
        segments = pad_with_prose(segments);

        let cursor = match segments.first() {
            Some(Segment::Prose(_)) => Cursor::InProse {
                segment_idx: 0,
                offset: 0,
            },
            Some(Segment::Block(_)) => Cursor::InBlock {
                segment_idx: 0,
                line: 0,
                offset: 0,
            },
            None => {
                segments.push(Segment::Prose(Rope::new()));
                Cursor::InProse {
                    segment_idx: 0,
                    offset: 0,
                }
            }
        };

        Ok(Self {
            segments,
            cursor,
            next_block_id: next_id,
            dirty: false,
            undo: UndoStack::new(),
        })
    }

    /// Serialize the document back to markdown. Parse → serialize →
    /// parse yields a semantically-equivalent document (same blocks,
    /// same order, same prose text) but is **not** guaranteed
    /// byte-identical — canonical forms are enforced (e.g. DB info
    /// strings emit `alias → connection → limit → timeout → display`).
    pub fn to_markdown(&self) -> String {
        // Filter out the synthetic empty-prose padding before
        // serializing — those segments only exist for the cursor's
        // benefit and shouldn't bleed into the file on disk.
        let visible: Vec<&Segment> = self
            .segments
            .iter()
            .filter(|s| !is_empty_prose(s))
            .collect();
        let mut out = String::new();
        let last_idx = visible.len().saturating_sub(1);
        for (i, seg) in visible.iter().enumerate() {
            match seg {
                Segment::Prose(r) => out.push_str(&r.to_string()),
                Segment::Block(b) => {
                    let adapter = ParsedBlock {
                        block_type: b.block_type.clone(),
                        alias: b.alias.clone(),
                        display_mode: b.display_mode.clone(),
                        params: b.params.clone(),
                        line_start: 0,
                        line_end: 0,
                    };
                    out.push_str(&serialize_block(&adapter));
                }
            }
            // Separator between segments: one `\n` unless the prior chunk
            // already supplied one. The last segment intentionally has no
            // trailing newline — the prose rope carries any newline the
            // original file had.
            if i < last_idx && !out.ends_with('\n') {
                out.push('\n');
            }
        }
        out
    }

    pub fn segments(&self) -> &[Segment] {
        &self.segments
    }

    pub fn segment_count(&self) -> usize {
        self.segments.len()
    }

    pub fn block_ids(&self) -> impl Iterator<Item = BlockId> + '_ {
        self.segments.iter().filter_map(|s| match s {
            Segment::Block(b) => Some(b.id),
            _ => None,
        })
    }

    pub fn find_block_by_alias(&self, alias: &str) -> Option<&BlockNode> {
        self.segments.iter().find_map(|s| match s {
            Segment::Block(b) if b.alias.as_deref() == Some(alias) => Some(b),
            _ => None,
        })
    }

    pub fn find_block_by_id(&self, id: BlockId) -> Option<&BlockNode> {
        self.segments.iter().find_map(|s| match s {
            Segment::Block(b) if b.id == id => Some(b),
            _ => None,
        })
    }

    /// Replace the segment at `segment_idx` with `new`. No-op if the
    /// index is out of range. Used by the in-block↔prose swap so the
    /// motion/operator engine can run on the SQL body as if it were
    /// regular prose.
    pub fn replace_segment(&mut self, segment_idx: usize, new: Segment) {
        if let Some(slot) = self.segments.get_mut(segment_idx) {
            *slot = new;
        }
    }

    /// Mutable handle to the block at `segment_idx`. Used by the run
    /// dispatcher to flip [`ExecutionState`] and stash `cached_result`.
    pub fn block_at_mut(&mut self, segment_idx: usize) -> Option<&mut BlockNode> {
        match self.segments.get_mut(segment_idx)? {
            Segment::Block(b) => Some(b),
            _ => None,
        }
    }

    pub fn cursor(&self) -> Cursor {
        self.cursor
    }

    pub fn set_cursor(&mut self, c: Cursor) {
        self.cursor = c;
    }

    pub fn is_dirty(&self) -> bool {
        self.dirty
    }

    pub fn mark_clean(&mut self) {
        self.dirty = false;
    }

    /// Insert one character at the cursor position. Routes to either
    /// the prose rope (for `Cursor::InProse`) or the block's editable
    /// body (for `Cursor::InBlock` — DB blocks' `query` field for now).
    pub fn insert_char_at_cursor(&mut self, ch: char) {
        match self.cursor {
            Cursor::InProse {
                segment_idx,
                offset,
            } => {
                if let Some(Segment::Prose(rope)) = self.segments.get_mut(segment_idx) {
                    let off = offset.min(rope.len_chars());
                    rope.insert_char(off, ch);
                    self.cursor = Cursor::InProse {
                        segment_idx,
                        offset: off + 1,
                    };
                    self.dirty = true;
                }
            }
            Cursor::InBlock {
                segment_idx,
                line,
                offset,
            } => {
                if let Some((new_line, new_offset)) =
                    block_query_insert(self, segment_idx, line, offset, ch)
                {
                    self.cursor = Cursor::InBlock {
                        segment_idx,
                        line: new_line,
                        offset: new_offset,
                    };
                    self.dirty = true;
                }
            }
            // Result rows are read-only — typing in the table is a no-op.
            Cursor::InBlockResult { .. } => {}
        }
    }

    /// Insert a newline at the cursor.
    pub fn insert_newline_at_cursor(&mut self) {
        self.insert_char_at_cursor('\n');
    }

    /// Backspace: remove the char immediately before the cursor.
    /// At the start of a non-first line, fold into the previous line.
    pub fn delete_char_before_cursor(&mut self) {
        match self.cursor {
            Cursor::InProse {
                segment_idx,
                offset,
            } => {
                if offset == 0 {
                    return;
                }
                if let Some(Segment::Prose(rope)) = self.segments.get_mut(segment_idx) {
                    if offset > 0 && offset <= rope.len_chars() {
                        rope.remove(offset - 1..offset);
                        self.cursor = Cursor::InProse {
                            segment_idx,
                            offset: offset - 1,
                        };
                        self.dirty = true;
                    }
                }
            }
            Cursor::InBlock {
                segment_idx,
                line,
                offset,
            } => {
                if let Some((new_line, new_offset)) =
                    block_query_delete_before(self, segment_idx, line, offset)
                {
                    self.cursor = Cursor::InBlock {
                        segment_idx,
                        line: new_line,
                        offset: new_offset,
                    };
                    self.dirty = true;
                }
            }
            Cursor::InBlockResult { .. } => {}
        }
    }

    /// Forward delete (`x`, `Del`): remove the char under the cursor.
    pub fn delete_char_at_cursor(&mut self) {
        match self.cursor {
            Cursor::InProse {
                segment_idx,
                offset,
            } => {
                if let Some(Segment::Prose(rope)) = self.segments.get_mut(segment_idx) {
                    if offset < rope.len_chars() {
                        rope.remove(offset..offset + 1);
                        self.dirty = true;
                    }
                }
            }
            Cursor::InBlock {
                segment_idx,
                line,
                offset,
            } => {
                if block_query_delete_at(self, segment_idx, line, offset) {
                    self.dirty = true;
                }
            }
            Cursor::InBlockResult { .. } => {}
        }
    }

    /// Read a substring (in chars) from a prose segment. Out-of-bounds
    /// indices are clamped. Returns an empty string for non-prose
    /// segments or invalid indices.
    pub fn text_in_segment_range(&self, segment_idx: usize, start: usize, end: usize) -> String {
        let Some(Segment::Prose(rope)) = self.segments.get(segment_idx) else {
            return String::new();
        };
        let total = rope.len_chars();
        let s = start.min(total);
        let e = end.min(total).max(s);
        rope.slice(s..e).to_string()
    }

    /// Delete a char range from a prose segment. Cursor placement is
    /// the caller's responsibility (the operator engine moves the
    /// cursor to `start` after deletion). No-op for non-prose segments
    /// or empty ranges. Marks the document dirty when something is
    /// actually removed.
    pub fn delete_range_in_segment(&mut self, segment_idx: usize, start: usize, end: usize) {
        let Some(Segment::Prose(rope)) = self.segments.get_mut(segment_idx) else {
            return;
        };
        let total = rope.len_chars();
        let s = start.min(total);
        let e = end.min(total);
        if e <= s {
            return;
        }
        rope.remove(s..e);
        self.dirty = true;
    }

    /// Insert `text` into a prose segment at char `offset`. Returns the
    /// number of chars inserted (so callers can place the cursor at
    /// `offset + n` if desired). No-op for non-prose segments.
    pub fn insert_text_in_segment(
        &mut self,
        segment_idx: usize,
        offset: usize,
        text: &str,
    ) -> usize {
        let Some(Segment::Prose(rope)) = self.segments.get_mut(segment_idx) else {
            return 0;
        };
        let total = rope.len_chars();
        let off = offset.min(total);
        rope.insert(off, text);
        if !text.is_empty() {
            self.dirty = true;
        }
        text.chars().count()
    }

    // ─── undo / redo ───

    /// Capture the current state onto the undo past stack. Called by
    /// the dispatch layer immediately before any undoable command —
    /// `i`/`a`/`o`/`O`, operators that modify (`d`/`c`), paste.
    pub fn snapshot(&mut self) {
        self.undo.push(self.snapshot_of_self());
    }

    /// Restore the most recent past snapshot. Returns `false` when the
    /// stack is empty (nothing to undo).
    pub fn undo(&mut self) -> bool {
        let Some(snap) = self.undo.pop_undo() else {
            return false;
        };
        let current = self.snapshot_of_self();
        self.undo.push_redo(current);
        self.restore(snap);
        true
    }

    /// Pop a redo snapshot (set up by a prior `undo`) and apply it.
    /// Returns `false` if the redo stack is empty.
    pub fn redo(&mut self) -> bool {
        let Some(snap) = self.undo.pop_redo() else {
            return false;
        };
        let current = self.snapshot_of_self();
        self.undo.push_past(current);
        self.restore(snap);
        true
    }

    pub fn can_undo(&self) -> bool {
        self.undo.can_undo()
    }

    pub fn can_redo(&self) -> bool {
        self.undo.can_redo()
    }

    fn snapshot_of_self(&self) -> Snapshot {
        Snapshot {
            segments: self.segments.clone(),
            cursor: self.cursor,
            next_block_id: self.next_block_id,
        }
    }

    fn restore(&mut self, snap: Snapshot) {
        self.segments = snap.segments;
        self.cursor = snap.cursor;
        self.next_block_id = snap.next_block_id;
        // Conservatively flag dirty after any history move — proving the
        // restored state matches disk would require comparing against the
        // last-saved snapshot, which we don't track yet.
        self.dirty = true;
    }
}

/// Insert empty prose runs around blocks so the cursor always has a
/// landing zone for `i`/`a`/`j`/`k` after navigating into a block.
/// - Doc opens with a block → prepend empty prose.
/// - Doc ends with a block → append empty prose.
/// - Two blocks back-to-back → splice empty prose between them.
fn pad_with_prose(segments: Vec<Segment>) -> Vec<Segment> {
    if segments.is_empty() {
        return segments;
    }
    let mut out: Vec<Segment> = Vec::with_capacity(segments.len() + 2);
    if matches!(segments.first(), Some(Segment::Block(_))) {
        out.push(Segment::Prose(Rope::new()));
    }
    for (i, seg) in segments.iter().enumerate() {
        if i > 0
            && matches!(seg, Segment::Block(_))
            && matches!(segments.get(i - 1), Some(Segment::Block(_)))
        {
            out.push(Segment::Prose(Rope::new()));
        }
        out.push(seg.clone());
    }
    if matches!(out.last(), Some(Segment::Block(_))) {
        out.push(Segment::Prose(Rope::new()));
    }
    out
}

fn is_empty_prose(seg: &Segment) -> bool {
    matches!(seg, Segment::Prose(r) if r.len_chars() == 0)
}

/// Insert `ch` into the block's `query` field at `(line, offset)`.
/// Returns the new `(line, offset)` after the insert, or `None` if
/// the block can't be edited (missing / non-DB / no `query`).
fn block_query_insert(
    doc: &mut Document,
    segment_idx: usize,
    line: usize,
    offset: usize,
    ch: char,
) -> Option<(usize, usize)> {
    let mut chars = block_query_chars(doc, segment_idx)?;
    let abs = chars_index_for_line_col(&chars, line, offset);
    chars.insert(abs, ch);
    write_block_query(doc, segment_idx, &chars)?;
    Some(if ch == '\n' {
        (line + 1, 0)
    } else {
        (line, offset + 1)
    })
}

/// Backspace inside a block. Joins the current line to the previous
/// when the cursor is at column 0; otherwise removes the char before
/// the cursor. Returns the new `(line, offset)`. `None` when nothing
/// to delete (line 0 column 0) or the block isn't editable.
fn block_query_delete_before(
    doc: &mut Document,
    segment_idx: usize,
    line: usize,
    offset: usize,
) -> Option<(usize, usize)> {
    if line == 0 && offset == 0 {
        return None;
    }
    let mut chars = block_query_chars(doc, segment_idx)?;
    let (new_line, new_offset) = if offset > 0 {
        let abs = chars_index_for_line_col(&chars, line, offset);
        if abs == 0 {
            return None;
        }
        chars.remove(abs - 1);
        (line, offset - 1)
    } else {
        // Beginning of line — join with previous line by removing the
        // newline that separates them.
        let prev_line_chars = chars
            .split(|c| *c == '\n')
            .nth(line - 1)
            .map(|l| l.len())
            .unwrap_or(0);
        let abs = chars_index_for_line_col(&chars, line, 0);
        if abs == 0 {
            return None;
        }
        chars.remove(abs - 1);
        (line - 1, prev_line_chars)
    };
    write_block_query(doc, segment_idx, &chars)?;
    Some((new_line, new_offset))
}

/// Forward delete inside a block. Removes the char under the cursor.
/// Returns `true` when something was actually deleted.
fn block_query_delete_at(
    doc: &mut Document,
    segment_idx: usize,
    line: usize,
    offset: usize,
) -> bool {
    let Some(mut chars) = block_query_chars(doc, segment_idx) else {
        return false;
    };
    let abs = chars_index_for_line_col(&chars, line, offset);
    if abs >= chars.len() {
        return false;
    }
    chars.remove(abs);
    write_block_query(doc, segment_idx, &chars).is_some()
}

fn block_query_chars(doc: &Document, segment_idx: usize) -> Option<Vec<char>> {
    let seg = doc.segments.get(segment_idx)?;
    let Segment::Block(b) = seg else { return None };
    let s = b.params.get("query")?.as_str()?;
    Some(s.chars().collect())
}

fn write_block_query(doc: &mut Document, segment_idx: usize, chars: &[char]) -> Option<()> {
    let seg = doc.segments.get_mut(segment_idx)?;
    let Segment::Block(b) = seg else { return None };
    let new_str: String = chars.iter().collect();
    b.params
        .as_object_mut()?
        .insert("query".into(), serde_json::Value::String(new_str));
    Some(())
}

/// Translate a `(line, char_offset_in_line)` pair into an index into
/// the flat char vector. Lines are split by `\n`; offsets past the end
/// of a line clamp at the line's end (just before the newline).
fn chars_index_for_line_col(chars: &[char], line: usize, offset: usize) -> usize {
    let mut current_line = 0usize;
    let mut col = 0usize;
    for (idx, c) in chars.iter().enumerate() {
        if current_line == line {
            if col == offset {
                return idx;
            }
            if *c == '\n' {
                // Asked for an offset past the end of this line —
                // clamp to the position right before the newline.
                return idx;
            }
            col += 1;
        }
        if *c == '\n' {
            if current_line == line {
                return idx;
            }
            current_line += 1;
            col = 0;
        }
    }
    chars.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    // Fixtures. Each sample is a self-contained markdown doc exercising
    // a distinct topology (block count, surrounding prose, edge placement).

    const EMPTY: &str = "";

    const ONLY_PROSE: &str = "# Title\n\nA paragraph with *emphasis* and a [link](https://x.com).\n\n- item 1\n- item 2\n";

    const ONLY_HTTP: &str = "```http alias=login\n{\"method\":\"POST\",\"url\":\"https://api.test.com/login\",\"params\":[],\"headers\":[],\"body\":\"\"}\n```\n";

    const ONLY_DB: &str = "```db-postgres alias=users connection=prod limit=10 timeout=5000 display=split\nSELECT * FROM users\n```\n";

    const ONLY_E2E: &str = "```e2e alias=flow\n{\"base_url\":\"https://api.test.com\",\"steps\":[{\"name\":\"Health\",\"method\":\"GET\",\"url\":\"/health\"}]}\n```\n";

    const PROSE_BLOCK_PROSE: &str = "# Header\n\nIntro text.\n\n```http alias=h\n{\"method\":\"GET\",\"url\":\"https://x.com\",\"params\":[],\"headers\":[],\"body\":\"\"}\n```\n\nOutro text.\n";

    const TWO_BLOCKS_CONSECUTIVE: &str = "```http alias=a\n{\"method\":\"GET\",\"url\":\"https://a.com\",\"params\":[],\"headers\":[],\"body\":\"\"}\n```\n```http alias=b\n{\"method\":\"GET\",\"url\":\"https://b.com\",\"params\":[],\"headers\":[],\"body\":\"\"}\n```\n";

    const COMPLEX: &str = "# API Usage\n\nReport for the last 30 days.\n\n- Bullet 1\n- Bullet 2\n\n```db-postgres alias=q1 connection=prod\nSELECT count(*) FROM events\n```\n\nAfter the query, some notes.\n\n```http alias=api\n{\"method\":\"GET\",\"url\":\"https://x.com/metrics\",\"params\":[],\"headers\":[],\"body\":\"\"}\n```\n\nFinal line.\n";

    const STARTS_WITH_BLOCK: &str = "```http alias=head\n{\"method\":\"GET\",\"url\":\"https://x.com\",\"params\":[],\"headers\":[],\"body\":\"\"}\n```\n\nSome prose after.\n";

    const ENDS_WITH_BLOCK: &str = "Some prose before.\n\n```http alias=tail\n{\"method\":\"GET\",\"url\":\"https://x.com\",\"params\":[],\"headers\":[],\"body\":\"\"}\n```\n";

    const WITH_NON_EXECUTABLE_FENCE: &str = "Here is JS:\n\n```javascript\nconsole.log(\"hi\");\n```\n\nAnd a real block:\n\n```http alias=x\n{\"method\":\"GET\",\"url\":\"https://x.com\",\"params\":[],\"headers\":[],\"body\":\"\"}\n```\n";

    // ─── Roundtrip: semantic equivalence ───

    fn assert_semantic_roundtrip(md: &str) {
        let doc = Document::from_markdown(md).unwrap();
        let serialized = doc.to_markdown();
        let reparsed = Document::from_markdown(&serialized).unwrap();

        assert_eq!(
            doc.segment_count(),
            reparsed.segment_count(),
            "segment count differs after roundtrip\nbefore: {:#?}\nafter: {:#?}",
            describe_segments(&doc),
            describe_segments(&reparsed)
        );

        for (a, b) in doc.segments().iter().zip(reparsed.segments().iter()) {
            match (a, b) {
                (Segment::Prose(ra), Segment::Prose(rb)) => {
                    assert_eq!(ra.to_string().trim_end(), rb.to_string().trim_end());
                }
                (Segment::Block(ba), Segment::Block(bb)) => {
                    assert_eq!(ba.block_type, bb.block_type);
                    assert_eq!(ba.alias, bb.alias);
                    assert_eq!(ba.display_mode, bb.display_mode);
                    assert_eq!(ba.params, bb.params);
                }
                _ => panic!("segment kind mismatch"),
            }
        }
    }

    fn describe_segments(doc: &Document) -> Vec<String> {
        doc.segments()
            .iter()
            .map(|s| match s {
                Segment::Prose(r) => format!("Prose({:?})", r.to_string()),
                Segment::Block(b) => format!(
                    "Block(type={}, alias={:?})",
                    b.block_type, b.alias
                ),
            })
            .collect()
    }

    #[test]
    fn roundtrip_empty() {
        let doc = Document::from_markdown(EMPTY).unwrap();
        // Empty input gets a single empty prose so cursor has somewhere to live.
        assert_eq!(doc.segment_count(), 1);
        assert!(doc.segments()[0].is_prose());
    }

    #[test]
    fn roundtrip_only_prose() {
        assert_semantic_roundtrip(ONLY_PROSE);
    }

    #[test]
    fn roundtrip_only_http() {
        assert_semantic_roundtrip(ONLY_HTTP);
    }

    #[test]
    fn roundtrip_only_db() {
        assert_semantic_roundtrip(ONLY_DB);
    }

    #[test]
    fn roundtrip_only_e2e() {
        assert_semantic_roundtrip(ONLY_E2E);
    }

    #[test]
    fn roundtrip_prose_block_prose() {
        assert_semantic_roundtrip(PROSE_BLOCK_PROSE);
    }

    #[test]
    fn roundtrip_two_blocks_consecutive() {
        assert_semantic_roundtrip(TWO_BLOCKS_CONSECUTIVE);
    }

    #[test]
    fn roundtrip_complex() {
        assert_semantic_roundtrip(COMPLEX);
    }

    #[test]
    fn roundtrip_starts_with_block() {
        assert_semantic_roundtrip(STARTS_WITH_BLOCK);
    }

    #[test]
    fn roundtrip_ends_with_block() {
        assert_semantic_roundtrip(ENDS_WITH_BLOCK);
    }

    #[test]
    fn roundtrip_with_non_executable_fence() {
        assert_semantic_roundtrip(WITH_NON_EXECUTABLE_FENCE);
    }

    // ─── Idempotency ───

    #[test]
    fn double_serialize_converges() {
        for md in [
            ONLY_PROSE,
            ONLY_HTTP,
            ONLY_DB,
            PROSE_BLOCK_PROSE,
            COMPLEX,
            STARTS_WITH_BLOCK,
            TWO_BLOCKS_CONSECUTIVE,
        ] {
            let s1 = Document::from_markdown(md).unwrap().to_markdown();
            let s2 = Document::from_markdown(&s1).unwrap().to_markdown();
            assert_eq!(s1, s2, "second serialization must match first");
        }
    }

    // ─── Cursor defaults ───

    #[test]
    fn cursor_starts_in_prose_when_doc_starts_with_prose() {
        let doc = Document::from_markdown(ONLY_PROSE).unwrap();
        assert_eq!(
            doc.cursor(),
            Cursor::InProse {
                segment_idx: 0,
                offset: 0
            }
        );
    }

    #[test]
    fn cursor_starts_in_prose_padding_when_doc_starts_with_block() {
        // The parser injects an empty prose segment ahead of any leading
        // block so the user has somewhere to type when they land on the
        // file. The block then sits at segment index 1.
        let doc = Document::from_markdown(ONLY_HTTP).unwrap();
        assert_eq!(
            doc.cursor(),
            Cursor::InProse {
                segment_idx: 0,
                offset: 0,
            }
        );
        assert!(doc.segments()[0].is_prose());
        assert!(doc.segments()[1].is_block());
    }

    #[test]
    fn cursor_starts_in_prose_for_empty_doc() {
        let doc = Document::from_markdown(EMPTY).unwrap();
        assert_eq!(
            doc.cursor(),
            Cursor::InProse {
                segment_idx: 0,
                offset: 0
            }
        );
    }

    #[test]
    fn set_cursor_persists() {
        let mut doc = Document::from_markdown(COMPLEX).unwrap();
        let target = Cursor::InBlock {
            segment_idx: 1,
            line: 0,
            offset: 0,
        };
        doc.set_cursor(target);
        assert_eq!(doc.cursor(), target);
    }

    #[test]
    fn insert_char_in_block_appends_to_query() {
        let md = "# t\n\n```db-sqlite alias=q\nSELECT 1\n```\n";
        let mut doc = Document::from_markdown(md).unwrap();
        // Find the block segment.
        let block_idx = doc
            .segments()
            .iter()
            .position(|s| s.is_block())
            .unwrap();
        // Park cursor at end of first SQL line.
        doc.set_cursor(Cursor::InBlock {
            segment_idx: block_idx,
            line: 0,
            offset: 8, // end of "SELECT 1"
        });
        doc.insert_char_at_cursor('!');
        let query = doc.segments()[block_idx]
            .as_block()
            .unwrap()
            .params
            .get("query")
            .and_then(|v| v.as_str())
            .unwrap()
            .to_string();
        assert_eq!(query, "SELECT 1!");
        assert_eq!(
            doc.cursor(),
            Cursor::InBlock {
                segment_idx: block_idx,
                line: 0,
                offset: 9,
            }
        );
    }

    #[test]
    fn newline_in_block_splits_line() {
        let md = "# t\n\n```db-sqlite alias=q\nSELECT 1\n```\n";
        let mut doc = Document::from_markdown(md).unwrap();
        let block_idx = doc.segments().iter().position(|s| s.is_block()).unwrap();
        doc.set_cursor(Cursor::InBlock {
            segment_idx: block_idx,
            line: 0,
            offset: 6, // after "SELECT"
        });
        doc.insert_newline_at_cursor();
        let query = doc.segments()[block_idx]
            .as_block()
            .unwrap()
            .params
            .get("query")
            .and_then(|v| v.as_str())
            .unwrap()
            .to_string();
        assert_eq!(query, "SELECT\n 1");
        assert_eq!(
            doc.cursor(),
            Cursor::InBlock {
                segment_idx: block_idx,
                line: 1,
                offset: 0,
            }
        );
    }

    #[test]
    fn backspace_in_block_at_col_zero_joins_lines() {
        let md = "# t\n\n```db-sqlite alias=q\nA\nB\n```\n";
        let mut doc = Document::from_markdown(md).unwrap();
        let block_idx = doc.segments().iter().position(|s| s.is_block()).unwrap();
        doc.set_cursor(Cursor::InBlock {
            segment_idx: block_idx,
            line: 1,
            offset: 0,
        });
        doc.delete_char_before_cursor();
        let query = doc.segments()[block_idx]
            .as_block()
            .unwrap()
            .params
            .get("query")
            .and_then(|v| v.as_str())
            .unwrap()
            .to_string();
        assert_eq!(query, "AB");
        assert_eq!(
            doc.cursor(),
            Cursor::InBlock {
                segment_idx: block_idx,
                line: 0,
                offset: 1,
            }
        );
    }

    // ─── Stable IDs ───

    #[test]
    fn block_ids_are_sequential() {
        let doc = Document::from_markdown(COMPLEX).unwrap();
        let ids: Vec<u64> = doc.block_ids().map(|b| b.0).collect();
        assert_eq!(ids, vec![0, 1]);
    }

    #[test]
    fn block_ids_are_unique() {
        let doc = Document::from_markdown(TWO_BLOCKS_CONSECUTIVE).unwrap();
        let ids: Vec<u64> = doc.block_ids().map(|b| b.0).collect();
        assert_eq!(ids.len(), 2);
        assert_ne!(ids[0], ids[1]);
    }

    #[test]
    fn find_block_by_id_returns_right_block() {
        let doc = Document::from_markdown(COMPLEX).unwrap();
        let ids: Vec<BlockId> = doc.block_ids().collect();
        let first = doc.find_block_by_id(ids[0]).unwrap();
        assert_eq!(first.alias.as_deref(), Some("q1"));
        let second = doc.find_block_by_id(ids[1]).unwrap();
        assert_eq!(second.alias.as_deref(), Some("api"));
    }

    #[test]
    fn find_block_by_id_rejects_unknown_id() {
        let doc = Document::from_markdown(COMPLEX).unwrap();
        assert!(doc.find_block_by_id(BlockId(999)).is_none());
    }

    // ─── find_block_by_alias ───

    #[test]
    fn find_block_by_alias_finds_match() {
        let doc = Document::from_markdown(COMPLEX).unwrap();
        let b = doc.find_block_by_alias("api").unwrap();
        assert!(b.is_http());
    }

    #[test]
    fn find_block_by_alias_returns_none_for_unknown() {
        let doc = Document::from_markdown(COMPLEX).unwrap();
        assert!(doc.find_block_by_alias("missing").is_none());
    }

    #[test]
    fn find_block_by_alias_skips_blocks_without_alias() {
        let md = "```http\n{\"method\":\"GET\",\"url\":\"https://x.com\",\"params\":[],\"headers\":[],\"body\":\"\"}\n```\n";
        let doc = Document::from_markdown(md).unwrap();
        assert!(doc.find_block_by_alias("").is_none());
    }

    // ─── Segment topology edge cases ───

    #[test]
    fn non_executable_fence_stays_in_prose() {
        let doc = Document::from_markdown(WITH_NON_EXECUTABLE_FENCE).unwrap();
        // The javascript fence must be inside a prose segment; only the
        // http block is counted.
        let blocks: Vec<&BlockNode> = doc
            .segments()
            .iter()
            .filter_map(|s| s.as_block())
            .collect();
        assert_eq!(blocks.len(), 1);
        assert!(blocks[0].is_http());

        let prose_concat: String = doc
            .segments()
            .iter()
            .filter_map(|s| s.as_prose())
            .map(|r| r.to_string())
            .collect();
        assert!(prose_concat.contains("```javascript"));
    }

    #[test]
    fn starts_with_block_pads_prose_before_it() {
        // Padding empty prose so the cursor has a landing zone above
        // the block. The block then lives at index 1.
        let doc = Document::from_markdown(STARTS_WITH_BLOCK).unwrap();
        assert!(doc.segments()[0].is_prose());
        assert!(doc.segments()[1].is_block());
    }

    #[test]
    fn ends_with_block_pads_prose_after_it() {
        // Padding empty prose so `j` can land below a trailing block.
        let doc = Document::from_markdown(ENDS_WITH_BLOCK).unwrap();
        let last = doc.segments().last().unwrap();
        assert!(last.is_prose());
        assert!(last.as_prose().unwrap().len_chars() == 0);
    }

    #[test]
    fn two_consecutive_blocks_yield_two_block_segments() {
        let doc = Document::from_markdown(TWO_BLOCKS_CONSECUTIVE).unwrap();
        let blocks = doc.segments().iter().filter(|s| s.is_block()).count();
        assert_eq!(blocks, 2);
    }

    #[test]
    fn execution_state_defaults_to_idle() {
        let doc = Document::from_markdown(COMPLEX).unwrap();
        for seg in doc.segments() {
            if let Segment::Block(b) = seg {
                assert_eq!(b.state, ExecutionState::Idle);
                assert!(b.cached_result.is_none());
            }
        }
    }

    // ─── undo / redo ───

    #[test]
    fn undo_restores_pre_edit_state() {
        let mut d = Document::from_markdown("hello\n").unwrap();
        d.snapshot();
        d.insert_char_at_cursor('X');
        assert_eq!(d.text_in_segment_range(0, 0, 6), "Xhello");
        assert!(d.undo());
        assert_eq!(d.text_in_segment_range(0, 0, 5), "hello");
    }

    #[test]
    fn redo_reapplies_undone_change() {
        let mut d = Document::from_markdown("hello\n").unwrap();
        d.snapshot();
        d.insert_char_at_cursor('X');
        d.undo();
        assert!(d.redo());
        assert_eq!(d.text_in_segment_range(0, 0, 6), "Xhello");
    }

    #[test]
    fn fresh_doc_cannot_undo() {
        let d = Document::from_markdown("hi\n").unwrap();
        assert!(!d.can_undo());
        assert!(!d.can_redo());
    }

    #[test]
    fn new_snapshot_clears_redo_stack() {
        let mut d = Document::from_markdown("hello\n").unwrap();
        d.snapshot();
        d.insert_char_at_cursor('A');
        d.undo();
        assert!(d.can_redo());
        // A new edit invalidates the redo branch.
        d.snapshot();
        d.insert_char_at_cursor('B');
        assert!(!d.can_redo());
    }
}
