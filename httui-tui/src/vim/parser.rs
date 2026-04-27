use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

use crate::vim::mode::Mode;
use crate::vim::state::{FindKind, VimState};

// `LineEdit` lives in `vim/lineedit.rs`; `parse_lineedit_prompt` below
// reuses it across cmdline / search / quickopen prompts.
#[allow(unused_imports)]
use crate::vim::lineedit::LineEdit;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Motion {
    Left,
    Right,
    Up,
    Down,
    LineStart,
    FirstNonBlank,
    LineEnd,
    WordForward,
    WordBackward,
    WordEnd,
    DocStart,
    DocEnd,
    GotoLine(usize),
    HalfPageDown,
    HalfPageUp,
    /// `f<c>` — jump to the next occurrence of `<c>` on the current line.
    /// Inclusive: `df<c>` deletes through `<c>`.
    FindForward(char),
    /// `F<c>` — jump to the previous occurrence on the current line.
    FindBackward(char),
    /// `t<c>` — jump to the position immediately before the next `<c>`.
    /// Inclusive: `dt<c>` deletes up to but not including `<c>`.
    TillForward(char),
    /// `T<c>` — jump to the position immediately after the previous `<c>`.
    TillBackward(char),
}

impl Motion {
    /// Reverse a find/till for `,` (repeat in opposite direction).
    /// Returns `None` for non-find motions.
    pub fn reverse_find(self) -> Option<Motion> {
        Some(match self {
            Motion::FindForward(c) => Motion::FindBackward(c),
            Motion::FindBackward(c) => Motion::FindForward(c),
            Motion::TillForward(c) => Motion::TillBackward(c),
            Motion::TillBackward(c) => Motion::TillForward(c),
            _ => return None,
        })
    }

    pub fn is_find(self) -> bool {
        matches!(
            self,
            Motion::FindForward(_)
                | Motion::FindBackward(_)
                | Motion::TillForward(_)
                | Motion::TillBackward(_)
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InsertPos {
    Current,
    After,
    LineStart,
    LineEnd,
    LineAbove,
    LineBelow,
}

/// Vim's motion classes. Determines how an operator turns the post-motion
/// cursor into a deletion range:
/// - `Exclusive`: range is `[min, max)` — `dw`, `d0`, `dh`, …
/// - `Inclusive`: range is `[min, max + 1)` — `d$`, `de`, `df<c>`, …
/// - `Linewise`: operates on whole lines — `dj`, `dk`, `dG`, `dgg`, …
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MotionClass {
    Exclusive,
    Inclusive,
    Linewise,
}

impl Motion {
    pub fn class(self) -> MotionClass {
        match self {
            Motion::Left
            | Motion::Right
            | Motion::LineStart
            | Motion::FirstNonBlank
            | Motion::WordForward
            | Motion::WordBackward => MotionClass::Exclusive,
            Motion::LineEnd
            | Motion::WordEnd
            | Motion::FindForward(_)
            | Motion::FindBackward(_)
            | Motion::TillForward(_)
            | Motion::TillBackward(_) => MotionClass::Inclusive,
            Motion::Up
            | Motion::Down
            | Motion::HalfPageDown
            | Motion::HalfPageUp
            | Motion::DocStart
            | Motion::DocEnd
            | Motion::GotoLine(_) => MotionClass::Linewise,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Operator {
    Delete,
    Change,
    Yank,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PastePos {
    /// `p` — after cursor (charwise) or below current line (linewise).
    After,
    /// `P` — at cursor (charwise) or above current line (linewise).
    Before,
}

/// Text-object kinds supported in round 3.
///
/// `around == true` matches `a<x>` (includes delimiters / trailing
/// whitespace); `around == false` matches `i<x>` (just the inner text).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TextObject {
    /// `iw` / `aw` — run of word-class chars under the cursor.
    Word { around: bool },
    /// `i"` / `a"` / `i'` / `a'` / `` i` `` / `` a` `` — string between
    /// matching delimiters on the same line.
    Quote { delim: char, around: bool },
    /// `i(` / `a(` (also `b`), `i{` / `a{` (also `B`), `i[` / `a[`,
    /// `i<` / `a<` — text between balanced bracket pairs (nested).
    Pair {
        open: char,
        close: char,
        around: bool,
    },
}

/// Map `(around, target_char)` to a [`TextObject`]. The four target
/// chars per pair (open, close, alias) all resolve to the same object,
/// matching vim.
pub fn build_textobject(around: bool, target: char) -> Option<TextObject> {
    Some(match target {
        'w' => TextObject::Word { around },
        '"' | '\'' | '`' => TextObject::Quote {
            delim: target,
            around,
        },
        '(' | ')' | 'b' => TextObject::Pair {
            open: '(',
            close: ')',
            around,
        },
        '{' | '}' | 'B' => TextObject::Pair {
            open: '{',
            close: '}',
            around,
        },
        '[' | ']' => TextObject::Pair {
            open: '[',
            close: ']',
            around,
        },
        '<' | '>' => TextObject::Pair {
            open: '<',
            close: '>',
            around,
        },
        _ => return None,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    Motion(Motion, usize),
    EnterInsert(InsertPos),
    InsertChar(char),
    InsertNewline,
    DeleteBackward,
    DeleteForward,
    ExitInsert,
    EnterCmdline,
    CmdlineChar(char),
    CmdlineBackspace,
    CmdlineDelete,
    CmdlineCursorLeft,
    CmdlineCursorRight,
    CmdlineCursorHome,
    CmdlineCursorEnd,
    CmdlineExecute,
    CmdlineCancel,
    /// `<op><motion>` — e.g. `dw`, `c$`, `y3w`.
    OperatorMotion(Operator, Motion, usize),
    /// Doubled-key shortcut: `dd`, `cc`, `yy` (linewise).
    OperatorLinewise(Operator, usize),
    /// `<op><i|a><target>` — e.g. `diw`, `ca"`, `yi(`.
    OperatorTextObject(Operator, TextObject, usize),
    /// `p` / `P`.
    Paste(PastePos, usize),
    /// `u` — restore prior snapshot.
    Undo,
    /// `<C-r>` — replay one redo step.
    Redo,
    /// `.` — replay the last change.
    RepeatChange(usize),
    /// `/` (forward) or `?` (backward) — open the search prompt.
    EnterSearch(bool),
    SearchChar(char),
    SearchBackspace,
    SearchDelete,
    SearchCursorLeft,
    SearchCursorRight,
    SearchCursorHome,
    SearchCursorEnd,
    SearchExecute,
    SearchCancel,
    /// `n` repeats the last search; `reverse=true` flips direction (`N`).
    SearchRepeat { reverse: bool },
    /// `Ctrl+P` — open the quick-open modal.
    EnterQuickOpen,
    QuickOpenChar(char),
    QuickOpenBackspace,
    QuickOpenDelete,
    QuickOpenCursorLeft,
    QuickOpenCursorRight,
    QuickOpenCursorHome,
    QuickOpenCursorEnd,
    QuickOpenSelectNext,
    QuickOpenSelectPrev,
    QuickOpenExecute,
    QuickOpenCancel,
    /// `Ctrl+E` — toggle the file-tree sidebar (and shift focus to it
    /// when opening). Issued from any non-modal mode.
    TreeToggle,
    /// `Tab` — when the tree is visible, swap focus between sidebar
    /// and editor without changing visibility.
    FocusSwap,
    TreeSelectNext,
    TreeSelectPrev,
    TreeSelectFirst,
    TreeSelectLast,
    /// `Enter`/`l` — open a file or expand a folder (depending on the
    /// selected entry's kind).
    TreeActivate,
    /// `h` — collapse the parent folder (or current if it's expanded).
    TreeCollapse,
    /// `R` — re-scan the vault and refresh.
    TreeRefresh,
    /// `gt` — next tab (wrap-around). With a count `<n>gt`, jump to
    /// the n-th tab (1-indexed).
    TabNext,
    /// `gT` — previous tab.
    TabPrev,
    /// `<n>gt` — go to tab `n`.
    TabGoto(usize),
    /// `Ctrl+W <suffix>` — split / focus / close-window operations on
    /// the active tab's pane tree.
    Window(WindowCmd),
    /// `a` in tree — open the in-tree prompt for creating a file in
    /// the selected entry's directory.
    TreeCreate,
    /// `r` in tree — open the in-tree prompt for renaming the
    /// selected file (folders not supported).
    TreeRename,
    /// `d` in tree — open the in-tree y/N confirmation prompt for
    /// deleting the selected file.
    TreeDelete,
    /// Char input inside the tree prompt.
    TreePromptChar(char),
    TreePromptBackspace,
    TreePromptDelete,
    TreePromptCursorLeft,
    TreePromptCursorRight,
    TreePromptCursorHome,
    TreePromptCursorEnd,
    TreePromptExecute,
    TreePromptCancel,
    Quit,
    /// `v` — enter charwise visual mode anchored at the current cursor.
    EnterVisual,
    /// `V` — enter linewise visual mode.
    EnterVisualLine,
    /// Apply an operator to the current visual selection. Generated
    /// from `d`/`c`/`y`/`x` while in [`Mode::Visual`] / [`Mode::VisualLine`].
    /// Drops back to normal afterwards (or insert, for `c`).
    VisualOperator(Operator),
    /// `o` in visual mode — swap the anchor and the moving cursor.
    VisualSwap,
    /// `a{`/`i{`/`aw`/`i"` etc. while in Visual mode — extend the
    /// current selection to cover the resolved text object's range.
    /// The dispatch handler reads the range from the text-object
    /// engine and snaps anchor + cursor to its bounds, keeping the
    /// user in visual mode so they can layer more motions on top.
    VisualSelectTextObject(TextObject),
    /// `Esc` / a second `v` (or `V` in linewise) — leave visual.
    ExitVisual,
    /// `r` in normal mode with the cursor on a block segment — run
    /// the block. Other block types may delegate; for now only DB
    /// blocks have an executor wired up.
    RunBlock,
    /// `<CR>` in normal mode with the cursor parked on a DB result
    /// row — open the row-detail modal. Dispatch validates the
    /// cursor; if it's anywhere else the action is a no-op.
    OpenDbRowDetail,
    /// `Esc` / `q` inside the row-detail modal — close it and return
    /// to normal mode.
    CloseDbRowDetail,
    /// `y` inside the row-detail modal — copy the current row's
    /// values to the system clipboard as pretty-printed JSON.
    CopyDbRowDetailJson,
    /// `gc` chord on a DB block — open the connection picker popup
    /// anchored to that block. Mnemonic: `g`-prefixed "goto" family
    /// (gg, gt, gd, gf …) extended with `gc` = goto connection.
    /// Dispatch validates the cursor; on a non-DB position it
    /// surfaces a status hint.
    OpenConnectionPicker,
    /// `<C-x>` on a DB block — wrap its query in the dialect's
    /// EXPLAIN keyword and run it (the block's own `params["query"]`
    /// stays untouched). Output replaces the result tab like a
    /// normal run. Mnemonic: "X" = E**X**plain.
    ExplainBlock,
    /// `gd` on a block — cycle the display mode (Input → Split →
    /// Output → Input). Persists via `display=` in the fence so the
    /// next save carries the choice. Mnemonic: "go display".
    CycleDisplayMode,
    /// `Esc` / `Ctrl-C` inside the picker — close without picking.
    CloseConnectionPicker,
    /// `j` / `Down` / `k` / `Up` inside the picker — move the
    /// selection cursor by `i32` (positive = next, negative = prev).
    MoveConnectionPickerCursor(i32),
    /// `Enter` inside the picker — apply the selected connection
    /// to the anchored block and close the popup.
    ConfirmConnectionPicker,
    /// `Ctrl+n` / `Down` while the SQL completion popup is open —
    /// move the highlight one item forward (wraps).
    CompletionNext,
    /// `Ctrl+p` / `Up` while the SQL completion popup is open —
    /// move the highlight one item back (wraps).
    CompletionPrev,
    /// `Tab` / `Enter` while the SQL completion popup is open —
    /// splice the selected item's label in place of the prefix word
    /// at the cursor and close the popup.
    CompletionAccept,
    /// `Esc` / `Ctrl+C` while the popup is open — close it without
    /// inserting anything; subsequent keys go to insert as usual.
    CompletionDismiss,
    /// `y` (or `Enter`) while the unscoped-destructive confirm
    /// modal is up — run the query anyway, bypassing the gate.
    ConfirmDbRun,
    /// `n`/`Esc`/`Ctrl+C` while the confirm modal is up — close
    /// the modal without running.
    CancelDbRun,
    Noop,
}

/// Suffix command after the `Ctrl+W` window prefix.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowCmd {
    /// `<C-w>v` — split focused pane vertically (side-by-side).
    SplitVertical,
    /// `<C-w>s` — split focused pane horizontally (top / bottom).
    SplitHorizontal,
    /// `<C-w>h` — focus the pane to the left.
    FocusLeft,
    /// `<C-w>l` — focus the pane to the right.
    FocusRight,
    /// `<C-w>k` — focus the pane above.
    FocusUp,
    /// `<C-w>j` — focus the pane below.
    FocusDown,
    /// `<C-w>w` / `<C-w><C-w>` — cycle focus through leaves.
    Cycle,
    /// `<C-w>c` / `<C-w>q` — close the focused pane (closes the tab when
    /// it was the only pane left).
    Close,
    /// `<C-w>=` — equalize all split ratios in the active tab.
    Equalize,
}

/// Try to interpret a single keystroke as a [`Motion`]. Returns `None`
/// when the key is not a motion (e.g. `i`, `:`). The two state-bearing
/// motions (`0`, `gg`/`G` with count) are handled by the caller because
/// they need access to `VimState`.
fn try_motion(key: KeyEvent) -> Option<Motion> {
    let KeyEvent {
        code, modifiers, ..
    } = key;
    // Letter-keyed motions (`h`, `l`, `w`, `e`, …) must NOT match when
    // a control modifier is pressed; otherwise `Ctrl+E` would shadow
    // the file-tree toggle, `Ctrl+H` the move-left, etc. The two
    // CTRL-bearing motions (`Ctrl+D`/`Ctrl+U`) match before falling
    // into the unmodified branch.
    let plain = !modifiers.intersects(KeyModifiers::CONTROL | KeyModifiers::ALT | KeyModifiers::SUPER);
    Some(match (modifiers, code) {
        (KeyModifiers::CONTROL, KeyCode::Char('d')) => Motion::HalfPageDown,
        (KeyModifiers::CONTROL, KeyCode::Char('u')) => Motion::HalfPageUp,
        (_, KeyCode::Left) => Motion::Left,
        (_, KeyCode::Right) => Motion::Right,
        (_, KeyCode::End) => Motion::LineEnd,
        (_, KeyCode::Home) => Motion::LineStart,
        (_, KeyCode::Down) => Motion::Down,
        (_, KeyCode::Up) => Motion::Up,
        _ if plain => match code {
            KeyCode::Char('h') => Motion::Left,
            KeyCode::Char('l') => Motion::Right,
            KeyCode::Char('^') => Motion::FirstNonBlank,
            KeyCode::Char('$') => Motion::LineEnd,
            KeyCode::Char('j') => Motion::Down,
            KeyCode::Char('k') => Motion::Up,
            KeyCode::Char('w') => Motion::WordForward,
            KeyCode::Char('b') => Motion::WordBackward,
            KeyCode::Char('e') => Motion::WordEnd,
            _ => return None,
        },
        _ => return None,
    })
}

fn doubled_for(op: Operator, code: KeyCode) -> bool {
    matches!(
        (op, code),
        (Operator::Delete, KeyCode::Char('d'))
            | (Operator::Change, KeyCode::Char('c'))
            | (Operator::Yank, KeyCode::Char('y'))
    )
}

fn key_to_operator(modifiers: KeyModifiers, code: KeyCode) -> Option<Operator> {
    // Operators are unmodified lowercase keys. `Ctrl+D` is HalfPageDown,
    // `Ctrl+C` is the emergency quit — both must NOT be picked up as
    // `d` or `c` operator entries.
    if modifiers.intersects(KeyModifiers::CONTROL | KeyModifiers::ALT | KeyModifiers::SUPER) {
        return None;
    }
    match code {
        KeyCode::Char('d') => Some(Operator::Delete),
        KeyCode::Char('c') => Some(Operator::Change),
        KeyCode::Char('y') => Some(Operator::Yank),
        _ => None,
    }
}

fn key_to_find_kind(modifiers: KeyModifiers, code: KeyCode) -> Option<FindKind> {
    if modifiers.intersects(KeyModifiers::CONTROL | KeyModifiers::ALT | KeyModifiers::SUPER) {
        return None;
    }
    match code {
        KeyCode::Char('f') => Some(FindKind::F),
        KeyCode::Char('F') => Some(FindKind::FBack),
        KeyCode::Char('t') => Some(FindKind::T),
        KeyCode::Char('T') => Some(FindKind::TBack),
        _ => None,
    }
}

fn find_kind_to_motion(kind: FindKind, target: char) -> Motion {
    match kind {
        FindKind::F => Motion::FindForward(target),
        FindKind::FBack => Motion::FindBackward(target),
        FindKind::T => Motion::TillForward(target),
        FindKind::TBack => Motion::TillBackward(target),
    }
}

/// Translate one key in Normal mode to an [`Action`]. Mutates the
/// parser state to handle multi-key prefixes (counts, `gg`, operators).
pub fn parse_normal(state: &mut VimState, key: KeyEvent) -> Action {
    let KeyEvent {
        code, modifiers, ..
    } = key;

    if code == KeyCode::Esc {
        state.reset_pending();
        return Action::Noop;
    }

    // Resolve a pending `Ctrl+W` window-prefix — the next keystroke
    // becomes a [`WindowCmd`]. Anything we don't recognize cancels the
    // prefix silently.
    if state.pending_window {
        state.pending_window = false;
        let cmd = match (modifiers, code) {
            (KeyModifiers::NONE | KeyModifiers::SHIFT, KeyCode::Char('v')) => {
                Some(WindowCmd::SplitVertical)
            }
            (KeyModifiers::NONE | KeyModifiers::SHIFT, KeyCode::Char('s')) => {
                Some(WindowCmd::SplitHorizontal)
            }
            (KeyModifiers::NONE | KeyModifiers::SHIFT, KeyCode::Char('h')) => {
                Some(WindowCmd::FocusLeft)
            }
            (KeyModifiers::NONE | KeyModifiers::SHIFT, KeyCode::Char('l')) => {
                Some(WindowCmd::FocusRight)
            }
            (KeyModifiers::NONE | KeyModifiers::SHIFT, KeyCode::Char('k')) => {
                Some(WindowCmd::FocusUp)
            }
            (KeyModifiers::NONE | KeyModifiers::SHIFT, KeyCode::Char('j')) => {
                Some(WindowCmd::FocusDown)
            }
            // `<C-w>w` and `<C-w><C-w>` both cycle.
            (KeyModifiers::NONE | KeyModifiers::SHIFT, KeyCode::Char('w'))
            | (KeyModifiers::CONTROL, KeyCode::Char('w')) => Some(WindowCmd::Cycle),
            // `<C-w>c` and `<C-w>q` both close the focused window.
            (KeyModifiers::NONE | KeyModifiers::SHIFT, KeyCode::Char('c'))
            | (KeyModifiers::NONE | KeyModifiers::SHIFT, KeyCode::Char('q')) => {
                Some(WindowCmd::Close)
            }
            (KeyModifiers::NONE | KeyModifiers::SHIFT, KeyCode::Char('=')) => {
                Some(WindowCmd::Equalize)
            }
            _ => None,
        };
        return cmd.map(Action::Window).unwrap_or(Action::Noop);
    }

    // Resolve a pending find/till — `f` `t` `F` `T` waiting for a target
    // char. Falls back to a no-op when the keystroke isn't a printable char.
    if let Some(kind) = state.pending_find_kind {
        let target = match code {
            KeyCode::Char(c) => c,
            _ => {
                state.pending_find_kind = None;
                state.pending_operator = None;
                return Action::Noop;
            }
        };
        state.pending_find_kind = None;
        let motion = find_kind_to_motion(kind, target);
        let count = state.take_count();
        if let Some((op, op_count)) = state.pending_operator.take() {
            return Action::OperatorMotion(op, motion, op_count.max(1) * count.max(1));
        }
        return Action::Motion(motion, count);
    }

    // Resolve a pending text object first — `d` `i` `w` arriving here
    // with `pending_textobj_inner = Some(true)` and `pending_operator`
    // still set, expecting `w`/`"`/`(`/etc. to complete the trigram.
    if let Some(inner) = state.pending_textobj_inner {
        let target = match code {
            KeyCode::Char(c) => c,
            _ => {
                // Anything non-char cancels.
                state.pending_operator = None;
                state.pending_textobj_inner = None;
                return Action::Noop;
            }
        };
        let around = !inner;
        if let Some(textobj) = build_textobject(around, target) {
            let (op, op_count) = state.pending_operator.take().unwrap_or((Operator::Delete, 1));
            state.pending_textobj_inner = None;
            return Action::OperatorTextObject(op, textobj, op_count.max(1));
        }
        // Unknown target — abort the whole operator chain silently.
        state.pending_operator = None;
        state.pending_textobj_inner = None;
        return Action::Noop;
    }

    // Digit accumulation. `0` is special: with no pending count it is
    // the LineStart motion (which may compose with a pending operator).
    if let KeyCode::Char(c) = code {
        if c.is_ascii_digit() {
            let d = c.to_digit(10).unwrap() as usize;
            if d == 0 && state.pending_count.is_none() {
                if let Some((op, op_count)) = state.pending_operator.take() {
                    return Action::OperatorMotion(
                        op,
                        Motion::LineStart,
                        op_count.max(1),
                    );
                }
                return Action::Motion(Motion::LineStart, 1);
            }
            state.push_digit(d);
            return Action::Noop;
        }
    }

    // Resolve `gg` (the second `g`).
    if state.pending_g {
        state.pending_g = false;
        if let KeyCode::Char('g') = code {
            let count = state.take_count();
            if let Some((op, op_count)) = state.pending_operator.take() {
                let motion = if count > 1 {
                    Motion::GotoLine(count)
                } else {
                    Motion::DocStart
                };
                return Action::OperatorMotion(op, motion, op_count.max(1));
            }
            return if count > 1 {
                Action::Motion(Motion::GotoLine(count), 1)
            } else {
                Action::Motion(Motion::DocStart, 1)
            };
        }
        // `gt` / `gT` — tab navigation. `<n>gt` jumps to tab n.
        if let KeyCode::Char('t') = code {
            let count = state.take_count();
            return if count > 1 {
                Action::TabGoto(count)
            } else {
                Action::TabNext
            };
        }
        if let KeyCode::Char('T') = code {
            state.take_count();
            return Action::TabPrev;
        }
        // `gd` — cycle the focused block's display mode. Doesn't
        // consume the leading count (mode-cycle is per-press, not
        // per-N), but we still drain `pending_count` so a stale
        // count doesn't leak into the next keystroke.
        if let KeyCode::Char('d') = code {
            state.take_count();
            return Action::CycleDisplayMode;
        }
        // Drop the prefix and continue parsing.
    }

    let count = state.take_count();

    // Operator-pending branch. `d`/`c`/`y` set state.pending_operator;
    // the next keystroke either doubles (linewise) or supplies a motion.
    if let Some((op, op_count)) = state.pending_operator {
        // `dd`, `cc`, `yy` — linewise shortcut.
        if doubled_for(op, code) {
            state.pending_operator = None;
            return Action::OperatorLinewise(op, op_count.max(1) * count.max(1));
        }
        // `dgg`, `cgg`, `ygg` — defer to the next keystroke.
        if let KeyCode::Char('g') = code {
            state.pending_count = if count > 1 { Some(count) } else { None };
            state.pending_g = true;
            return Action::Noop;
        }
        if let KeyCode::Char('G') = code {
            state.pending_operator = None;
            let motion = if count > 1 {
                Motion::GotoLine(count)
            } else {
                Motion::DocEnd
            };
            return Action::OperatorMotion(op, motion, op_count.max(1));
        }
        // Plain motion.
        if let Some(m) = try_motion(key) {
            state.pending_operator = None;
            return Action::OperatorMotion(op, m, op_count.max(1) * count.max(1));
        }
        // Find/till prefix — `df<c>`, `dt<c>`, etc. Stash the combined
        // count and let the pending-find resolver at the top of
        // `parse_normal` produce the OperatorMotion next tick.
        if let Some(kind) = key_to_find_kind(modifiers, code) {
            state.pending_find_kind = Some(kind);
            state.pending_operator = Some((op, op_count.max(1) * count.max(1)));
            return Action::Noop;
        }
        // Repeat last find — `d;` / `d,`.
        if let KeyCode::Char(';') = code {
            if let Some(m) = state.last_find {
                state.pending_operator = None;
                return Action::OperatorMotion(op, m, op_count.max(1) * count.max(1));
            }
            state.pending_operator = None;
            return Action::Noop;
        }
        if let KeyCode::Char(',') = code {
            if let Some(m) = state.last_find.and_then(Motion::reverse_find) {
                state.pending_operator = None;
                return Action::OperatorMotion(op, m, op_count.max(1) * count.max(1));
            }
            state.pending_operator = None;
            return Action::Noop;
        }
        // Text-object prefix. `i` or `a` starts the trigram; the next
        // keystroke (handled at the top of `parse_normal`) supplies the
        // target char and produces an [`Action::OperatorTextObject`].
        match (modifiers, code) {
            (KeyModifiers::NONE | KeyModifiers::SHIFT, KeyCode::Char('i')) => {
                state.pending_textobj_inner = Some(true);
                // Stash the count back so it's available when we resolve.
                state.pending_operator = Some((op, op_count.max(1) * count.max(1)));
                return Action::Noop;
            }
            (KeyModifiers::NONE | KeyModifiers::SHIFT, KeyCode::Char('a')) => {
                state.pending_textobj_inner = Some(false);
                state.pending_operator = Some((op, op_count.max(1) * count.max(1)));
                return Action::Noop;
            }
            _ => {}
        }
        // Unrecognized → cancel the operator silently.
        state.pending_operator = None;
        return Action::Noop;
    }

    // No operator pending — interpret the keystroke as a fresh command.

    // Operators (entry).
    if let Some(op) = key_to_operator(modifiers, code) {
        state.pending_operator = Some((op, count));
        return Action::Noop;
    }

    // Find/till entry.
    if let Some(kind) = key_to_find_kind(modifiers, code) {
        state.pending_find_kind = Some(kind);
        // Stash count so the resolver consumes it.
        state.pending_count = if count > 1 { Some(count) } else { None };
        return Action::Noop;
    }

    // Repeat last find — `;` / `,`.
    if let KeyCode::Char(';') = code {
        if let Some(m) = state.last_find {
            return Action::Motion(m, count);
        }
        return Action::Noop;
    }
    if let KeyCode::Char(',') = code {
        if let Some(m) = state.last_find.and_then(Motion::reverse_find) {
            return Action::Motion(m, count);
        }
        return Action::Noop;
    }

    // Plain motion?
    if let Some(m) = try_motion(key) {
        return Action::Motion(m, count);
    }

    // App-level shortcuts (non-vim) — centralised in
    // `vim::keybindings` so they're easy to find and remap. Each
    // helper wraps a `KeyChord` constant; check them before the
    // big match below so the literal branches stay focused on
    // genuine vim primitives.
    use crate::vim::keybindings as kb;
    if kb::matches_run_block(&key) {
        return Action::RunBlock;
    }
    if kb::matches_open_db_row_detail(&key) {
        return Action::OpenDbRowDetail;
    }
    if kb::matches_quick_open(&key) {
        return Action::EnterQuickOpen;
    }
    if kb::matches_tree_toggle(&key) {
        return Action::TreeToggle;
    }
    if kb::matches_focus_swap(&key) {
        return Action::FocusSwap;
    }
    if kb::matches_open_connection_picker(&key) {
        return Action::OpenConnectionPicker;
    }
    if kb::matches_explain_block(&key) {
        return Action::ExplainBlock;
    }

    match (modifiers, code) {
        // gg / G with optional count — these need state.
        (_, KeyCode::Char('g')) => {
            state.pending_count = if count > 1 { Some(count) } else { None };
            state.pending_g = true;
            Action::Noop
        }
        (_, KeyCode::Char('G')) => {
            if count > 1 {
                Action::Motion(Motion::GotoLine(count), 1)
            } else {
                Action::Motion(Motion::DocEnd, 1)
            }
        }

        // Insert variants.
        (_, KeyCode::Char('i')) => Action::EnterInsert(InsertPos::Current),
        (_, KeyCode::Char('a')) => Action::EnterInsert(InsertPos::After),
        (_, KeyCode::Char('I')) => Action::EnterInsert(InsertPos::LineStart),
        (_, KeyCode::Char('A')) => Action::EnterInsert(InsertPos::LineEnd),
        (_, KeyCode::Char('o')) => Action::EnterInsert(InsertPos::LineBelow),
        (_, KeyCode::Char('O')) => Action::EnterInsert(InsertPos::LineAbove),

        // Operator shortcuts (uppercase). All of these decompose into
        // `<op><motion>` or `<op><op>` so the operator engine handles them.
        (_, KeyCode::Char('D')) => {
            Action::OperatorMotion(Operator::Delete, Motion::LineEnd, count)
        }
        (_, KeyCode::Char('C')) => {
            Action::OperatorMotion(Operator::Change, Motion::LineEnd, count)
        }
        (_, KeyCode::Char('Y')) => Action::OperatorLinewise(Operator::Yank, count),
        (_, KeyCode::Char('x')) => {
            Action::OperatorMotion(Operator::Delete, Motion::Right, count)
        }
        (_, KeyCode::Char('X')) => {
            Action::OperatorMotion(Operator::Delete, Motion::Left, count)
        }
        (_, KeyCode::Char('s')) => {
            Action::OperatorMotion(Operator::Change, Motion::Right, count)
        }
        (_, KeyCode::Char('S')) => Action::OperatorLinewise(Operator::Change, count),

        // Visual mode entry — `v` charwise, `V` linewise. The dispatch
        // layer captures the current cursor as the anchor.
        (KeyModifiers::NONE | KeyModifiers::SHIFT, KeyCode::Char('v')) => Action::EnterVisual,
        (_, KeyCode::Char('V')) => Action::EnterVisualLine,

        // Paste. Excluding Ctrl so `Ctrl+P` (quick-open) reaches the
        // dedicated arm below. (`r` / `<CR>` / `<C-p>` / `<C-e>` /
        // `Tab` are app-level shortcuts handled by the keybindings
        // pre-match block above.)
        (KeyModifiers::NONE, KeyCode::Char('p')) => Action::Paste(PastePos::After, count),
        (KeyModifiers::NONE | KeyModifiers::SHIFT, KeyCode::Char('P')) => {
            Action::Paste(PastePos::Before, count)
        }

        // History.
        (KeyModifiers::NONE, KeyCode::Char('u')) => Action::Undo,
        (KeyModifiers::CONTROL, KeyCode::Char('r')) => Action::Redo,
        (KeyModifiers::NONE, KeyCode::Char('.')) => Action::RepeatChange(count),

        // `Ctrl+W` — vim window prefix. Sets `state.pending_window`
        // so the next keystroke is interpreted as a [`WindowCmd`] by
        // the prefix-resolution branch at the top of `parse_normal`.
        (KeyModifiers::CONTROL, KeyCode::Char('w')) => {
            state.pending_window = true;
            Action::Noop
        }

        // Search entry + repeat.
        (KeyModifiers::NONE | KeyModifiers::SHIFT, KeyCode::Char('/')) => Action::EnterSearch(true),
        (KeyModifiers::NONE | KeyModifiers::SHIFT, KeyCode::Char('?')) => {
            Action::EnterSearch(false)
        }
        (KeyModifiers::NONE, KeyCode::Char('n')) => {
            Action::SearchRepeat { reverse: false }
        }
        (_, KeyCode::Char('N')) => Action::SearchRepeat { reverse: true },

        // Command-line entry.
        (KeyModifiers::NONE | KeyModifiers::SHIFT, KeyCode::Char(':')) => Action::EnterCmdline,

        // Emergency quit.
        (KeyModifiers::CONTROL, KeyCode::Char('c')) => Action::Quit,

        _ => Action::Noop,
    }
}

/// Generic LineEdit prompt key decoder. Each prompt mode maps the
/// abstract action set to its concrete `Action` variant.
fn parse_lineedit_prompt<F>(key: KeyEvent, mut emit: F) -> Action
where
    F: FnMut(LineEditAction) -> Action,
{
    let KeyEvent {
        code, modifiers, ..
    } = key;
    match (modifiers, code) {
        (_, KeyCode::Esc) => emit(LineEditAction::Cancel),
        (KeyModifiers::CONTROL, KeyCode::Char('c')) => emit(LineEditAction::Cancel),
        (_, KeyCode::Enter) => emit(LineEditAction::Execute),
        (_, KeyCode::Backspace) => emit(LineEditAction::Backspace),
        (_, KeyCode::Delete) => emit(LineEditAction::Delete),
        (_, KeyCode::Left) => emit(LineEditAction::CursorLeft),
        (_, KeyCode::Right) => emit(LineEditAction::CursorRight),
        (_, KeyCode::Home) => emit(LineEditAction::CursorHome),
        (_, KeyCode::End) => emit(LineEditAction::CursorEnd),
        (KeyModifiers::CONTROL, KeyCode::Char('a')) => emit(LineEditAction::CursorHome),
        (KeyModifiers::CONTROL, KeyCode::Char('e')) => emit(LineEditAction::CursorEnd),
        (KeyModifiers::CONTROL, KeyCode::Char('b')) => emit(LineEditAction::CursorLeft),
        (KeyModifiers::CONTROL, KeyCode::Char('f')) => emit(LineEditAction::CursorRight),
        (KeyModifiers::CONTROL, KeyCode::Char('d')) => emit(LineEditAction::Delete),
        (mods, KeyCode::Char(c)) if !mods.contains(KeyModifiers::CONTROL) => {
            emit(LineEditAction::Char(c))
        }
        _ => Action::Noop,
    }
}

/// Abstract operations every line-edit prompt understands. Mapped to
/// concrete `Action` variants by the per-mode parser callbacks.
pub enum LineEditAction {
    Cancel,
    Execute,
    Char(char),
    Backspace,
    Delete,
    CursorLeft,
    CursorRight,
    CursorHome,
    CursorEnd,
}

/// Translate one key in Visual or VisualLine mode. Reuses the normal-
/// mode motion vocabulary (h/l/j/k/w/b/e/0/^/$/gg/G/Ctrl+D/Ctrl+U) and
/// adds visual-only verbs: `d`/`x` delete the selection, `c`/`s`
/// change it, `y` yanks it, `o` swaps the anchor and the moving end,
/// and `Esc` (or a second `v`/`V`) leaves visual.
pub fn parse_visual(state: &mut VimState, key: KeyEvent) -> Action {
    let KeyEvent {
        code, modifiers, ..
    } = key;

    if code == KeyCode::Esc {
        state.reset_pending();
        return Action::ExitVisual;
    }

    // Resolve a pending text-object trigger from a previous `a` /
    // `i` keystroke (e.g. `va{` arriving here on the `{`). Build the
    // object via the shared resolver and snap the selection to its
    // range. Anything other than a recognised target char silently
    // cancels — same forgiving behaviour as `parse_normal`.
    if let Some(inner) = state.pending_textobj_inner {
        state.pending_textobj_inner = None;
        let target = match code {
            KeyCode::Char(c) => c,
            _ => return Action::Noop,
        };
        let around = !inner;
        if let Some(textobj) = build_textobject(around, target) {
            return Action::VisualSelectTextObject(textobj);
        }
        return Action::Noop;
    }

    // `v` toggles charwise visual off; `V` toggles linewise off. The
    // other letter swaps mode (handled in dispatch — emits a re-enter).
    let plain_letter = !modifiers.intersects(
        KeyModifiers::CONTROL | KeyModifiers::ALT | KeyModifiers::SUPER,
    );
    if plain_letter {
        if state.mode == Mode::Visual && code == KeyCode::Char('v') {
            return Action::ExitVisual;
        }
        if state.mode == Mode::VisualLine && code == KeyCode::Char('V') {
            return Action::ExitVisual;
        }
    }

    // Digit prefixes for motion counts.
    if let KeyCode::Char(c) = code {
        if c.is_ascii_digit() {
            let d = c.to_digit(10).unwrap() as usize;
            if d == 0 && state.pending_count.is_none() {
                let count = state.take_count();
                return Action::Motion(Motion::LineStart, count.max(1));
            }
            state.push_digit(d);
            return Action::Noop;
        }
    }

    // `gg` resolution.
    if state.pending_g {
        state.pending_g = false;
        if let KeyCode::Char('g') = code {
            let count = state.take_count();
            let motion = if count > 1 {
                Motion::GotoLine(count)
            } else {
                Motion::DocStart
            };
            return Action::Motion(motion, 1);
        }
        return Action::Noop;
    }

    // Visual-only verbs. Operators take priority over motion lookup
    // for `d`/`c`/`y`/`x`/`s` so they don't get parsed as letters.
    if plain_letter {
        match code {
            KeyCode::Char('d') | KeyCode::Char('x') => {
                return Action::VisualOperator(Operator::Delete);
            }
            KeyCode::Char('c') | KeyCode::Char('s') => {
                return Action::VisualOperator(Operator::Change);
            }
            KeyCode::Char('y') => {
                return Action::VisualOperator(Operator::Yank);
            }
            KeyCode::Char('o') => return Action::VisualSwap,
            // `a` / `i` start a text-object trigram. The next
            // keystroke is the target char (`{`, `"`, `w`, …); the
            // resolver at the top of `parse_visual` consumes it and
            // emits `VisualSelectTextObject`. Same state field
            // (`pending_textobj_inner`) as `parse_normal`'s chord.
            KeyCode::Char('a') => {
                state.pending_textobj_inner = Some(false);
                return Action::Noop;
            }
            KeyCode::Char('i') => {
                state.pending_textobj_inner = Some(true);
                return Action::Noop;
            }
            _ => {}
        }
    }

    // `gg` / `G` entry.
    if plain_letter && code == KeyCode::Char('g') {
        let count = state.take_count();
        state.pending_count = if count > 1 { Some(count) } else { None };
        state.pending_g = true;
        return Action::Noop;
    }
    if plain_letter && code == KeyCode::Char('G') {
        let count = state.take_count();
        return if count > 1 {
            Action::Motion(Motion::GotoLine(count), 1)
        } else {
            Action::Motion(Motion::DocEnd, 1)
        };
    }

    // Plain motions extend the selection.
    if let Some(m) = try_motion(key) {
        let count = state.take_count();
        return Action::Motion(m, count.max(1));
    }

    Action::Noop
}

/// Translate one key in command-line mode (the `:` prompt).
pub fn parse_cmdline(key: KeyEvent) -> Action {
    parse_lineedit_prompt(key, |op| match op {
        LineEditAction::Cancel => Action::CmdlineCancel,
        LineEditAction::Execute => Action::CmdlineExecute,
        LineEditAction::Char(c) => Action::CmdlineChar(c),
        LineEditAction::Backspace => Action::CmdlineBackspace,
        LineEditAction::Delete => Action::CmdlineDelete,
        LineEditAction::CursorLeft => Action::CmdlineCursorLeft,
        LineEditAction::CursorRight => Action::CmdlineCursorRight,
        LineEditAction::CursorHome => Action::CmdlineCursorHome,
        LineEditAction::CursorEnd => Action::CmdlineCursorEnd,
    })
}

/// Translate one key in search mode (the `/` or `?` prompt).
pub fn parse_search(key: KeyEvent) -> Action {
    parse_lineedit_prompt(key, |op| match op {
        LineEditAction::Cancel => Action::SearchCancel,
        LineEditAction::Execute => Action::SearchExecute,
        LineEditAction::Char(c) => Action::SearchChar(c),
        LineEditAction::Backspace => Action::SearchBackspace,
        LineEditAction::Delete => Action::SearchDelete,
        LineEditAction::CursorLeft => Action::SearchCursorLeft,
        LineEditAction::CursorRight => Action::SearchCursorRight,
        LineEditAction::CursorHome => Action::SearchCursorHome,
        LineEditAction::CursorEnd => Action::SearchCursorEnd,
    })
}

/// Translate one key inside the in-tree prompt (`a`/`r`/`d` shortcuts).
/// Mirrors `parse_cmdline` shape but emits tree-prompt-specific actions.
/// Supports cursor navigation: arrows, Home/End, Delete, plus the
/// emacs-style Ctrl-A/E/B/F/D shortcuts most TUI prompts honor.
pub fn parse_tree_prompt(key: KeyEvent) -> Action {
    let KeyEvent {
        code, modifiers, ..
    } = key;
    match (modifiers, code) {
        (_, KeyCode::Esc) => Action::TreePromptCancel,
        (KeyModifiers::CONTROL, KeyCode::Char('c')) => Action::TreePromptCancel,
        (_, KeyCode::Enter) => Action::TreePromptExecute,
        (_, KeyCode::Backspace) => Action::TreePromptBackspace,
        (_, KeyCode::Delete) => Action::TreePromptDelete,
        (_, KeyCode::Left) => Action::TreePromptCursorLeft,
        (_, KeyCode::Right) => Action::TreePromptCursorRight,
        (_, KeyCode::Home) => Action::TreePromptCursorHome,
        (_, KeyCode::End) => Action::TreePromptCursorEnd,
        (KeyModifiers::CONTROL, KeyCode::Char('a')) => Action::TreePromptCursorHome,
        (KeyModifiers::CONTROL, KeyCode::Char('e')) => Action::TreePromptCursorEnd,
        (KeyModifiers::CONTROL, KeyCode::Char('b')) => Action::TreePromptCursorLeft,
        (KeyModifiers::CONTROL, KeyCode::Char('f')) => Action::TreePromptCursorRight,
        (KeyModifiers::CONTROL, KeyCode::Char('d')) => Action::TreePromptDelete,
        (mods, KeyCode::Char(c)) if !mods.contains(KeyModifiers::CONTROL) => {
            Action::TreePromptChar(c)
        }
        _ => Action::Noop,
    }
}

/// Translate one key while the file-tree sidebar is focused. The
/// keymap mirrors vim's netrw / nerdtree:
///
/// - `j`/`k` (or arrows) move the selection
/// - `gg`/`G` jump to first/last entry
/// - `Enter` or `l` opens a file or expands a folder
/// - `h` collapses
/// - `R` refreshes
/// - `Tab` returns focus to the editor (sidebar stays visible)
/// - `Esc` or `Ctrl+E` does the same
pub fn parse_tree(key: KeyEvent) -> Action {
    let KeyEvent {
        code, modifiers, ..
    } = key;
    match (modifiers, code) {
        (_, KeyCode::Esc) => Action::FocusSwap,
        (KeyModifiers::CONTROL, KeyCode::Char('c')) => Action::FocusSwap,
        (KeyModifiers::CONTROL, KeyCode::Char('e')) => Action::TreeToggle,
        (_, KeyCode::Tab) => Action::FocusSwap,
        (_, KeyCode::Char('j')) | (_, KeyCode::Down) => Action::TreeSelectNext,
        (_, KeyCode::Char('k')) | (_, KeyCode::Up) => Action::TreeSelectPrev,
        (_, KeyCode::Char('G')) => Action::TreeSelectLast,
        (_, KeyCode::Char('g')) => Action::TreeSelectFirst,
        (_, KeyCode::Char('l')) | (_, KeyCode::Right) | (_, KeyCode::Enter) => {
            Action::TreeActivate
        }
        (_, KeyCode::Char('h')) | (_, KeyCode::Left) => Action::TreeCollapse,
        (_, KeyCode::Char('R')) => Action::TreeRefresh,
        (_, KeyCode::Char('a')) => Action::TreeCreate,
        (_, KeyCode::Char('r')) => Action::TreeRename,
        (_, KeyCode::Char('d')) | (_, KeyCode::Char('D')) => Action::TreeDelete,
        _ => Action::Noop,
    }
}

/// Translate one key inside the quick-open modal. Bindings split across
/// list navigation (Up/Down, Ctrl-P/N/K/J) and the inline LineEdit
/// (Left/Right/Home/End/Delete, Ctrl-A/E/B/F/D).
pub fn parse_quickopen(key: KeyEvent) -> Action {
    let KeyEvent {
        code, modifiers, ..
    } = key;
    // List-navigation shortcuts win first — they shadow some of the
    // LineEdit bindings (e.g. Ctrl-N stays "next item", not "delete").
    let list_nav = match (modifiers, code) {
        (_, KeyCode::Up) => Some(Action::QuickOpenSelectPrev),
        (_, KeyCode::Down) => Some(Action::QuickOpenSelectNext),
        (KeyModifiers::CONTROL, KeyCode::Char('p')) => Some(Action::QuickOpenSelectPrev),
        (KeyModifiers::CONTROL, KeyCode::Char('n')) => Some(Action::QuickOpenSelectNext),
        (KeyModifiers::CONTROL, KeyCode::Char('k')) => Some(Action::QuickOpenSelectPrev),
        (KeyModifiers::CONTROL, KeyCode::Char('j')) => Some(Action::QuickOpenSelectNext),
        _ => None,
    };
    if let Some(action) = list_nav {
        return action;
    }
    parse_lineedit_prompt(key, |op| match op {
        LineEditAction::Cancel => Action::QuickOpenCancel,
        LineEditAction::Execute => Action::QuickOpenExecute,
        LineEditAction::Char(c) => Action::QuickOpenChar(c),
        LineEditAction::Backspace => Action::QuickOpenBackspace,
        LineEditAction::Delete => Action::QuickOpenDelete,
        LineEditAction::CursorLeft => Action::QuickOpenCursorLeft,
        LineEditAction::CursorRight => Action::QuickOpenCursorRight,
        LineEditAction::CursorHome => Action::QuickOpenCursorHome,
        LineEditAction::CursorEnd => Action::QuickOpenCursorEnd,
    })
}

/// Translate one key while the DB row-detail modal is open. The
/// modal is "the active buffer, but read-only" — `app.document_mut()`
/// redirects to its body doc, so we delegate parsing to
/// `parse_normal` and let the dispatch engine work normally. The
/// only exceptions are:
///
/// 1. modal-specific shortcuts (`Ctrl-C` closes, `Y` copies the row
///    as JSON). Note: `Esc` and `q` are NOT close shortcuts — they
///    keep their vim semantics (`Esc` clears a pending chord, `q`
///    starts macro recording — currently a no-op);
/// 2. actions that would mutate the buffer (insert, edit, paste,
///    undo, delete/change operators) — replaced with Noop so the
///    modal stays read-only;
/// 3. actions that would escape the modal's focus (window/tab/quit/
///    file-tree/quick-open/run-block) — also Noop, the modal owns
///    the keyboard until it's dismissed.
pub fn parse_db_row_detail(state: &mut VimState, key: KeyEvent) -> Action {
    let KeyEvent {
        code, modifiers, ..
    } = key;
    match (modifiers, code) {
        // Modal close is `Ctrl-C` only — `Esc` and `q` are reserved
        // for their normal vim semantics (cancelling a chord and
        // macro-recording, respectively). Closing on either felt
        // accidental once standard yank chords like `yi{` were in
        // play: a stray `Esc` to clear a pending count would
        // teleport-close the modal.
        (KeyModifiers::CONTROL, KeyCode::Char('c')) => return Action::CloseDbRowDetail,
        // `Y` (uppercase) → copy the whole row as JSON. Distinct
        // from `y` so the standard yank chord family (`yy`, `y$`,
        // `yi{`, `yiw`, etc.) keeps working — those would otherwise
        // be eaten by a standalone `y` intercept the moment it
        // fires.
        (KeyModifiers::SHIFT, KeyCode::Char('Y'))
            if state.pending_count.is_none()
                && state.pending_operator.is_none()
                && !state.pending_window =>
        {
            return Action::CopyDbRowDetailJson;
        }
        _ => {}
    }
    let action = parse_normal(state, key);
    if is_blocked_in_modal(&action) {
        Action::Noop
    } else {
        action
    }
}

/// Decide whether an `Action` produced by `parse_normal` should be
/// suppressed inside the row-detail modal. Three categories:
///
/// - **Mutations**: the modal is read-only. Any action that would
///   change buffer contents (insert, delete, paste, undo, redo,
///   delete/change operators, `.` repeat) is dropped.
/// - **Mode transitions** (search, visual, ex): allowed in a normal
///   buffer, but they swap `app.vim.mode` away from `DbRowDetail`,
///   which breaks the modal's render path. Supporting them properly
///   needs a "return to modal mode after the transient mode exits"
///   plumbing — deferred. Until then, block.
/// - **Focus escapes**: the modal owns input until dismissed. Window
///   ops, tab nav, file-tree, quick-open, run-block, quit — none of
///   these should fire while the modal is up.
fn is_blocked_in_modal(action: &Action) -> bool {
    use Operator::{Change, Delete};
    matches!(
        action,
        // Mutations.
        Action::EnterInsert(_)
            | Action::ExitInsert
            | Action::InsertChar(_)
            | Action::InsertNewline
            | Action::DeleteBackward
            | Action::DeleteForward
            | Action::Paste(..)
            | Action::Undo
            | Action::Redo
            | Action::RepeatChange(_)
            | Action::OperatorMotion(Delete | Change, _, _)
            | Action::OperatorTextObject(Delete | Change, _, _)
            | Action::OperatorLinewise(Delete | Change, _)
            | Action::VisualOperator(Delete | Change)
            // Mode transitions that would break the modal's render
            // path. Search and ex are still blocked — supporting
            // them needs a "return to modal mode after the transient
            // mode exits" plumbing. Visual mode IS supported: the
            // modal renders whenever `app.db_row_detail` is Some,
            // independent of `app.vim.mode`, and the dispatch
            // restores `Mode::DbRowDetail` after the visual op.
            | Action::EnterSearch(_)
            | Action::SearchExecute
            | Action::SearchRepeat { .. }
            | Action::EnterCmdline
            // Focus escapes.
            | Action::Window(_)
            | Action::TabPrev
            | Action::TabNext
            | Action::TabGoto(_)
            | Action::FocusSwap
            | Action::TreeToggle
            | Action::EnterQuickOpen
            | Action::Quit
            | Action::RunBlock
            | Action::OpenDbRowDetail
    )
}

/// Translate one key while the connection picker popup is open.
/// Tiny vocab: vertical-only navigation (`j`/`k` and the arrows),
/// `Enter` to apply, `Esc`/`Ctrl-C` to dismiss. Anything else is a
/// no-op so a stray keystroke can't leak through to the editor.
pub fn parse_connection_picker(key: KeyEvent) -> Action {
    let KeyEvent {
        code, modifiers, ..
    } = key;
    match (modifiers, code) {
        (_, KeyCode::Esc) => Action::CloseConnectionPicker,
        (KeyModifiers::CONTROL, KeyCode::Char('c')) => Action::CloseConnectionPicker,
        (_, KeyCode::Enter) => Action::ConfirmConnectionPicker,
        (_, KeyCode::Down) | (KeyModifiers::NONE, KeyCode::Char('j')) => {
            Action::MoveConnectionPickerCursor(1)
        }
        (_, KeyCode::Up) | (KeyModifiers::NONE, KeyCode::Char('k')) => {
            Action::MoveConnectionPickerCursor(-1)
        }
        (KeyModifiers::CONTROL, KeyCode::Char('n')) => Action::MoveConnectionPickerCursor(1),
        (KeyModifiers::CONTROL, KeyCode::Char('p')) => Action::MoveConnectionPickerCursor(-1),
        _ => Action::Noop,
    }
}

/// Translate one key while the unscoped-destructive run-confirm
/// modal is up. `y` (or `Enter`) commits to the run; `n`/`Esc`/
/// `Ctrl-C` back out. Anything else is a no-op — fat-fingering a
/// motion keystroke shouldn't accidentally execute a `DELETE`.
pub fn parse_db_confirm_run(key: KeyEvent) -> Action {
    let KeyEvent {
        code, modifiers, ..
    } = key;
    match (modifiers, code) {
        (_, KeyCode::Esc) => Action::CancelDbRun,
        (KeyModifiers::CONTROL, KeyCode::Char('c')) => Action::CancelDbRun,
        (KeyModifiers::NONE, KeyCode::Char('n'))
        | (KeyModifiers::NONE, KeyCode::Char('N')) => Action::CancelDbRun,
        (KeyModifiers::NONE, KeyCode::Char('y'))
        | (KeyModifiers::NONE, KeyCode::Char('Y'))
        | (_, KeyCode::Enter) => Action::ConfirmDbRun,
        _ => Action::Noop,
    }
}

/// Translate one key in Insert mode.
pub fn parse_insert(key: KeyEvent) -> Action {
    let KeyEvent {
        code, modifiers, ..
    } = key;

    match (modifiers, code) {
        (_, KeyCode::Esc) => Action::ExitInsert,
        (KeyModifiers::CONTROL, KeyCode::Char('c')) => Action::ExitInsert,
        (_, KeyCode::Enter) => Action::InsertNewline,
        (_, KeyCode::Backspace) => Action::DeleteBackward,
        (_, KeyCode::Delete) => Action::DeleteForward,
        (mods, KeyCode::Char(c)) if !mods.contains(KeyModifiers::CONTROL) => Action::InsertChar(c),
        _ => Action::Noop,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(code: KeyCode) -> KeyEvent {
        KeyEvent::new(code, KeyModifiers::NONE)
    }
    fn key_ctrl(code: KeyCode) -> KeyEvent {
        KeyEvent::new(code, KeyModifiers::CONTROL)
    }

    #[test]
    fn h_l_j_k_are_motions() {
        let mut s = VimState::new();
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('h'))),
            Action::Motion(Motion::Left, 1)
        );
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('j'))),
            Action::Motion(Motion::Down, 1)
        );
    }

    #[test]
    fn count_prefix_amplifies() {
        let mut s = VimState::new();
        assert_eq!(parse_normal(&mut s, key(KeyCode::Char('5'))), Action::Noop);
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('j'))),
            Action::Motion(Motion::Down, 5)
        );
    }

    #[test]
    fn multi_digit_count() {
        let mut s = VimState::new();
        parse_normal(&mut s, key(KeyCode::Char('1')));
        parse_normal(&mut s, key(KeyCode::Char('2')));
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('w'))),
            Action::Motion(Motion::WordForward, 12)
        );
    }

    #[test]
    fn lone_zero_is_line_start() {
        let mut s = VimState::new();
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('0'))),
            Action::Motion(Motion::LineStart, 1)
        );
    }

    #[test]
    fn zero_after_count_extends_count() {
        let mut s = VimState::new();
        parse_normal(&mut s, key(KeyCode::Char('1')));
        parse_normal(&mut s, key(KeyCode::Char('0')));
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('j'))),
            Action::Motion(Motion::Down, 10)
        );
    }

    #[test]
    fn gg_is_doc_start() {
        let mut s = VimState::new();
        assert_eq!(parse_normal(&mut s, key(KeyCode::Char('g'))), Action::Noop);
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('g'))),
            Action::Motion(Motion::DocStart, 1)
        );
    }

    #[test]
    fn count_g_g_is_goto_line() {
        let mut s = VimState::new();
        parse_normal(&mut s, key(KeyCode::Char('5')));
        parse_normal(&mut s, key(KeyCode::Char('g')));
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('g'))),
            Action::Motion(Motion::GotoLine(5), 1)
        );
    }

    #[test]
    fn capital_g_is_doc_end() {
        let mut s = VimState::new();
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('G'))),
            Action::Motion(Motion::DocEnd, 1)
        );
    }

    #[test]
    fn count_capital_g_is_goto_line() {
        let mut s = VimState::new();
        parse_normal(&mut s, key(KeyCode::Char('1')));
        parse_normal(&mut s, key(KeyCode::Char('2')));
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('G'))),
            Action::Motion(Motion::GotoLine(12), 1)
        );
    }

    #[test]
    fn ctrl_d_u_half_page() {
        let mut s = VimState::new();
        assert_eq!(
            parse_normal(&mut s, key_ctrl(KeyCode::Char('d'))),
            Action::Motion(Motion::HalfPageDown, 1)
        );
        assert_eq!(
            parse_normal(&mut s, key_ctrl(KeyCode::Char('u'))),
            Action::Motion(Motion::HalfPageUp, 1)
        );
    }

    #[test]
    fn enter_insert_variants() {
        let mut s = VimState::new();
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('i'))),
            Action::EnterInsert(InsertPos::Current)
        );
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('a'))),
            Action::EnterInsert(InsertPos::After)
        );
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('I'))),
            Action::EnterInsert(InsertPos::LineStart)
        );
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('A'))),
            Action::EnterInsert(InsertPos::LineEnd)
        );
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('o'))),
            Action::EnterInsert(InsertPos::LineBelow)
        );
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('O'))),
            Action::EnterInsert(InsertPos::LineAbove)
        );
    }

    #[test]
    fn r_in_normal_emits_run_block() {
        let mut s = VimState::new();
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('r'))),
            Action::RunBlock
        );
    }

    #[test]
    fn v_in_normal_emits_enter_visual() {
        let mut s = VimState::new();
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('v'))),
            Action::EnterVisual
        );
    }

    #[test]
    fn capital_v_emits_enter_visual_line() {
        let mut s = VimState::new();
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('V'))),
            Action::EnterVisualLine
        );
    }

    #[test]
    fn parse_visual_motion_extends_selection() {
        let mut s = VimState::new();
        s.mode = Mode::Visual;
        assert_eq!(
            parse_visual(&mut s, key(KeyCode::Char('l'))),
            Action::Motion(Motion::Right, 1)
        );
        assert_eq!(
            parse_visual(&mut s, key(KeyCode::Char('w'))),
            Action::Motion(Motion::WordForward, 1)
        );
    }

    #[test]
    fn parse_visual_d_yanks_into_operator() {
        let mut s = VimState::new();
        s.mode = Mode::Visual;
        assert_eq!(
            parse_visual(&mut s, key(KeyCode::Char('d'))),
            Action::VisualOperator(Operator::Delete)
        );
        assert_eq!(
            parse_visual(&mut s, key(KeyCode::Char('y'))),
            Action::VisualOperator(Operator::Yank)
        );
        assert_eq!(
            parse_visual(&mut s, key(KeyCode::Char('c'))),
            Action::VisualOperator(Operator::Change)
        );
    }

    #[test]
    fn parse_visual_o_swaps() {
        let mut s = VimState::new();
        s.mode = Mode::Visual;
        assert_eq!(
            parse_visual(&mut s, key(KeyCode::Char('o'))),
            Action::VisualSwap
        );
    }

    #[test]
    fn parse_visual_text_object_chord() {
        // `va{` — `a` sets the text-object pending flag; `{` resolves
        // to a Pair around=true and emits VisualSelectTextObject.
        let mut s = VimState::new();
        s.mode = Mode::Visual;
        assert_eq!(parse_visual(&mut s, key(KeyCode::Char('a'))), Action::Noop);
        assert!(s.pending_textobj_inner == Some(false));
        let action = parse_visual(&mut s, key(KeyCode::Char('{')));
        assert!(
            matches!(
                action,
                Action::VisualSelectTextObject(TextObject::Pair {
                    open: '{',
                    close: '}',
                    around: true
                })
            ),
            "expected VisualSelectTextObject(Pair around), got {action:?}"
        );
        assert!(s.pending_textobj_inner.is_none());
    }

    #[test]
    fn parse_visual_inner_text_object_chord() {
        // `vi"` — `i` flags inner; `"` resolves to a Quote inner.
        let mut s = VimState::new();
        s.mode = Mode::Visual;
        assert_eq!(parse_visual(&mut s, key(KeyCode::Char('i'))), Action::Noop);
        let action = parse_visual(&mut s, key(KeyCode::Char('"')));
        assert!(
            matches!(
                action,
                Action::VisualSelectTextObject(TextObject::Quote {
                    delim: '"',
                    around: false
                })
            ),
            "expected VisualSelectTextObject(Quote inner), got {action:?}"
        );
    }

    #[test]
    fn parse_visual_v_exits_charwise() {
        let mut s = VimState::new();
        s.mode = Mode::Visual;
        assert_eq!(
            parse_visual(&mut s, key(KeyCode::Char('v'))),
            Action::ExitVisual
        );
    }

    #[test]
    fn parse_visual_capital_v_exits_linewise() {
        let mut s = VimState::new();
        s.mode = Mode::VisualLine;
        assert_eq!(
            parse_visual(&mut s, key(KeyCode::Char('V'))),
            Action::ExitVisual
        );
    }

    #[test]
    fn parse_visual_esc_exits() {
        let mut s = VimState::new();
        s.mode = Mode::Visual;
        assert_eq!(parse_visual(&mut s, key(KeyCode::Esc)), Action::ExitVisual);
    }

    #[test]
    fn ctrl_w_v_splits_vertical() {
        let mut s = VimState::new();
        // First `Ctrl+W` arms the prefix without emitting an action.
        assert_eq!(
            parse_normal(&mut s, key_ctrl(KeyCode::Char('w'))),
            Action::Noop
        );
        assert!(s.pending_window);
        // The suffix resolves to a window command and clears the flag.
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('v'))),
            Action::Window(WindowCmd::SplitVertical)
        );
        assert!(!s.pending_window);
    }

    #[test]
    fn ctrl_w_hjkl_focus_moves() {
        for (suffix, expected) in [
            ('h', WindowCmd::FocusLeft),
            ('l', WindowCmd::FocusRight),
            ('k', WindowCmd::FocusUp),
            ('j', WindowCmd::FocusDown),
        ] {
            let mut s = VimState::new();
            parse_normal(&mut s, key_ctrl(KeyCode::Char('w')));
            assert_eq!(
                parse_normal(&mut s, key(KeyCode::Char(suffix))),
                Action::Window(expected),
            );
        }
    }

    #[test]
    fn ctrl_w_close_alias_q() {
        let mut s = VimState::new();
        parse_normal(&mut s, key_ctrl(KeyCode::Char('w')));
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('q'))),
            Action::Window(WindowCmd::Close)
        );
        let mut s = VimState::new();
        parse_normal(&mut s, key_ctrl(KeyCode::Char('w')));
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('c'))),
            Action::Window(WindowCmd::Close)
        );
    }

    #[test]
    fn ctrl_w_ctrl_w_cycles() {
        let mut s = VimState::new();
        parse_normal(&mut s, key_ctrl(KeyCode::Char('w')));
        assert_eq!(
            parse_normal(&mut s, key_ctrl(KeyCode::Char('w'))),
            Action::Window(WindowCmd::Cycle)
        );
    }

    #[test]
    fn ctrl_w_unknown_suffix_clears_prefix() {
        let mut s = VimState::new();
        parse_normal(&mut s, key_ctrl(KeyCode::Char('w')));
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('z'))),
            Action::Noop
        );
        assert!(!s.pending_window);
        // After cancellation, normal motions resume immediately.
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('h'))),
            Action::Motion(Motion::Left, 1)
        );
    }

    #[test]
    fn ctrl_c_quits_in_normal() {
        let mut s = VimState::new();
        assert_eq!(
            parse_normal(&mut s, key_ctrl(KeyCode::Char('c'))),
            Action::Quit
        );
    }

    #[test]
    fn lowercase_q_is_no_longer_quit() {
        let mut s = VimState::new();
        // `q` is reserved (macros, future features). Quitting goes
        // through `:q` since round 2.
        assert_eq!(parse_normal(&mut s, key(KeyCode::Char('q'))), Action::Noop);
    }

    #[test]
    fn colon_enters_cmdline() {
        let mut s = VimState::new();
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char(':'))),
            Action::EnterCmdline
        );
    }

    #[test]
    fn cmdline_chars_and_specials() {
        assert_eq!(parse_cmdline(key(KeyCode::Char('w'))), Action::CmdlineChar('w'));
        assert_eq!(parse_cmdline(key(KeyCode::Backspace)), Action::CmdlineBackspace);
        assert_eq!(parse_cmdline(key(KeyCode::Enter)), Action::CmdlineExecute);
        assert_eq!(parse_cmdline(key(KeyCode::Esc)), Action::CmdlineCancel);
        assert_eq!(
            parse_cmdline(key_ctrl(KeyCode::Char('c'))),
            Action::CmdlineCancel
        );
    }

    // ─── operator pending ───

    #[test]
    fn d_then_w_emits_operator_motion() {
        let mut s = VimState::new();
        assert_eq!(parse_normal(&mut s, key(KeyCode::Char('d'))), Action::Noop);
        assert!(s.pending_operator.is_some());
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('w'))),
            Action::OperatorMotion(Operator::Delete, Motion::WordForward, 1)
        );
        assert!(s.pending_operator.is_none());
    }

    #[test]
    fn dd_emits_linewise_shortcut() {
        let mut s = VimState::new();
        parse_normal(&mut s, key(KeyCode::Char('d')));
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('d'))),
            Action::OperatorLinewise(Operator::Delete, 1)
        );
    }

    #[test]
    fn count_then_dd_multiplies() {
        let mut s = VimState::new();
        parse_normal(&mut s, key(KeyCode::Char('3')));
        parse_normal(&mut s, key(KeyCode::Char('d')));
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('d'))),
            Action::OperatorLinewise(Operator::Delete, 3)
        );
    }

    #[test]
    fn d3w_multiplies_counts() {
        let mut s = VimState::new();
        parse_normal(&mut s, key(KeyCode::Char('d')));
        parse_normal(&mut s, key(KeyCode::Char('3')));
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('w'))),
            Action::OperatorMotion(Operator::Delete, Motion::WordForward, 3)
        );
    }

    #[test]
    fn shorthand_x_is_delete_right() {
        let mut s = VimState::new();
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('x'))),
            Action::OperatorMotion(Operator::Delete, Motion::Right, 1)
        );
    }

    #[test]
    fn ctrl_x_explains_focused_block() {
        // `<C-x>` is wired to EXPLAIN against the DB block at the
        // cursor. Plain `x` stays bound to delete-right (covered
        // above) — only the CONTROL modifier changes the action.
        // Replaces the old `:explain` ex command (per project
        // directive: keymap > ex command).
        let mut s = VimState::new();
        assert_eq!(
            parse_normal(&mut s, key_ctrl(KeyCode::Char('x'))),
            Action::ExplainBlock
        );
    }

    #[test]
    fn gd_cycles_focused_block_display_mode() {
        // `gd` chord — first `g` arms the prefix and is a no-op,
        // second `d` resolves to the display-mode cycle action. Uses
        // the same `pending_g` plumbing as `gg`/`gt`/`gT`.
        let mut s = VimState::new();
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('g'))),
            Action::Noop
        );
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('d'))),
            Action::CycleDisplayMode
        );
    }

    #[test]
    fn gd_drops_stale_count_prefix() {
        // `5gd` shouldn't cycle five times — the count is meaningful
        // for `5gg` (goto line 5) but not for the per-press mode
        // cycle. We drain it instead of leaking it into the next
        // keystroke.
        let mut s = VimState::new();
        parse_normal(&mut s, key(KeyCode::Char('5')));
        parse_normal(&mut s, key(KeyCode::Char('g')));
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('d'))),
            Action::CycleDisplayMode
        );
        // Count drained — next plain `j` is a 1-step Down, not 5.
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('j'))),
            Action::Motion(Motion::Down, 1)
        );
    }

    #[test]
    fn shorthand_capital_d_is_delete_eol() {
        let mut s = VimState::new();
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('D'))),
            Action::OperatorMotion(Operator::Delete, Motion::LineEnd, 1)
        );
    }

    #[test]
    fn shorthand_capital_y_is_yank_line() {
        let mut s = VimState::new();
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('Y'))),
            Action::OperatorLinewise(Operator::Yank, 1)
        );
    }

    #[test]
    fn p_and_capital_p_are_paste() {
        let mut s = VimState::new();
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('p'))),
            Action::Paste(PastePos::After, 1)
        );
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('P'))),
            Action::Paste(PastePos::Before, 1)
        );
    }

    #[test]
    fn ctrl_d_does_not_become_delete_operator() {
        let mut s = VimState::new();
        // Regression: with naive `d` matching, Ctrl+D would set
        // pending_operator instead of producing HalfPageDown.
        assert_eq!(
            parse_normal(&mut s, key_ctrl(KeyCode::Char('d'))),
            Action::Motion(Motion::HalfPageDown, 1)
        );
        assert!(s.pending_operator.is_none());
    }

    #[test]
    fn esc_cancels_pending_operator() {
        let mut s = VimState::new();
        parse_normal(&mut s, key(KeyCode::Char('d')));
        assert!(s.pending_operator.is_some());
        parse_normal(&mut s, key(KeyCode::Esc));
        assert!(s.pending_operator.is_none());
    }

    // ─── text-object trigrams ───

    #[test]
    fn diw_emits_operator_text_object() {
        let mut s = VimState::new();
        parse_normal(&mut s, key(KeyCode::Char('d')));
        parse_normal(&mut s, key(KeyCode::Char('i')));
        assert!(s.pending_textobj_inner == Some(true));
        let action = parse_normal(&mut s, key(KeyCode::Char('w')));
        assert_eq!(
            action,
            Action::OperatorTextObject(
                Operator::Delete,
                TextObject::Word { around: false },
                1
            )
        );
        assert!(s.pending_operator.is_none());
        assert!(s.pending_textobj_inner.is_none());
    }

    #[test]
    fn ca_quote_emits_around_quote() {
        let mut s = VimState::new();
        parse_normal(&mut s, key(KeyCode::Char('c')));
        parse_normal(&mut s, key(KeyCode::Char('a')));
        let action = parse_normal(&mut s, key(KeyCode::Char('"')));
        assert_eq!(
            action,
            Action::OperatorTextObject(
                Operator::Change,
                TextObject::Quote {
                    delim: '"',
                    around: true,
                },
                1
            )
        );
    }

    #[test]
    fn yi_paren_emits_inner_pair() {
        let mut s = VimState::new();
        parse_normal(&mut s, key(KeyCode::Char('y')));
        parse_normal(&mut s, key(KeyCode::Char('i')));
        let action = parse_normal(&mut s, key(KeyCode::Char('(')));
        assert_eq!(
            action,
            Action::OperatorTextObject(
                Operator::Yank,
                TextObject::Pair {
                    open: '(',
                    close: ')',
                    around: false,
                },
                1
            )
        );
    }

    #[test]
    fn dib_aliases_to_paren_pair() {
        // `b` is vim's alias for `()`.
        let mut s = VimState::new();
        parse_normal(&mut s, key(KeyCode::Char('d')));
        parse_normal(&mut s, key(KeyCode::Char('i')));
        let action = parse_normal(&mut s, key(KeyCode::Char('b')));
        assert_eq!(
            action,
            Action::OperatorTextObject(
                Operator::Delete,
                TextObject::Pair {
                    open: '(',
                    close: ')',
                    around: false,
                },
                1
            )
        );
    }

    #[test]
    fn di_capital_b_aliases_to_brace_pair() {
        // `B` is vim's alias for `{}`.
        let mut s = VimState::new();
        parse_normal(&mut s, key(KeyCode::Char('d')));
        parse_normal(&mut s, key(KeyCode::Char('i')));
        let action = parse_normal(&mut s, key(KeyCode::Char('B')));
        assert_eq!(
            action,
            Action::OperatorTextObject(
                Operator::Delete,
                TextObject::Pair {
                    open: '{',
                    close: '}',
                    around: false,
                },
                1
            )
        );
    }

    #[test]
    fn unknown_text_object_target_cancels() {
        let mut s = VimState::new();
        parse_normal(&mut s, key(KeyCode::Char('d')));
        parse_normal(&mut s, key(KeyCode::Char('i')));
        let action = parse_normal(&mut s, key(KeyCode::Char('z')));
        assert_eq!(action, Action::Noop);
        assert!(s.pending_operator.is_none());
        assert!(s.pending_textobj_inner.is_none());
    }

    #[test]
    fn esc_during_text_object_prefix_cancels() {
        let mut s = VimState::new();
        parse_normal(&mut s, key(KeyCode::Char('d')));
        parse_normal(&mut s, key(KeyCode::Char('i')));
        parse_normal(&mut s, key(KeyCode::Esc));
        assert!(s.pending_operator.is_none());
        assert!(s.pending_textobj_inner.is_none());
    }

    #[test]
    fn standalone_i_still_enters_insert_when_no_operator() {
        let mut s = VimState::new();
        // Without a pending operator, `i` is the regular insert command.
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('i'))),
            Action::EnterInsert(InsertPos::Current)
        );
    }

    // ─── find / till ───

    #[test]
    fn f_then_char_emits_find_forward() {
        let mut s = VimState::new();
        assert_eq!(parse_normal(&mut s, key(KeyCode::Char('f'))), Action::Noop);
        assert_eq!(s.pending_find_kind, Some(FindKind::F));
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('o'))),
            Action::Motion(Motion::FindForward('o'), 1)
        );
        assert!(s.pending_find_kind.is_none());
    }

    #[test]
    fn capital_f_then_char_searches_backward() {
        let mut s = VimState::new();
        parse_normal(&mut s, key(KeyCode::Char('F')));
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('o'))),
            Action::Motion(Motion::FindBackward('o'), 1)
        );
    }

    #[test]
    fn t_and_capital_t_emit_till_motions() {
        let mut s = VimState::new();
        parse_normal(&mut s, key(KeyCode::Char('t')));
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('o'))),
            Action::Motion(Motion::TillForward('o'), 1)
        );
        parse_normal(&mut s, key(KeyCode::Char('T')));
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('o'))),
            Action::Motion(Motion::TillBackward('o'), 1)
        );
    }

    #[test]
    fn count_amplifies_find() {
        let mut s = VimState::new();
        parse_normal(&mut s, key(KeyCode::Char('3')));
        parse_normal(&mut s, key(KeyCode::Char('f')));
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('o'))),
            Action::Motion(Motion::FindForward('o'), 3)
        );
    }

    #[test]
    fn df_emits_operator_motion_with_find() {
        let mut s = VimState::new();
        parse_normal(&mut s, key(KeyCode::Char('d')));
        parse_normal(&mut s, key(KeyCode::Char('f')));
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('.'))),
            Action::OperatorMotion(Operator::Delete, Motion::FindForward('.'), 1)
        );
        assert!(s.pending_operator.is_none());
    }

    #[test]
    fn semicolon_repeats_last_find() {
        let mut s = VimState::new();
        s.last_find = Some(Motion::FindForward('o'));
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char(';'))),
            Action::Motion(Motion::FindForward('o'), 1)
        );
    }

    #[test]
    fn comma_reverses_last_find() {
        let mut s = VimState::new();
        s.last_find = Some(Motion::FindForward('o'));
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char(','))),
            Action::Motion(Motion::FindBackward('o'), 1)
        );
    }

    #[test]
    fn semicolon_with_no_history_is_noop() {
        let mut s = VimState::new();
        assert_eq!(parse_normal(&mut s, key(KeyCode::Char(';'))), Action::Noop);
    }

    #[test]
    fn esc_during_pending_find_cancels() {
        let mut s = VimState::new();
        parse_normal(&mut s, key(KeyCode::Char('f')));
        parse_normal(&mut s, key(KeyCode::Esc));
        assert!(s.pending_find_kind.is_none());
    }

    // ─── undo / redo / repeat ───

    #[test]
    fn u_emits_undo() {
        let mut s = VimState::new();
        assert_eq!(parse_normal(&mut s, key(KeyCode::Char('u'))), Action::Undo);
    }

    #[test]
    fn ctrl_r_emits_redo() {
        let mut s = VimState::new();
        assert_eq!(
            parse_normal(&mut s, key_ctrl(KeyCode::Char('r'))),
            Action::Redo
        );
    }

    #[test]
    fn dot_emits_repeat_change() {
        let mut s = VimState::new();
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('.'))),
            Action::RepeatChange(1)
        );
    }

    #[test]
    fn count_dot_repeats_n_times() {
        let mut s = VimState::new();
        parse_normal(&mut s, key(KeyCode::Char('5')));
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('.'))),
            Action::RepeatChange(5)
        );
    }

    // ─── search ───

    #[test]
    fn slash_enters_forward_search() {
        let mut s = VimState::new();
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('/'))),
            Action::EnterSearch(true)
        );
    }

    #[test]
    fn question_enters_backward_search() {
        let mut s = VimState::new();
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('?'))),
            Action::EnterSearch(false)
        );
    }

    #[test]
    fn n_repeats_search_capital_n_reverses() {
        let mut s = VimState::new();
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('n'))),
            Action::SearchRepeat { reverse: false }
        );
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('N'))),
            Action::SearchRepeat { reverse: true }
        );
    }

    #[test]
    fn search_prompt_keys() {
        assert_eq!(parse_search(key(KeyCode::Char('a'))), Action::SearchChar('a'));
        assert_eq!(parse_search(key(KeyCode::Backspace)), Action::SearchBackspace);
        assert_eq!(parse_search(key(KeyCode::Enter)), Action::SearchExecute);
        assert_eq!(parse_search(key(KeyCode::Esc)), Action::SearchCancel);
    }

    // ─── quick open ───

    #[test]
    fn ctrl_p_enters_quick_open() {
        let mut s = VimState::new();
        assert_eq!(
            parse_normal(&mut s, key_ctrl(KeyCode::Char('p'))),
            Action::EnterQuickOpen
        );
    }

    #[test]
    fn lowercase_p_is_still_paste() {
        // Regression: Ctrl+P shouldn't shadow plain `p`.
        let mut s = VimState::new();
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('p'))),
            Action::Paste(PastePos::After, 1)
        );
    }

    // ─── tree ───

    #[test]
    fn ctrl_e_toggles_tree() {
        let mut s = VimState::new();
        assert_eq!(
            parse_normal(&mut s, key_ctrl(KeyCode::Char('e'))),
            Action::TreeToggle
        );
    }

    #[test]
    fn tab_emits_focus_swap() {
        let mut s = VimState::new();
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Tab)),
            Action::FocusSwap
        );
    }

    #[test]
    fn tree_navigation_keys() {
        assert_eq!(parse_tree(key(KeyCode::Char('j'))), Action::TreeSelectNext);
        assert_eq!(parse_tree(key(KeyCode::Char('k'))), Action::TreeSelectPrev);
        assert_eq!(parse_tree(key(KeyCode::Char('g'))), Action::TreeSelectFirst);
        assert_eq!(parse_tree(key(KeyCode::Char('G'))), Action::TreeSelectLast);
        assert_eq!(parse_tree(key(KeyCode::Enter)), Action::TreeActivate);
        assert_eq!(parse_tree(key(KeyCode::Char('l'))), Action::TreeActivate);
        assert_eq!(parse_tree(key(KeyCode::Char('h'))), Action::TreeCollapse);
        assert_eq!(parse_tree(key(KeyCode::Char('R'))), Action::TreeRefresh);
        assert_eq!(parse_tree(key(KeyCode::Tab)), Action::FocusSwap);
        assert_eq!(parse_tree(key(KeyCode::Esc)), Action::FocusSwap);
        assert_eq!(
            parse_tree(key_ctrl(KeyCode::Char('e'))),
            Action::TreeToggle
        );
    }

    #[test]
    fn tree_shortcuts_for_file_ops() {
        assert_eq!(parse_tree(key(KeyCode::Char('a'))), Action::TreeCreate);
        assert_eq!(parse_tree(key(KeyCode::Char('r'))), Action::TreeRename);
        assert_eq!(parse_tree(key(KeyCode::Char('d'))), Action::TreeDelete);
        assert_eq!(parse_tree(key(KeyCode::Char('D'))), Action::TreeDelete);
    }

    // ─── tabs ───

    #[test]
    fn gt_emits_tab_next() {
        let mut s = VimState::new();
        parse_normal(&mut s, key(KeyCode::Char('g')));
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('t'))),
            Action::TabNext
        );
    }

    #[test]
    fn capital_gt_emits_tab_prev() {
        let mut s = VimState::new();
        parse_normal(&mut s, key(KeyCode::Char('g')));
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('T'))),
            Action::TabPrev
        );
    }

    #[test]
    fn count_gt_jumps_to_tab() {
        let mut s = VimState::new();
        parse_normal(&mut s, key(KeyCode::Char('3')));
        parse_normal(&mut s, key(KeyCode::Char('g')));
        assert_eq!(
            parse_normal(&mut s, key(KeyCode::Char('t'))),
            Action::TabGoto(3)
        );
    }

    #[test]
    fn quickopen_prompt_keys() {
        assert_eq!(
            parse_quickopen(key(KeyCode::Char('a'))),
            Action::QuickOpenChar('a')
        );
        assert_eq!(
            parse_quickopen(key(KeyCode::Backspace)),
            Action::QuickOpenBackspace
        );
        assert_eq!(
            parse_quickopen(key(KeyCode::Up)),
            Action::QuickOpenSelectPrev
        );
        assert_eq!(
            parse_quickopen(key(KeyCode::Down)),
            Action::QuickOpenSelectNext
        );
        assert_eq!(
            parse_quickopen(key_ctrl(KeyCode::Char('n'))),
            Action::QuickOpenSelectNext
        );
        assert_eq!(
            parse_quickopen(key_ctrl(KeyCode::Char('p'))),
            Action::QuickOpenSelectPrev
        );
        assert_eq!(
            parse_quickopen(key(KeyCode::Enter)),
            Action::QuickOpenExecute
        );
        assert_eq!(parse_quickopen(key(KeyCode::Esc)), Action::QuickOpenCancel);
    }

    #[test]
    fn insert_translates_chars_and_specials() {
        assert_eq!(parse_insert(key(KeyCode::Char('x'))), Action::InsertChar('x'));
        assert_eq!(parse_insert(key(KeyCode::Enter)), Action::InsertNewline);
        assert_eq!(parse_insert(key(KeyCode::Backspace)), Action::DeleteBackward);
        assert_eq!(parse_insert(key(KeyCode::Delete)), Action::DeleteForward);
        assert_eq!(parse_insert(key(KeyCode::Esc)), Action::ExitInsert);
        assert_eq!(
            parse_insert(key_ctrl(KeyCode::Char('c'))),
            Action::ExitInsert
        );
    }

    #[test]
    fn esc_in_normal_clears_pending() {
        let mut s = VimState::new();
        parse_normal(&mut s, key(KeyCode::Char('5')));
        parse_normal(&mut s, key(KeyCode::Esc));
        assert!(s.pending_count.is_none());
    }

    #[test]
    fn enter_in_normal_opens_db_row_detail() {
        let mut s = VimState::new();
        let action = parse_normal(&mut s, key(KeyCode::Enter));
        assert!(matches!(action, Action::OpenDbRowDetail));
    }

    #[test]
    fn db_row_detail_close_keys() {
        // Modal close is `Ctrl-C` only. `Esc` and `q` keep their
        // vim semantics so they don't accidentally yank the user
        // out of the modal mid-chord.
        let mut s = VimState::new();
        assert!(matches!(
            parse_db_row_detail(&mut s, key_ctrl(KeyCode::Char('c'))),
            Action::CloseDbRowDetail
        ));
        // `Esc` falls through to parse_normal which returns Noop
        // (and resets pending state — same as vim).
        let mut s = VimState::new();
        assert!(matches!(
            parse_db_row_detail(&mut s, key(KeyCode::Esc)),
            Action::Noop
        ));
        // `q` falls through to parse_normal. There's no `q` binding
        // in normal mode (macros aren't implemented), so it lands
        // on Noop too.
        let mut s = VimState::new();
        assert!(matches!(
            parse_db_row_detail(&mut s, key(KeyCode::Char('q'))),
            Action::Noop
        ));
    }

    #[test]
    fn db_row_detail_uppercase_y_copies_row_as_json() {
        let mut s = VimState::new();
        // `Y` is the row-as-JSON shortcut; `y` stays free so the
        // standard yank chord family (`yi{`, `yy`, `y$` …) works.
        let action = parse_db_row_detail(
            &mut s,
            KeyEvent::new(KeyCode::Char('Y'), KeyModifiers::SHIFT),
        );
        assert!(matches!(action, Action::CopyDbRowDetailJson));
    }

    #[test]
    fn db_row_detail_lowercase_y_starts_yank_chord() {
        // Pressing `y` alone must NOT trigger the row-JSON copy —
        // it should set up the operator-pending state so the next
        // keystroke (motion / textobj) completes the yank.
        let mut s = VimState::new();
        let action = parse_db_row_detail(&mut s, key(KeyCode::Char('y')));
        assert!(
            matches!(action, Action::Noop),
            "expected Noop (operator-pending), got {action:?}"
        );
        // `i` after `y` → text-object pending.
        let action = parse_db_row_detail(&mut s, key(KeyCode::Char('i')));
        assert!(matches!(action, Action::Noop));
        // `{` completes `yi{` → OperatorTextObject(Yank, ...).
        let action = parse_db_row_detail(&mut s, key(KeyCode::Char('{')));
        assert!(
            matches!(
                action,
                Action::OperatorTextObject(Operator::Yank, _, _)
            ),
            "expected yank text-object, got {action:?}"
        );
    }

    #[test]
    fn db_row_detail_forwards_motions_from_normal() {
        // The modal piggybacks on `parse_normal`, so j/k/h/l/wbe/0/$
        // and friends all generate Motion actions just like in the
        // editor.
        let mut s = VimState::new();
        for code in [
            KeyCode::Char('j'),
            KeyCode::Char('k'),
            KeyCode::Char('h'),
            KeyCode::Char('l'),
            KeyCode::Char('w'),
            KeyCode::Char('b'),
            KeyCode::Char('e'),
            KeyCode::Char('$'),
            KeyCode::Char('0'),
            KeyCode::Char('G'),
        ] {
            let action = parse_db_row_detail(&mut s, key(code));
            assert!(
                matches!(action, Action::Motion(_, _)),
                "expected Motion for {code:?}, got {action:?}"
            );
        }
    }

    #[test]
    fn db_row_detail_blocks_mutations_and_focus_escapes() {
        // Insert / paste / undo / ex / search / run-block / etc.
        // must NOT leak through — modal is read-only and owns input.
        // Search and ex would transition mode away from DbRowDetail
        // and break the render path. Visual is allowed (handled
        // separately) because the modal renders independently of
        // mode.
        for code in [
            KeyCode::Char('i'),
            KeyCode::Char('a'),
            KeyCode::Char('o'),
            KeyCode::Char('p'),
            KeyCode::Char(':'),
            KeyCode::Char('/'),
            KeyCode::Char('?'),
            KeyCode::Char('u'),
            KeyCode::Char('r'),
        ] {
            let mut s = VimState::new();
            let action = parse_db_row_detail(&mut s, key(code));
            assert!(
                matches!(action, Action::Noop),
                "expected Noop for {code:?}, got {action:?}"
            );
        }
    }

    #[test]
    fn db_row_detail_allows_visual_mode_entry() {
        // The modal renders independently of `app.vim.mode`, so
        // `v`/`V` flow through to enter visual selection. Yank
        // (`y{motion}` or `viwy`) then captures the highlighted
        // range from the modal's body doc.
        let mut s = VimState::new();
        assert!(matches!(
            parse_db_row_detail(&mut s, key(KeyCode::Char('v'))),
            Action::EnterVisual
        ));
        let mut s = VimState::new();
        assert!(matches!(
            parse_db_row_detail(&mut s, key(KeyCode::Char('V'))),
            Action::EnterVisualLine
        ));
    }

}
