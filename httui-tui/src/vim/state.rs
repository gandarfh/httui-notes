use crate::buffer::Cursor;
use crate::vim::change::{ChangeRecord, InsertSession};
use crate::vim::lineedit::LineEdit;
use crate::vim::mode::Mode;
use crate::vim::parser::{Motion, Operator};
use crate::vim::quickopen::QuickOpen;
use crate::vim::register::Register;

/// Which find / till variant is waiting for its target char.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FindKind {
    /// `f<c>` — forward, inclusive.
    F,
    /// `F<c>` — backward, inclusive.
    FBack,
    /// `t<c>` — forward, lands before the char.
    T,
    /// `T<c>` — backward, lands after the char.
    TBack,
}

/// Mutable bookkeeping the parser needs across keystrokes: the current
/// mode, the in-flight count, the "pending g" flag for `gg`, the
/// pending operator (`d`/`c`/`y` waiting for a motion), the command-line
/// buffer used while in [`Mode::CommandLine`], and the unnamed yank /
/// delete register (round 2 only — named registers land in round 3).
pub struct VimState {
    pub mode: Mode,
    pub pending_count: Option<usize>,
    pub pending_g: bool,
    pub pending_operator: Option<(Operator, usize)>,
    /// `Some(true)` when `i` was pressed with a pending operator (inner
    /// text object); `Some(false)` for `a` (around). Cleared as soon as
    /// the next keystroke resolves the target char.
    pub pending_textobj_inner: Option<bool>,
    /// `f`/`F`/`t`/`T` set this; the next keystroke supplies the target
    /// char and produces a [`Motion`] (or [`super::parser::Action::OperatorMotion`]
    /// when an operator is also pending).
    pub pending_find_kind: Option<FindKind>,
    /// Last find/till motion executed. `;` repeats it; `,` runs it
    /// reversed via [`Motion::reverse_find`].
    pub last_find: Option<Motion>,
    /// Last change command — replayed by `.` repeat. Persists across
    /// resets and across mode transitions.
    pub last_change: Option<ChangeRecord>,
    /// Live capture for the in-flight insert session. Picked up on
    /// `<Esc>` to finalize a [`ChangeRecord`].
    pub insert_session: InsertSession,
    pub cmdline: LineEdit,
    /// In-flight search query (active while in [`Mode::Search`]).
    pub search_buf: LineEdit,
    /// `true` when the prompt was opened with `/`, `false` for `?`.
    pub search_forward: bool,
    /// Last executed search query, persisted for `n`/`N` repeat.
    pub last_search: Option<String>,
    /// Direction of the last executed search.
    pub last_search_forward: bool,
    /// Whether the search highlight is currently visible. `:noh` flips
    /// this off without losing `last_search` — so `n`/`N` keep working
    /// while the matches stop being painted on screen. Re-arms when a
    /// new search executes.
    pub search_highlight: bool,
    /// State for the `Ctrl+P` quick-open modal.
    pub quickopen: QuickOpen,
    pub unnamed: Register,
    /// `Ctrl+W` was just seen and we're waiting for the window-command
    /// suffix (`v`/`s`/`h`/`j`/`k`/`l`/`c`/`w`/`=` …).
    pub pending_window: bool,
    /// Anchor cursor for [`Mode::Visual`] / [`Mode::VisualLine`] — the
    /// fixed end of the selection. The moving end is the document
    /// cursor itself. `None` outside visual modes.
    pub visual_anchor: Option<Cursor>,
}

impl VimState {
    pub fn new() -> Self {
        Self {
            mode: Mode::Normal,
            pending_count: None,
            pending_g: false,
            pending_operator: None,
            pending_textobj_inner: None,
            pending_find_kind: None,
            last_find: None,
            last_change: None,
            insert_session: InsertSession::default(),
            cmdline: LineEdit::new(),
            search_buf: LineEdit::new(),
            search_forward: true,
            last_search: None,
            last_search_forward: true,
            search_highlight: true,
            quickopen: QuickOpen::default(),
            unnamed: Register::empty(),
            pending_window: false,
            visual_anchor: None,
        }
    }

    pub fn enter_insert(&mut self) {
        self.mode = Mode::Insert;
        self.reset_pending();
        self.visual_anchor = None;
    }

    pub fn enter_normal(&mut self) {
        self.mode = Mode::Normal;
        self.reset_pending();
        self.cmdline.clear();
        self.search_buf.clear();
        self.visual_anchor = None;
    }

    /// Enter charwise visual mode anchored at `at`.
    pub fn enter_visual(&mut self, at: Cursor) {
        self.mode = Mode::Visual;
        self.reset_pending();
        self.visual_anchor = Some(at);
    }

    /// Enter linewise visual mode anchored at `at`.
    pub fn enter_visual_line(&mut self, at: Cursor) {
        self.mode = Mode::VisualLine;
        self.reset_pending();
        self.visual_anchor = Some(at);
    }

    /// Enter command-line mode and seed the buffer with `:`.
    /// The leading `:` is stripped before the ex parser sees it.
    pub fn enter_cmdline(&mut self) {
        self.mode = Mode::CommandLine;
        self.reset_pending();
        self.cmdline.clear();
    }


    /// Enter search mode (`/` for forward, `?` for backward).
    pub fn enter_search(&mut self, forward: bool) {
        self.mode = Mode::Search;
        self.reset_pending();
        self.search_buf.clear();
        self.search_forward = forward;
    }

    /// Enter the `Ctrl+P` quick-open modal. The caller seeds the file
    /// list (we don't want `state.rs` reaching out to the filesystem
    /// on its own).
    pub fn enter_quickopen(&mut self, files: Vec<String>) {
        self.mode = Mode::QuickOpen;
        self.reset_pending();
        self.quickopen.reset(files);
    }

    pub fn search_push(&mut self, c: char) {
        self.search_buf.insert_char(c);
    }

    /// Returns `true` when a char was removed; `false` on an empty
    /// buffer (callers can fall back to "cancel").
    pub fn search_pop(&mut self) -> bool {
        self.search_buf.delete_before()
    }

    pub fn cmdline_push(&mut self, c: char) {
        self.cmdline.insert_char(c);
    }

    pub fn cmdline_pop(&mut self) -> bool {
        self.cmdline.delete_before()
    }

    pub fn push_digit(&mut self, d: usize) {
        let next = self.pending_count.unwrap_or(0).saturating_mul(10) + d;
        self.pending_count = Some(next);
    }

    pub fn take_count(&mut self) -> usize {
        self.pending_count.take().unwrap_or(1)
    }

    pub fn reset_pending(&mut self) {
        self.pending_count = None;
        self.pending_g = false;
        self.pending_operator = None;
        self.pending_textobj_inner = None;
        self.pending_find_kind = None;
        self.pending_window = false;
        // `last_find` intentionally persists across resets — `;` and `,`
        // can repeat a find from any subsequent normal-mode state.
    }
}

impl Default for VimState {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn push_digit_accumulates() {
        let mut s = VimState::new();
        s.push_digit(1);
        s.push_digit(2);
        s.push_digit(3);
        assert_eq!(s.pending_count, Some(123));
    }

    #[test]
    fn take_count_consumes_and_defaults_to_one() {
        let mut s = VimState::new();
        s.push_digit(5);
        assert_eq!(s.take_count(), 5);
        assert_eq!(s.pending_count, None);
        // Sem count pendente, default = 1
        assert_eq!(s.take_count(), 1);
    }

    #[test]
    fn enter_insert_clears_pending() {
        let mut s = VimState::new();
        s.push_digit(7);
        s.pending_g = true;
        s.enter_insert();
        assert_eq!(s.mode, Mode::Insert);
        assert_eq!(s.pending_count, None);
        assert!(!s.pending_g);
    }

    #[test]
    fn enter_cmdline_clears_buffer_and_pending() {
        let mut s = VimState::new();
        s.cmdline_push('g');
        s.push_digit(3);
        s.enter_cmdline();
        assert_eq!(s.mode, Mode::CommandLine);
        assert!(s.cmdline.is_empty());
        assert_eq!(s.pending_count, None);
    }

    #[test]
    fn cmdline_push_and_pop() {
        let mut s = VimState::new();
        s.enter_cmdline();
        s.cmdline_push('w');
        s.cmdline_push('q');
        assert_eq!(s.cmdline.as_str(), "wq");
        assert!(s.cmdline_pop());
        assert_eq!(s.cmdline.as_str(), "w");
    }

    #[test]
    fn enter_normal_clears_cmdline() {
        let mut s = VimState::new();
        s.enter_cmdline();
        s.cmdline_push('w');
        s.enter_normal();
        assert_eq!(s.mode, Mode::Normal);
        assert!(s.cmdline.is_empty());
    }
}
