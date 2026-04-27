use ropey::Rope;

use crate::buffer::{Cursor, Document, Segment};
use crate::vim::parser::InsertPos;

/// Position the cursor for `EnterInsert(pos)`. The actual mode swap
/// is done by the caller.
pub fn position_for_insert(doc: &mut Document, pos: InsertPos) {
    match pos {
        InsertPos::Current => {}
        InsertPos::After => move_right_within_line(doc),
        InsertPos::LineStart => move_to_first_non_blank(doc),
        InsertPos::LineEnd => move_to_line_end(doc),
        InsertPos::LineAbove => open_line_above(doc),
        InsertPos::LineBelow => open_line_below(doc),
    }
}

/// `<Esc>` from insert: vim recoils the cursor one column unless it's
/// already at the line start.
pub fn recoil_after_exit(doc: &mut Document) {
    match doc.cursor() {
        Cursor::InProse {
            segment_idx,
            offset,
        } => {
            let rope = match doc.segments().get(segment_idx) {
                Some(Segment::Prose(r)) => r,
                _ => return,
            };
            if offset == 0 {
                return;
            }
            let line_start = line_start_of_offset(rope, offset);
            if offset > line_start {
                doc.set_cursor(Cursor::InProse {
                    segment_idx,
                    offset: offset - 1,
                });
            }
        }
        Cursor::InBlock {
            segment_idx,
            line,
            offset,
        } => {
            if offset > 0 {
                doc.set_cursor(Cursor::InBlock {
                    segment_idx,
                    line,
                    offset: offset - 1,
                });
            }
        }
        Cursor::InBlockResult { .. } => {}
        Cursor::InBlockFence { .. } => {}
    }
}

fn move_right_within_line(doc: &mut Document) {
    match doc.cursor() {
        Cursor::InProse {
            segment_idx,
            offset,
        } => {
            let rope = match doc.segments().get(segment_idx) {
                Some(Segment::Prose(r)) => r,
                _ => return,
            };
            if offset >= rope.len_chars() {
                return;
            }
            if rope.char(offset) == '\n' {
                return;
            }
            doc.set_cursor(Cursor::InProse {
                segment_idx,
                offset: offset + 1,
            });
        }
        Cursor::InBlock {
            segment_idx,
            line,
            offset,
        } => {
            // `a` lands one past the cursor — on the EOL position so
            // typing extends the line.
            let line_chars = block_query_line_text(doc, segment_idx, line)
                .map(|s| s.chars().count())
                .unwrap_or(0);
            if offset < line_chars {
                doc.set_cursor(Cursor::InBlock {
                    segment_idx,
                    line,
                    offset: offset + 1,
                });
            }
        }
        Cursor::InBlockResult { .. } => {}
        Cursor::InBlockFence { .. } => {}
    }
}

fn move_to_first_non_blank(doc: &mut Document) {
    match doc.cursor() {
        Cursor::InProse {
            segment_idx,
            offset,
        } => {
            let rope = match doc.segments().get(segment_idx) {
                Some(Segment::Prose(r)) => r,
                _ => return,
            };
            let start = line_start_of_offset(rope, offset);
            let total = rope.len_chars();
            let mut i = start;
            while i < total {
                let c = rope.char(i);
                if c == '\n' || !c.is_whitespace() {
                    break;
                }
                i += 1;
            }
            doc.set_cursor(Cursor::InProse {
                segment_idx,
                offset: i,
            });
        }
        Cursor::InBlock {
            segment_idx,
            line,
            ..
        } => {
            let text = block_query_line_text(doc, segment_idx, line).unwrap_or_default();
            let off = text.chars().take_while(|c| c.is_whitespace()).count();
            doc.set_cursor(Cursor::InBlock {
                segment_idx,
                line,
                offset: off,
            });
        }
        Cursor::InBlockResult { .. } => {}
        Cursor::InBlockFence { .. } => {}
    }
}

fn move_to_line_end(doc: &mut Document) {
    match doc.cursor() {
        Cursor::InProse {
            segment_idx,
            offset,
        } => {
            let rope = match doc.segments().get(segment_idx) {
                Some(Segment::Prose(r)) => r,
                _ => return,
            };
            let total = rope.len_chars();
            let mut i = offset;
            while i < total && rope.char(i) != '\n' {
                i += 1;
            }
            doc.set_cursor(Cursor::InProse {
                segment_idx,
                offset: i,
            });
        }
        Cursor::InBlock {
            segment_idx,
            line,
            ..
        } => {
            let chars = block_query_line_text(doc, segment_idx, line)
                .map(|s| s.chars().count())
                .unwrap_or(0);
            doc.set_cursor(Cursor::InBlock {
                segment_idx,
                line,
                offset: chars,
            });
        }
        Cursor::InBlockResult { .. } => {}
        Cursor::InBlockFence { .. } => {}
    }
}

/// Insert a fresh line above the current one and place the cursor on
/// the new (empty) line. Mirrors vim `O`.
fn open_line_above(doc: &mut Document) {
    match doc.cursor() {
        Cursor::InProse {
            segment_idx,
            offset,
        } => {
            let line_start = match doc.segments().get(segment_idx) {
                Some(Segment::Prose(r)) => line_start_of_offset(r, offset),
                _ => return,
            };
            doc.set_cursor(Cursor::InProse {
                segment_idx,
                offset: line_start,
            });
            doc.insert_char_at_cursor('\n');
            doc.set_cursor(Cursor::InProse {
                segment_idx,
                offset: line_start,
            });
        }
        Cursor::InBlock {
            segment_idx, line, ..
        } => {
            // Move to col 0 of current line, insert newline (cursor
            // advances down), then jump back up to the now-empty new line.
            doc.set_cursor(Cursor::InBlock {
                segment_idx,
                line,
                offset: 0,
            });
            doc.insert_char_at_cursor('\n');
            doc.set_cursor(Cursor::InBlock {
                segment_idx,
                line,
                offset: 0,
            });
        }
        Cursor::InBlockResult { .. } => {}
        Cursor::InBlockFence { .. } => {}
    }
}

/// Insert a fresh line below the current one and place the cursor on
/// it. Mirrors vim `o`.
fn open_line_below(doc: &mut Document) {
    match doc.cursor() {
        Cursor::InProse {
            segment_idx,
            offset,
        } => {
            let line_end_offset = match doc.segments().get(segment_idx) {
                Some(Segment::Prose(r)) => line_end_of_offset(r, offset),
                _ => return,
            };
            doc.set_cursor(Cursor::InProse {
                segment_idx,
                offset: line_end_offset,
            });
            doc.insert_char_at_cursor('\n');
        }
        Cursor::InBlock {
            segment_idx, line, ..
        } => {
            let line_chars = block_query_line_text(doc, segment_idx, line)
                .map(|s| s.chars().count())
                .unwrap_or(0);
            // Land on EOL of current line, then `\n` pushes us to the
            // start of a new line.
            doc.set_cursor(Cursor::InBlock {
                segment_idx,
                line,
                offset: line_chars,
            });
            doc.insert_char_at_cursor('\n');
        }
        Cursor::InBlockResult { .. } => {}
        Cursor::InBlockFence { .. } => {}
    }
}

/// Helper: text of a single SQL line in a block.
fn block_query_line_text(doc: &Document, segment_idx: usize, line: usize) -> Option<String> {
    let seg = doc.segments().get(segment_idx)?;
    let Segment::Block(b) = seg else { return None };
    b.params
        .get("query")
        .and_then(|v| v.as_str())
        .and_then(|s| s.lines().nth(line).map(|l| l.to_string()))
}

fn line_start_of_offset(rope: &Rope, offset: usize) -> usize {
    let off = offset.min(rope.len_chars());
    let line = rope.char_to_line(off);
    rope.line_to_char(line)
}

fn line_end_of_offset(rope: &Rope, offset: usize) -> usize {
    let total = rope.len_chars();
    let mut i = offset.min(total);
    while i < total && rope.char(i) != '\n' {
        i += 1;
    }
    i
}
