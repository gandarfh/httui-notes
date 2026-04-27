//! Place the terminal cursor over the editor area.
//!
//! We use the real terminal cursor via [`Frame::set_cursor_position`]
//! — the shape (block / bar / underline) follows whatever the user
//! configured in their emulator, and it blinks natively. Painting
//! cells manually breaks when the chosen colors collide with the
//! terminal theme (why the cursor was invisible on dark backgrounds).
//!
//! `InBlock` lands the terminal cursor inside the block widget at the
//! requested `(line, offset)` — accounting for the 1-row top border.

use ratatui::{layout::Rect, Frame};
use ropey::Rope;

use crate::buffer::Cursor;

pub fn render_prose_cursor(
    frame: &mut Frame,
    area: Rect,
    rope: &Rope,
    cursor: Cursor,
    rope_top_line: usize,
) {
    let Cursor::InProse { offset, .. } = cursor else {
        return;
    };

    let (line_idx, col_idx) = offset_to_line_col(rope, offset);
    if line_idx < rope_top_line {
        return;
    }
    let row_in_area = (line_idx - rope_top_line) as u16;
    if row_in_area >= area.height {
        return;
    }
    if col_idx as u16 >= area.width {
        return;
    }
    let x = area.x + col_idx as u16;
    let y = area.y + row_in_area;
    frame.set_cursor_position((x, y));
}

/// Park the terminal cursor inside a focused block at the requested
/// body `(line, col)` — `line` is body-relative (line 0 = first
/// body row), `col` is the char column inside that line. Out-of-
/// area positions clamp to the visible region.
///
/// The card always renders bordered, with the fence header dropped
/// just inside the top border when the cursor is on. So the first
/// body cell is `(area.x + 1, area.y + 2)`: one column right of
/// the left border, two rows below the top border (border + fence
/// header).
pub fn render_inblock_cursor(frame: &mut Frame, area: Rect, line: usize, col: usize) {
    if area.width <= 1 || area.height <= 2 {
        return;
    }
    let max_x = area.x.saturating_add(area.width.saturating_sub(2));
    let max_y = area.y.saturating_add(area.height.saturating_sub(2));
    let x = area
        .x
        .saturating_add(1)
        .saturating_add(col as u16)
        .min(max_x);
    let y = area
        .y
        .saturating_add(2)
        .saturating_add(line as u16)
        .min(max_y);
    frame.set_cursor_position((x, y));
}

fn offset_to_line_col(rope: &Rope, offset: usize) -> (usize, usize) {
    let total = rope.len_chars();
    let off = offset.min(total);
    let line = rope.char_to_line(off);
    let line_start = rope.line_to_char(line);
    (line, off - line_start)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn offset_zero_is_origin() {
        let r = Rope::from_str("abc\ndef\n");
        assert_eq!(offset_to_line_col(&r, 0), (0, 0));
    }

    #[test]
    fn offset_after_newline_is_next_line() {
        let r = Rope::from_str("abc\ndef\n");
        // 'd' is at offset 4 (a, b, c, \n)
        assert_eq!(offset_to_line_col(&r, 4), (1, 0));
    }

    #[test]
    fn offset_clamps_at_end() {
        let r = Rope::from_str("abc\n");
        let (line, _col) = offset_to_line_col(&r, 999);
        assert!(line <= r.len_lines());
    }
}
