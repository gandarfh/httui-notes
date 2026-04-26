//! Tiny single-line editable buffer with a UTF-8-safe cursor.
//!
//! Used by every modal prompt (cmdline `:`, search `/`/`?`, quick-open
//! input, tree create/rename/delete). Each prompt owns one [`LineEdit`]
//! and forwards keystrokes to the methods here so insertion happens
//! at the cursor (not always at the end), and so Left/Right/Home/End
//! navigate as users expect.
//!
//! `cursor` is a *byte* offset into `buffer`; the move functions step
//! along char boundaries so multibyte UTF-8 sequences stay intact.

#[derive(Debug, Default, Clone)]
pub struct LineEdit {
    pub buffer: String,
    pub cursor: usize,
}

impl LineEdit {
    pub fn new() -> Self {
        Self::default()
    }

    /// Construct a [`LineEdit`] pre-filled with `text`. Cursor lands
    /// at the end so the user can append (or use Home to start over).
    pub fn from_str(text: impl Into<String>) -> Self {
        let buffer = text.into();
        let cursor = buffer.len();
        Self { buffer, cursor }
    }

    pub fn clear(&mut self) {
        self.buffer.clear();
        self.cursor = 0;
    }

    pub fn is_empty(&self) -> bool {
        self.buffer.is_empty()
    }

    /// Take ownership of the buffer (leaving an empty one behind).
    /// Used by `:`-execute / `/`-execute paths to consume the typed
    /// command without an extra clone.
    pub fn take(&mut self) -> String {
        self.cursor = 0;
        std::mem::take(&mut self.buffer)
    }

    /// Borrow the buffer as `&str` (read-only). Most rendering paths
    /// just want the text and don't care about the cursor.
    pub fn as_str(&self) -> &str {
        &self.buffer
    }

    pub fn insert_char(&mut self, c: char) {
        self.buffer.insert(self.cursor, c);
        self.cursor += c.len_utf8();
    }

    /// Delete the char immediately before the cursor. Returns `false`
    /// when the cursor is already at column 0 — callers use that to
    /// fall back to a "cancel" behavior on empty-buffer backspace.
    pub fn delete_before(&mut self) -> bool {
        if self.cursor == 0 {
            return false;
        }
        let prev = prev_boundary(&self.buffer, self.cursor);
        self.buffer.replace_range(prev..self.cursor, "");
        self.cursor = prev;
        true
    }

    pub fn delete_after(&mut self) -> bool {
        if self.cursor >= self.buffer.len() {
            return false;
        }
        let next = next_boundary(&self.buffer, self.cursor);
        self.buffer.replace_range(self.cursor..next, "");
        true
    }

    pub fn move_left(&mut self) {
        self.cursor = prev_boundary(&self.buffer, self.cursor);
    }

    pub fn move_right(&mut self) {
        self.cursor = next_boundary(&self.buffer, self.cursor);
    }

    pub fn move_home(&mut self) {
        self.cursor = 0;
    }

    pub fn move_end(&mut self) {
        self.cursor = self.buffer.len();
    }

    /// Char-column of the cursor. Renderers use this to place the
    /// terminal caret correctly even when the buffer contains
    /// multibyte UTF-8.
    pub fn cursor_col(&self) -> usize {
        self.buffer[..self.cursor.min(self.buffer.len())]
            .chars()
            .count()
    }
}

fn prev_boundary(s: &str, mut i: usize) -> usize {
    if i == 0 {
        return 0;
    }
    i -= 1;
    while !s.is_char_boundary(i) {
        i -= 1;
    }
    i
}

fn next_boundary(s: &str, mut i: usize) -> usize {
    let len = s.len();
    if i >= len {
        return len;
    }
    i += 1;
    while i < len && !s.is_char_boundary(i) {
        i += 1;
    }
    i
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn insert_advances_cursor() {
        let mut e = LineEdit::new();
        e.insert_char('a');
        e.insert_char('b');
        assert_eq!(e.buffer, "ab");
        assert_eq!(e.cursor, 2);
    }

    #[test]
    fn move_left_then_insert() {
        let mut e = LineEdit::from_str("hello");
        e.move_left();
        e.move_left();
        // Cursor between 'l' and 'l' — wait, "hello" len=5, end=5, two
        // left lands at 3, between 'l' and 'o'.
        e.insert_char('X');
        assert_eq!(e.buffer, "helXlo");
        assert_eq!(e.cursor, 4);
    }

    #[test]
    fn delete_before_with_utf8() {
        // Em dash is 3 bytes — `delete_before` must remove the whole
        // char, not corrupt it.
        let mut e = LineEdit::from_str("a—b");
        // cursor at end (5 bytes); back over 'b' (1 byte)
        e.delete_before();
        assert_eq!(e.buffer, "a—");
        // Now back over '—' (3 bytes)
        e.delete_before();
        assert_eq!(e.buffer, "a");
    }

    #[test]
    fn move_right_walks_utf8_chars() {
        let mut e = LineEdit::from_str("a—b");
        e.move_home();
        assert_eq!(e.cursor, 0);
        e.move_right(); // past 'a'
        assert_eq!(e.cursor, 1);
        e.move_right(); // past '—' (3 bytes)
        assert_eq!(e.cursor, 4);
        e.move_right(); // past 'b'
        assert_eq!(e.cursor, 5);
        e.move_right(); // clamped to end
        assert_eq!(e.cursor, 5);
    }

    #[test]
    fn cursor_col_counts_chars_not_bytes() {
        let mut e = LineEdit::from_str("a—");
        // cursor at byte 4 → col 2 (2 chars)
        assert_eq!(e.cursor_col(), 2);
        e.move_left();
        // cursor at byte 1 → col 1
        assert_eq!(e.cursor_col(), 1);
    }

    #[test]
    fn delete_before_at_zero_returns_false() {
        let mut e = LineEdit::new();
        assert!(!e.delete_before());
    }
}
