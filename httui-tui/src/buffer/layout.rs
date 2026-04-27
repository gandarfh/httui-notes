//! Vertical layout for document segments.
//!
//! Each [`Segment`](crate::buffer::Segment) gets a fixed height per draw,
//! computed from its kind and current contents. Layout is recomputed
//! every frame — cheap until documents grow big, optimisation can wait.

use crate::buffer::block::{BlockNode, ExecutionState};
use crate::buffer::cursor::Cursor;
use crate::buffer::document::Document;
use crate::buffer::segment::Segment;

/// Resolved position of a segment inside the rendered document.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SegmentLayout {
    pub segment_idx: usize,
    pub y_start: u16,
    pub height: u16,
}

/// Lines a segment will occupy in the editor area.
///
/// Width is accepted for forward-compat (prose wrap, multi-column
/// blocks); current heuristic ignores it. `cursor_on_block` is a
/// signal the *renderer* uses to swap chrome (bordered card vs raw
/// fence text); both modes occupy the same number of rows so cursor
/// motion doesn't reflow the document on enter/leave.
pub fn segment_height(seg: &Segment, _width: u16, _cursor_on_block: bool) -> u16 {
    match seg {
        Segment::Prose(rope) => rope.len_lines().max(1) as u16,
        Segment::Block(b) => block_height(b),
    }
}

fn block_height(b: &BlockNode) -> u16 {

    let card = if b.is_http() {
        // border + URL line + meta line + border
        4u16
    } else if b.is_db() {
        let mode = b.effective_display_mode();
        // SQL body lines — counted only when Input or Split asks for
        // them; Output mode hides the editable body entirely.
        let sql_lines = if mode.shows_input() {
            b.params
                .get("query")
                .and_then(|v| v.as_str())
                .map(|s| s.lines().count().max(1))
                .unwrap_or(1) as u16
        } else {
            0
        };
        // Run-status banner + result table — only shown when Output
        // or Split. Status banner appears as soon as the block has
        // executed at least once (matches `db_result_line` in the
        // renderer); the table appears when there are rows to show.
        let (run_line, table_lines) = if mode.shows_output() {
            let run = if matches!(b.state, ExecutionState::Idle) { 0 } else { 1 };
            (run, db_table_height(b))
        } else {
            (0, 0)
        };
        // 3 chrome (top border + footer + bottom border) +
        // optional sections. Tab bar (Result/Messages/Plan/Stats) is
        // carved out of `table_lines` by the renderer, so it doesn't
        // need its own row here — keeps behavior identical to the
        // pre-display-mode layout for Split / Output users.
        sql_lines
            .saturating_add(3)
            .saturating_add(run_line)
            .saturating_add(table_lines)
    } else if b.is_e2e() {
        let steps = b
            .params
            .get("steps")
            .and_then(|v| v.as_array())
            .map(|a| a.len())
            .unwrap_or(0);
        // border + steps + base_url line + border
        (steps as u16).saturating_add(3)
    } else {
        4u16
    };
    card
}

/// How tall the DB result `Table` widget paints inside the card.
/// Must mirror `ui::blocks::db_result_table_height` so the segment's
/// reserved height matches what the renderer actually fills.
fn db_table_height(b: &BlockNode) -> u16 {
    const MAX_VISIBLE: usize = 10;
    let Some(result) = b.cached_result.as_ref() else {
        return 0;
    };
    let Some(first) = result
        .get("results")
        .and_then(|v| v.as_array())
        .and_then(|a| a.first())
    else {
        return 0;
    };
    if first.get("kind").and_then(|v| v.as_str()) != Some("select") {
        return 0;
    }
    let row_count = first
        .get("rows")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    if row_count == 0 {
        // Header only.
        return 1;
    }
    // Cap at the viewport size — extra rows are reachable via scroll,
    // not by growing the card.
    let visible = row_count.min(MAX_VISIBLE);
    (1 + visible) as u16 // +1 for header
}

/// Walk all segments and produce their `(idx, y_start, height)` triples.
/// The block under the cursor reserves two extra rows so the renderer
/// can paint the fence header / closer in raw view.
pub fn layout_document(doc: &Document, viewport_width: u16) -> Vec<SegmentLayout> {
    let cursor_seg = match doc.cursor() {
        Cursor::InBlock { segment_idx, .. }
        | Cursor::InBlockResult { segment_idx, .. }
        | Cursor::InBlockFence { segment_idx, .. } => Some(segment_idx),
        _ => None,
    };
    let mut out = Vec::with_capacity(doc.segment_count());
    let mut y: u16 = 0;
    for (idx, seg) in doc.segments().iter().enumerate() {
        let cursor_on_block = cursor_seg == Some(idx);
        let height = segment_height(seg, viewport_width, cursor_on_block);
        out.push(SegmentLayout {
            segment_idx: idx,
            y_start: y,
            height,
        });
        y = y.saturating_add(height);
    }
    out
}

/// Total document height in cells. Useful for clamping the viewport.
pub fn document_height(layouts: &[SegmentLayout]) -> u16 {
    layouts
        .last()
        .map(|l| l.y_start.saturating_add(l.height))
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::buffer::Document;

    #[test]
    fn prose_height_is_line_count() {
        let doc = Document::from_markdown("a\nb\nc\n").unwrap();
        let layouts = layout_document(&doc, 80);
        assert_eq!(layouts.len(), 1);
        assert!(layouts[0].height >= 3);
    }

    #[test]
    fn http_block_is_four_lines() {
        let md = "```http alias=h\n{\"method\":\"GET\",\"url\":\"https://x.com\",\"params\":[],\"headers\":[],\"body\":\"\"}\n```\n";
        let doc = Document::from_markdown(md).unwrap();
        let layouts = layout_document(&doc, 80);
        assert_eq!(layouts.iter().find(|l| {
            matches!(doc.segments()[l.segment_idx], crate::buffer::Segment::Block(_))
        }).unwrap().height, 4);
    }

    #[test]
    fn db_block_height_grows_with_query() {
        let md = "```db-postgres alias=q\nSELECT *\nFROM users\nWHERE id > 10\n```\n";
        let doc = Document::from_markdown(md).unwrap();
        let layouts = layout_document(&doc, 80);
        let block_h = layouts
            .iter()
            .find(|l| matches!(doc.segments()[l.segment_idx], crate::buffer::Segment::Block(_)))
            .unwrap()
            .height;
        // 3 lines of SQL + 3 chrome (border + footer + border)
        assert_eq!(block_h, 6);
    }

    #[test]
    fn e2e_block_height_grows_with_steps() {
        let md = "```e2e alias=f\n{\"base_url\":\"https://x.com\",\"steps\":[{\"name\":\"a\"},{\"name\":\"b\"}]}\n```\n";
        let doc = Document::from_markdown(md).unwrap();
        let layouts = layout_document(&doc, 80);
        let block_h = layouts
            .iter()
            .find(|l| matches!(doc.segments()[l.segment_idx], crate::buffer::Segment::Block(_)))
            .unwrap()
            .height;
        // 2 steps + 3 chrome
        assert_eq!(block_h, 5);
    }

    #[test]
    fn y_start_is_cumulative() {
        let md = "intro\n\n```http\n{\"method\":\"GET\",\"url\":\"https://x.com\",\"params\":[],\"headers\":[],\"body\":\"\"}\n```\n\noutro\n";
        let doc = Document::from_markdown(md).unwrap();
        let layouts = layout_document(&doc, 80);
        let mut expected_y = 0u16;
        for l in &layouts {
            assert_eq!(l.y_start, expected_y);
            expected_y = expected_y.saturating_add(l.height);
        }
    }

    #[test]
    fn document_height_matches_sum() {
        let md = "abc\n```http\n{\"method\":\"GET\",\"url\":\"https://x.com\",\"params\":[],\"headers\":[],\"body\":\"\"}\n```\n";
        let doc = Document::from_markdown(md).unwrap();
        let layouts = layout_document(&doc, 80);
        let sum: u16 = layouts.iter().map(|l| l.height).sum();
        assert_eq!(document_height(&layouts), sum);
    }

    fn db_block_index(doc: &Document) -> usize {
        doc.segments()
            .iter()
            .enumerate()
            .find_map(|(i, s)| matches!(s, crate::buffer::Segment::Block(_)).then_some(i))
            .expect("doc has a block")
    }

    #[test]
    fn db_output_mode_drops_sql_lines_from_height() {
        // `display=output` hides the SQL body. With no cached result
        // and no run history, the block collapses to chrome-only
        // (border + footer + border = 3 lines).
        let md = "```db-postgres alias=q\nSELECT *\nFROM users\nWHERE id > 10\n```\n";
        let mut doc = Document::from_markdown(md).unwrap();
        let idx = db_block_index(&doc);
        doc.block_at_mut(idx).unwrap().display_mode = Some("output".into());
        let layouts = layout_document(&doc, 80);
        let block_h = layouts
            .iter()
            .find(|l| l.segment_idx == idx)
            .unwrap()
            .height;
        assert_eq!(block_h, 3);
    }

    #[test]
    fn db_block_height_stays_constant_across_cursor_enter_leave() {
        // The renderer swaps chrome (bordered card → raw fence text)
        // when the cursor enters the block, but layout-wise both
        // modes occupy the same number of rows — otherwise the
        // document would reflow under the cursor on every
        // motion-into / motion-out, which is jarring.
        let md = "```db-postgres alias=q\nSELECT *\nFROM users\nWHERE id > 10\n```\n";
        let mut doc = Document::from_markdown(md).unwrap();
        let block_idx = doc
            .segments()
            .iter()
            .position(|s| matches!(s, crate::buffer::Segment::Block(_)))
            .unwrap();
        doc.set_cursor(crate::buffer::Cursor::InBlock {
            segment_idx: block_idx,
            line: 0,
            offset: 0,
        });
        let with_cursor = layout_document(&doc, 80)
            .iter()
            .find(|l| l.segment_idx == block_idx)
            .unwrap()
            .height;
        doc.set_cursor(crate::buffer::Cursor::InProse {
            segment_idx: 0,
            offset: 0,
        });
        let without_cursor = layout_document(&doc, 80)
            .iter()
            .find(|l| l.segment_idx == block_idx)
            .unwrap()
            .height;
        assert_eq!(with_cursor, without_cursor);
    }

    #[test]
    fn db_split_mode_with_result_includes_sql_status_and_table() {
        // `display=split` with a `select` result: SQL body (3 lines)
        // + status banner (1) + result table (header + 2 rows) +
        // chrome (3) = 10.
        let md = "```db-postgres alias=q\nSELECT *\nFROM users\nWHERE id > 10\n```\n";
        let mut doc = Document::from_markdown(md).unwrap();
        let idx = db_block_index(&doc);
        let block = doc.block_at_mut(idx).unwrap();
        block.display_mode = Some("split".into());
        block.state = ExecutionState::Success;
        block.cached_result = Some(serde_json::json!({
            "results": [{
                "kind": "select",
                "columns": [{"name": "id"}],
                "rows": [{"id": 1}, {"id": 2}],
                "has_more": false
            }],
            "stats": { "elapsed_ms": 7 }
        }));
        let layouts = layout_document(&doc, 80);
        let block_h = layouts
            .iter()
            .find(|l| l.segment_idx == idx)
            .unwrap()
            .height;
        assert_eq!(block_h, 3 + 1 + (1 + 2) + 3);
    }
}
