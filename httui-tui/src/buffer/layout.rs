//! Vertical layout for document segments.
//!
//! Each [`Segment`](crate::buffer::Segment) gets a fixed height per draw,
//! computed from its kind and current contents. Layout is recomputed
//! every frame — cheap until documents grow big, optimisation can wait.

use crate::buffer::block::{BlockNode, ExecutionState};
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
/// blocks); current heuristic ignores it.
pub fn segment_height(seg: &Segment, _width: u16) -> u16 {
    match seg {
        Segment::Prose(rope) => rope.len_lines().max(1) as u16,
        Segment::Block(b) => block_height(b),
    }
}

fn block_height(b: &BlockNode) -> u16 {
    if b.is_http() {
        // border + URL line + meta line + border
        4
    } else if b.is_db() {
        let lines = b
            .params
            .get("query")
            .and_then(|v| v.as_str())
            .map(|s| s.lines().count().max(1))
            .unwrap_or(1);
        // border + lines + footer + border (+ 1 for run-status line
        // once the block has executed at least once + N for the
        // result table when present).
        let run_line = if matches!(b.state, ExecutionState::Idle) { 0 } else { 1 };
        let table_lines = db_table_height(b);
        (lines as u16).saturating_add(3 + run_line + table_lines)
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
        4
    }
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
pub fn layout_document(doc: &Document, viewport_width: u16) -> Vec<SegmentLayout> {
    let mut out = Vec::with_capacity(doc.segment_count());
    let mut y: u16 = 0;
    for (idx, seg) in doc.segments().iter().enumerate() {
        let height = segment_height(seg, viewport_width);
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
}
