//! Text-object range computation. Operates on a single prose segment;
//! returns char ranges that the operator engine then deletes / changes
//! / yanks.
//!
//! Three families:
//! - **Word** (`iw`/`aw`): a run of same-class chars. Vim treats word
//!   chars (alphanumeric + `_`), punctuation, and whitespace as three
//!   distinct classes — a "word" is any run of one class.
//! - **Quote** (`i"`/`a"`/`i'`/`a'`/`` i` ``/`` a` ``): the text between
//!   the nearest pair of matching delimiters on the current line.
//! - **Pair** (`i(`/`a(`/`i{`/`a{`/`i[`/`a[`/`i<`/`a<`): the text
//!   between balanced bracket pairs (nested, multi-line OK).

use ropey::Rope;

use crate::buffer::{Cursor, Document, Segment};
use crate::vim::parser::TextObject;

/// Compute the char range `(segment_idx, start, end)` for a text object.
/// `end` is exclusive. Returns `None` for non-prose cursor positions or
/// when no matching object is found around the cursor.
pub fn compute_range(textobj: TextObject, doc: &Document) -> Option<(usize, usize, usize)> {
    let Cursor::InProse {
        segment_idx,
        offset,
    } = doc.cursor()
    else {
        return None;
    };
    let rope = match doc.segments().get(segment_idx)? {
        Segment::Prose(r) => r,
        _ => return None,
    };
    let total = rope.len_chars();
    if total == 0 {
        return None;
    }
    let cursor = offset.min(total.saturating_sub(1));

    let (start, end) = match textobj {
        TextObject::Word { around } => word_range(rope, cursor, around)?,
        TextObject::Quote { delim, around } => quote_range(rope, cursor, delim, around)?,
        TextObject::Pair {
            open,
            close,
            around,
        } => pair_range(rope, cursor, open, close, around)?,
    };

    if end <= start {
        return None;
    }
    Some((segment_idx, start, end))
}

// ───────────── word ─────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CharClass {
    Word,
    Punct,
    Space,
    Newline,
}

fn class(c: char) -> CharClass {
    if c == '\n' {
        CharClass::Newline
    } else if c.is_whitespace() {
        CharClass::Space
    } else if c.is_alphanumeric() || c == '_' {
        CharClass::Word
    } else {
        CharClass::Punct
    }
}

fn word_range(rope: &Rope, cursor: usize, around: bool) -> Option<(usize, usize)> {
    let total = rope.len_chars();
    let cls = class(rope.char(cursor));
    if cls == CharClass::Newline {
        return None;
    }

    // Run boundaries (same class, line-bound).
    let mut start = cursor;
    while start > 0 {
        let prev = rope.char(start - 1);
        if class(prev) != cls {
            break;
        }
        start -= 1;
    }
    let mut end = cursor + 1;
    while end < total {
        if class(rope.char(end)) != cls {
            break;
        }
        end += 1;
    }

    if !around {
        return Some((start, end));
    }

    // `aw`: extend to trailing whitespace (preferred), else leading.
    if cls != CharClass::Space {
        let mut t = end;
        while t < total && class(rope.char(t)) == CharClass::Space {
            t += 1;
        }
        if t > end {
            return Some((start, t));
        }
        let mut l = start;
        while l > 0 && class(rope.char(l - 1)) == CharClass::Space {
            l -= 1;
        }
        return Some((l, end));
    }
    // `aw` on whitespace itself: extend onto the adjacent word too.
    // Vim attaches the trailing word; fall back to leading.
    if end < total && class(rope.char(end)) == CharClass::Word {
        let mut t = end;
        while t < total && class(rope.char(t)) == CharClass::Word {
            t += 1;
        }
        return Some((start, t));
    }
    if start > 0 && class(rope.char(start - 1)) == CharClass::Word {
        let mut l = start;
        while l > 0 && class(rope.char(l - 1)) == CharClass::Word {
            l -= 1;
        }
        return Some((l, end));
    }
    Some((start, end))
}

// ───────────── quote ─────────────

fn quote_range(rope: &Rope, cursor: usize, delim: char, around: bool) -> Option<(usize, usize)> {
    let total = rope.len_chars();
    if total == 0 {
        return None;
    }

    // Search left including the cursor's own char.
    let mut left = None;
    let mut i = cursor;
    loop {
        let c = rope.char(i);
        if c == '\n' {
            break;
        }
        if c == delim {
            left = Some(i);
            break;
        }
        if i == 0 {
            break;
        }
        i -= 1;
    }
    let left = left?;

    // Search right strictly after `left`.
    let mut right = None;
    let mut j = if cursor > left { cursor } else { left + 1 };
    // Step over the cursor itself if cursor was on `left` already, to avoid
    // matching the same delimiter twice.
    if j == left {
        j += 1;
    }
    while j < total {
        let c = rope.char(j);
        if c == '\n' {
            break;
        }
        if c == delim {
            right = Some(j);
            break;
        }
        j += 1;
    }
    let right = right?;

    if around {
        Some((left, right + 1))
    } else {
        Some((left + 1, right))
    }
}

// ───────────── pair ─────────────

fn pair_range(
    rope: &Rope,
    cursor: usize,
    open: char,
    close: char,
    around: bool,
) -> Option<(usize, usize)> {
    let total = rope.len_chars();
    if total == 0 {
        return None;
    }
    let here = rope.char(cursor);

    let opener = if here == open {
        cursor
    } else if here == close {
        // Walk left for matching open.
        let mut depth = 1;
        let mut i = cursor;
        loop {
            if i == 0 {
                return None;
            }
            i -= 1;
            let c = rope.char(i);
            if c == close {
                depth += 1;
            } else if c == open {
                depth -= 1;
                if depth == 0 {
                    break i;
                }
            }
        }
    } else {
        // Walk left counting unmatched closes; first open with depth=0 wins.
        let mut depth = 0;
        let mut found = None;
        let mut i = cursor;
        loop {
            if i == 0 {
                break;
            }
            i -= 1;
            let c = rope.char(i);
            if c == close {
                depth += 1;
            } else if c == open {
                if depth == 0 {
                    found = Some(i);
                    break;
                }
                depth -= 1;
            }
        }
        found?
    };

    // Walk right from opener+1 for matching close.
    let mut depth = 1;
    let mut j = opener + 1;
    let closer = loop {
        if j >= total {
            return None;
        }
        let c = rope.char(j);
        if c == open {
            depth += 1;
        } else if c == close {
            depth -= 1;
            if depth == 0 {
                break j;
            }
        }
        j += 1;
    };

    if around {
        Some((opener, closer + 1))
    } else {
        Some((opener + 1, closer))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::buffer::Document;

    fn doc_with_cursor(md: &str, cursor: usize) -> Document {
        let mut d = Document::from_markdown(md).unwrap();
        d.set_cursor(Cursor::InProse {
            segment_idx: 0,
            offset: cursor,
        });
        d
    }

    fn slice(d: &Document, start: usize, end: usize) -> String {
        d.text_in_segment_range(0, start, end)
    }

    // ── word ──

    #[test]
    fn iw_inside_word() {
        let d = doc_with_cursor("hello world\n", 2);
        let (_, s, e) = compute_range(TextObject::Word { around: false }, &d).expect("iw range");
        assert_eq!(slice(&d, s, e), "hello");
    }

    #[test]
    fn iw_on_punctuation_run() {
        let d = doc_with_cursor("a---b\n", 2);
        let (_, s, e) = compute_range(TextObject::Word { around: false }, &d).expect("iw range");
        assert_eq!(slice(&d, s, e), "---");
    }

    #[test]
    fn aw_extends_to_trailing_space() {
        let d = doc_with_cursor("hello world\n", 0);
        let (_, s, e) = compute_range(TextObject::Word { around: true }, &d).unwrap();
        assert_eq!(slice(&d, s, e), "hello ");
    }

    #[test]
    fn aw_falls_back_to_leading_space() {
        // Last word on the line: no trailing space, take leading.
        let d = doc_with_cursor("a hello", 2);
        let (_, s, e) = compute_range(TextObject::Word { around: true }, &d).unwrap();
        assert_eq!(slice(&d, s, e), " hello");
    }

    // ── quote ──

    #[test]
    fn iquote_returns_inner_text() {
        let d = doc_with_cursor("say \"hello\" loud", 6); // on 'e' of hello
        let (_, s, e) = compute_range(
            TextObject::Quote {
                delim: '"',
                around: false,
            },
            &d,
        )
        .unwrap();
        assert_eq!(slice(&d, s, e), "hello");
    }

    #[test]
    fn aquote_includes_delimiters() {
        let d = doc_with_cursor("say \"hello\" loud", 6);
        let (_, s, e) = compute_range(
            TextObject::Quote {
                delim: '"',
                around: true,
            },
            &d,
        )
        .unwrap();
        assert_eq!(slice(&d, s, e), "\"hello\"");
    }

    #[test]
    fn iquote_with_no_match_returns_none() {
        let d = doc_with_cursor("no quotes here", 5);
        let r = compute_range(
            TextObject::Quote {
                delim: '"',
                around: false,
            },
            &d,
        );
        assert!(r.is_none());
    }

    // ── pair ──

    #[test]
    fn iparen_inside_simple_pair() {
        let d = doc_with_cursor("call(arg)", 5); // on 'a'
        let (_, s, e) = compute_range(
            TextObject::Pair {
                open: '(',
                close: ')',
                around: false,
            },
            &d,
        )
        .unwrap();
        assert_eq!(slice(&d, s, e), "arg");
    }

    #[test]
    fn aparen_includes_brackets() {
        let d = doc_with_cursor("call(arg)", 5);
        let (_, s, e) = compute_range(
            TextObject::Pair {
                open: '(',
                close: ')',
                around: true,
            },
            &d,
        )
        .unwrap();
        assert_eq!(slice(&d, s, e), "(arg)");
    }

    #[test]
    fn iparen_handles_nesting() {
        let d = doc_with_cursor("f(a, g(b, c))", 7); // on 'b'
        let (_, s, e) = compute_range(
            TextObject::Pair {
                open: '(',
                close: ')',
                around: false,
            },
            &d,
        )
        .unwrap();
        assert_eq!(slice(&d, s, e), "b, c");
    }

    #[test]
    fn ibracket_in_markdown_link() {
        let d = doc_with_cursor("see [docs](url)", 6); // on 'o' of docs
        let (_, s, e) = compute_range(
            TextObject::Pair {
                open: '[',
                close: ']',
                around: false,
            },
            &d,
        )
        .unwrap();
        assert_eq!(slice(&d, s, e), "docs");
    }

    #[test]
    fn ibrace_picks_outermost_when_cursor_on_brace() {
        // Cursor on `{`: that's the opener; matching close is the last `}`.
        let d = doc_with_cursor("{a {b} c}", 0);
        let (_, s, e) = compute_range(
            TextObject::Pair {
                open: '{',
                close: '}',
                around: false,
            },
            &d,
        )
        .unwrap();
        assert_eq!(slice(&d, s, e), "a {b} c");
    }

    #[test]
    fn pair_returns_none_when_unmatched() {
        let d = doc_with_cursor("no pair here", 4);
        let r = compute_range(
            TextObject::Pair {
                open: '(',
                close: ')',
                around: false,
            },
            &d,
        );
        assert!(r.is_none());
    }
}
