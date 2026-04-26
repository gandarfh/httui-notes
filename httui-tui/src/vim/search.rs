//! Plain substring search across prose segments. Round 3 doesn't ship
//! regex — `pattern` is matched literally against the rope content.
//! Block segments are skipped (their contents render via specialized
//! widgets and don't participate in the body text flow).

use crate::buffer::{Cursor, Document, Segment};

/// Vim's `smartcase`: a pattern with no uppercase letters matches
/// case-insensitively; once any uppercase appears, it's literal.
pub fn is_case_sensitive(pattern: &str) -> bool {
    pattern.chars().any(|c| c.is_uppercase())
}

/// Find every char-range match of `pattern` inside `line`, with
/// smartcase folding when `case_sensitive == false`. Returns
/// `(char_start, char_end)` pairs — exclusive end. Used by the search
/// highlight overlay.
pub fn find_matches_in_line(
    line: &str,
    pattern: &str,
    case_sensitive: bool,
) -> Vec<(usize, usize)> {
    let mut out = Vec::new();
    if pattern.is_empty() {
        return out;
    }
    let needle: String = if case_sensitive {
        pattern.to_string()
    } else {
        pattern.to_lowercase()
    };
    let haystack: String = if case_sensitive {
        line.to_string()
    } else {
        line.to_lowercase()
    };
    let needle_chars = needle.chars().count();
    let mut byte_cursor = 0;
    while byte_cursor <= haystack.len() {
        let Some(found) = haystack[byte_cursor..].find(&needle) else {
            break;
        };
        let abs_byte = byte_cursor + found;
        let char_start = haystack[..abs_byte].chars().count();
        out.push((char_start, char_start + needle_chars));
        // Advance past this match (in bytes — needle is the same in
        // both haystack and needle representations).
        byte_cursor = abs_byte + needle.len().max(1);
    }
    out
}

/// Search for `pattern` starting after `doc.cursor()`. Wraps to the
/// document start on the first miss. Returns the cursor for the first
/// match, or `None` if the pattern doesn't appear anywhere in prose.
/// Smartcase: insensitive unless the pattern carries an uppercase char.
pub fn search(doc: &Document, pattern: &str, forward: bool) -> Option<Cursor> {
    if pattern.is_empty() {
        return None;
    }

    let case_sensitive = is_case_sensitive(pattern);
    let needle: String = if case_sensitive {
        pattern.to_string()
    } else {
        pattern.to_lowercase()
    };
    let needle = needle.as_str();

    let fold = |s: String| -> String {
        if case_sensitive {
            s
        } else {
            s.to_lowercase()
        }
    };

    let segs = doc.segments();
    let cursor = doc.cursor();
    let (origin_seg, origin_off) = match cursor {
        Cursor::InProse {
            segment_idx,
            offset,
        } => (segment_idx, offset),
        Cursor::InBlock { segment_idx, .. } | Cursor::InBlockResult { segment_idx, .. } => {
            (segment_idx, 0)
        }
    };

    if forward {
        // Pass 1: from cursor → end.
        for (idx, seg) in segs.iter().enumerate().skip(origin_seg) {
            if let Segment::Prose(rope) = seg {
                let text = fold(rope.to_string());
                let start = if idx == origin_seg {
                    // Move past the cursor so successive `n` makes progress.
                    char_to_byte(&text, origin_off + 1)
                } else {
                    0
                };
                if start <= text.len() {
                    if let Some(byte_off) = text[start..].find(needle) {
                        let abs_byte = start + byte_off;
                        let char_off = byte_to_char(&text, abs_byte);
                        return Some(Cursor::InProse {
                            segment_idx: idx,
                            offset: char_off,
                        });
                    }
                }
            }
        }
        // Pass 2: wrap to start → cursor. Search the *whole* segment;
        // if the first match in `origin_seg` falls past the cursor, no
        // earlier match exists and we move on. (Pass 1 already covered
        // matches strictly after the cursor.)
        for (idx, seg) in segs.iter().enumerate().take(origin_seg + 1) {
            if let Segment::Prose(rope) = seg {
                let text = fold(rope.to_string());
                if let Some(byte_off) = text.find(needle) {
                    let char_off = byte_to_char(&text, byte_off);
                    if idx != origin_seg || char_off <= origin_off {
                        return Some(Cursor::InProse {
                            segment_idx: idx,
                            offset: char_off,
                        });
                    }
                }
            }
        }
        None
    } else {
        // Backward: rfind from cursor → start.
        for idx in (0..=origin_seg).rev() {
            if let Some(Segment::Prose(rope)) = segs.get(idx) {
                let text = fold(rope.to_string());
                let bound = if idx == origin_seg {
                    char_to_byte(&text, origin_off)
                } else {
                    text.len()
                };
                if let Some(byte_off) = text[..bound].rfind(needle) {
                    let char_off = byte_to_char(&text, byte_off);
                    return Some(Cursor::InProse {
                        segment_idx: idx,
                        offset: char_off,
                    });
                }
            }
        }
        // Wrap from end → cursor. Search the *whole* segment with
        // `rfind`; for the origin segment we only accept matches at or
        // after the cursor (Pass 1 already covered earlier matches).
        for idx in (origin_seg..segs.len()).rev() {
            if let Some(Segment::Prose(rope)) = segs.get(idx) {
                let text = fold(rope.to_string());
                if let Some(byte_off) = text.rfind(needle) {
                    let char_off = byte_to_char(&text, byte_off);
                    if idx != origin_seg || char_off >= origin_off {
                        return Some(Cursor::InProse {
                            segment_idx: idx,
                            offset: char_off,
                        });
                    }
                }
            }
        }
        None
    }
}

fn char_to_byte(text: &str, char_idx: usize) -> usize {
    text.char_indices()
        .nth(char_idx)
        .map(|(b, _)| b)
        .unwrap_or(text.len())
}

fn byte_to_char(text: &str, byte_idx: usize) -> usize {
    text[..byte_idx.min(text.len())].chars().count()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::buffer::Document;

    fn doc(md: &str) -> Document {
        Document::from_markdown(md).unwrap()
    }

    #[test]
    fn forward_finds_after_cursor() {
        let d = doc("alpha bravo charlie\n");
        let cursor = search(&d, "bravo", true).unwrap();
        match cursor {
            Cursor::InProse { offset, .. } => assert_eq!(offset, 6),
            _ => panic!(),
        }
    }

    #[test]
    fn forward_wraps_to_start() {
        let mut d = doc("alpha bravo charlie\n");
        d.set_cursor(Cursor::InProse {
            segment_idx: 0,
            offset: 15,
        });
        let cursor = search(&d, "alpha", true).unwrap();
        match cursor {
            Cursor::InProse { offset, .. } => assert_eq!(offset, 0),
            _ => panic!(),
        }
    }

    #[test]
    fn backward_finds_before_cursor() {
        let mut d = doc("alpha bravo charlie\n");
        d.set_cursor(Cursor::InProse {
            segment_idx: 0,
            offset: 15,
        });
        let cursor = search(&d, "alpha", false).unwrap();
        match cursor {
            Cursor::InProse { offset, .. } => assert_eq!(offset, 0),
            _ => panic!(),
        }
    }

    #[test]
    fn empty_pattern_returns_none() {
        let d = doc("hello\n");
        assert!(search(&d, "", true).is_none());
    }

    #[test]
    fn no_match_returns_none() {
        let d = doc("hello\n");
        assert!(search(&d, "xyz", true).is_none());
    }

    #[test]
    fn search_does_not_match_inside_blocks() {
        let md = "intro\n\n```http alias=h\n{\"method\":\"GET\",\"url\":\"https://api.example.com\",\"params\":[],\"headers\":[],\"body\":\"\"}\n```\n\noutro\n";
        let d = doc(md);
        // `api.example.com` is *inside* the block JSON — must not match.
        assert!(search(&d, "api.example.com", true).is_none());
        // But "outro" lives in a prose segment after the block.
        assert!(search(&d, "outro", true).is_some());
    }

    // ─── smartcase ───

    #[test]
    fn smartcase_lowercase_pattern_is_insensitive() {
        let d = doc("Hello WORLD\n");
        // Lowercase pattern matches uppercase text.
        let cursor = search(&d, "hello", true).unwrap();
        match cursor {
            Cursor::InProse { offset, .. } => assert_eq!(offset, 0),
            _ => panic!(),
        }
        let cursor = search(&d, "world", true).unwrap();
        match cursor {
            Cursor::InProse { offset, .. } => assert_eq!(offset, 6),
            _ => panic!(),
        }
    }

    #[test]
    fn smartcase_uppercase_pattern_is_sensitive() {
        let d = doc("hello Hello HELLO\n");
        // Pattern with uppercase only matches the exact case.
        let cursor = search(&d, "Hello", true).unwrap();
        match cursor {
            Cursor::InProse { offset, .. } => assert_eq!(offset, 6),
            _ => panic!(),
        }
        // Cursor is on H of `Hello` (offset 6); next forward search
        // jumps to `HELLO` only because the wrap-around brings `Hello`
        // back into play. Skip past Hello to assert HELLO doesn't match.
        let mut d = doc("HELLO\n");
        d.set_cursor(Cursor::InProse {
            segment_idx: 0,
            offset: 0,
        });
        assert!(search(&d, "Hello", true).is_none());
    }

    #[test]
    fn is_case_sensitive_detects_uppercase() {
        assert!(!is_case_sensitive("hello"));
        assert!(is_case_sensitive("Hello"));
        assert!(is_case_sensitive("hELLO"));
        assert!(!is_case_sensitive("123"));
    }

    // ─── per-line match enumeration (used by the highlight overlay) ───

    #[test]
    fn find_matches_returns_all_occurrences() {
        let m = find_matches_in_line("foo bar foo baz foo", "foo", true);
        assert_eq!(m, vec![(0, 3), (8, 11), (16, 19)]);
    }

    #[test]
    fn find_matches_smartcase_via_caller_flag() {
        // Caller decides — we're given `case_sensitive = false`.
        let m = find_matches_in_line("Foo FOO foo", "foo", false);
        assert_eq!(m, vec![(0, 3), (4, 7), (8, 11)]);
    }

    #[test]
    fn find_matches_empty_pattern_returns_empty() {
        let m = find_matches_in_line("hello", "", true);
        assert!(m.is_empty());
    }
}
