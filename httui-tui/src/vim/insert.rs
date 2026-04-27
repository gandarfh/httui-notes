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
            offset,
        } => {
            let Some(raw) = block_raw(doc, segment_idx) else {
                return;
            };
            let line_start = line_start_of_offset(&raw, offset);
            if offset > line_start {
                doc.set_cursor(Cursor::InBlock {
                    segment_idx,
                    offset: offset - 1,
                });
            }
        }
        Cursor::InBlockResult { .. } => {}
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
            offset,
        } => {
            // `a` lands one past the cursor on the EOL position so
            // typing extends the line. Walk the raw rope as if it
            // were prose: header / body / closer all participate.
            let Some(raw) = block_raw(doc, segment_idx) else {
                return;
            };
            let total = raw.len_chars();
            if offset >= total {
                return;
            }
            if raw.char(offset) == '\n' {
                return;
            }
            doc.set_cursor(Cursor::InBlock {
                segment_idx,
                offset: offset + 1,
            });
        }
        Cursor::InBlockResult { .. } => {}
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
            let i = scan_first_non_blank(rope, offset);
            doc.set_cursor(Cursor::InProse {
                segment_idx,
                offset: i,
            });
        }
        Cursor::InBlock {
            segment_idx,
            offset,
        } => {
            let Some(raw) = block_raw(doc, segment_idx) else {
                return;
            };
            let i = scan_first_non_blank(&raw, offset);
            doc.set_cursor(Cursor::InBlock {
                segment_idx,
                offset: i,
            });
        }
        Cursor::InBlockResult { .. } => {}
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
            let i = line_end_of_offset(rope, offset);
            doc.set_cursor(Cursor::InProse {
                segment_idx,
                offset: i,
            });
        }
        Cursor::InBlock {
            segment_idx,
            offset,
        } => {
            let Some(raw) = block_raw(doc, segment_idx) else {
                return;
            };
            let i = line_end_of_offset(&raw, offset);
            doc.set_cursor(Cursor::InBlock {
                segment_idx,
                offset: i,
            });
        }
        Cursor::InBlockResult { .. } => {}
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
            segment_idx,
            offset,
        } => {
            let Some(raw) = block_raw(doc, segment_idx) else {
                return;
            };
            let line_start = line_start_of_offset(&raw, offset);
            // Move to col 0 of current line, insert newline (cursor
            // advances by 1), then jump back up to the now-empty
            // new line at the same offset.
            doc.set_cursor(Cursor::InBlock {
                segment_idx,
                offset: line_start,
            });
            doc.insert_char_at_cursor('\n');
            doc.set_cursor(Cursor::InBlock {
                segment_idx,
                offset: line_start,
            });
        }
        Cursor::InBlockResult { .. } => {}
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
            segment_idx,
            offset,
        } => {
            let Some(raw) = block_raw(doc, segment_idx) else {
                return;
            };
            // Land on EOL of current line, then `\n` pushes us to
            // the start of a new line. Works for header / body /
            // closer alike.
            let line_end = line_end_of_offset(&raw, offset);
            doc.set_cursor(Cursor::InBlock {
                segment_idx,
                offset: line_end,
            });
            doc.insert_char_at_cursor('\n');
        }
        Cursor::InBlockResult { .. } => {}
    }
}

fn block_raw(doc: &Document, segment_idx: usize) -> Option<Rope> {
    let seg = doc.segments().get(segment_idx)?;
    let Segment::Block(b) = seg else { return None };
    Some(b.raw.clone())
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

fn scan_first_non_blank(rope: &Rope, offset: usize) -> usize {
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
    i
}
