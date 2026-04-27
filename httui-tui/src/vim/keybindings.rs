//! Centralized table of *app-level* keybindings — shortcuts that
//! aren't part of the vim engine itself (motions, operators, mode
//! transitions). Putting them here makes them easy to find, swap,
//! and — eventually — promote to a user-config (`vim.toml`-style).
//!
//! The vim primitives (`hjkl`, `wbe`, `gg`/`G`, `f`/`t`, `d`/`c`/`y`,
//! `i`/`a`/`o`, `v`/`V`, `/`, `:`, `u`, `p` …) deliberately stay
//! hardcoded in `parser.rs`: rebinding `j` would break user mental
//! model and surprise plugin/extension authors. Everything in *this*
//! module is fair game for end-user remapping.
//!
//! Each binding is exposed both as a constant (so call sites stay
//! grep-able for "what does Ctrl+P do") and as a `matches_*` helper
//! (so the dispatch parser can ask "is this key the QuickOpen
//! trigger?" without re-typing the modifier match arm).
//!
//! ## Adding a new shortcut
//!
//! 1. Add a `KeyChord` constant near the bottom (single-key) or a
//!    `pending_*` helper (multi-key chord like `gc`).
//! 2. Add a `matches_*` helper that wraps the comparison.
//! 3. Use the helper in `parser.rs::parse_normal`.
//! 4. Promote to user-config when `vim.toml` keymap loading lands.

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

/// Single-key combination — modifiers + base key. The constants
/// below name every app-level shortcut; `matches_*` helpers compare
/// an incoming `KeyEvent` against them.
#[derive(Debug, Clone, Copy)]
pub struct KeyChord {
    pub modifiers: KeyModifiers,
    pub code: KeyCode,
}

impl KeyChord {
    pub const fn new(modifiers: KeyModifiers, code: KeyCode) -> Self {
        Self { modifiers, code }
    }

    pub fn matches(&self, key: &KeyEvent) -> bool {
        key.modifiers == self.modifiers && key.code == self.code
    }
}

// ───────────── single-key shortcuts ─────────────

/// `Ctrl+P` — open the quick-open file picker modal.
pub const QUICK_OPEN: KeyChord =
    KeyChord::new(KeyModifiers::CONTROL, KeyCode::Char('p'));

/// `Ctrl+E` — toggle the file-tree sidebar focus.
pub const TREE_TOGGLE: KeyChord =
    KeyChord::new(KeyModifiers::CONTROL, KeyCode::Char('e'));

/// `Tab` — swap focus between the sidebar and the editor.
/// `matches_focus_swap` accepts any modifier (terminals send
/// `<S-Tab>` with SHIFT for the reverse direction); the constant
/// stays as documentation of the canonical binding.
#[allow(dead_code)]
pub const FOCUS_SWAP: KeyChord = KeyChord::new(KeyModifiers::NONE, KeyCode::Tab);

/// `r` (no modifier) — run the executable block at the cursor.
/// Vim's `r{char}` replace-single-char isn't implemented, so the
/// key is free for our use.
pub const RUN_BLOCK: KeyChord = KeyChord::new(KeyModifiers::NONE, KeyCode::Char('r'));

/// `<CR>` (Enter) in normal mode — open the DB row-detail modal
/// when the cursor is parked on a result row. Dispatch checks the
/// cursor; on any other position it's a no-op. `<CR>` in normal
/// is `+` in stock vim, which we don't bind.
pub const OPEN_DB_ROW_DETAIL: KeyChord =
    KeyChord::new(KeyModifiers::NONE, KeyCode::Enter);

// ───────────── multi-key chords ─────────────

/// `Ctrl+L` — open the connection picker for the DB block at the
/// cursor. Vim binds `Ctrl+L` to "redraw screen" by default; we
/// don't implement that, so the slot is free. Mnemonic: "L" =
/// **list** of connections.
pub const OPEN_CONNECTION_PICKER: KeyChord =
    KeyChord::new(KeyModifiers::CONTROL, KeyCode::Char('l'));

/// `Ctrl+X` — wrap the focused DB block's query in the dialect's
/// EXPLAIN keyword and run it. Vim binds `Ctrl+X` to "decrement
/// number under cursor" (the counterpart to `Ctrl+A`); we don't
/// implement either, so the slot is free. Mnemonic: "X" = E**X**plain.
pub const EXPLAIN_BLOCK: KeyChord =
    KeyChord::new(KeyModifiers::CONTROL, KeyCode::Char('x'));

/// `Ctrl+A` — open the inline alias-edit prompt for the focused
/// block. Vim's `Ctrl+A` is "increment number under cursor" (paired
/// with `Ctrl+X`); we don't implement either, so the slot is free.
/// Mnemonic: "A" = **A**lias.
pub const EDIT_BLOCK_ALIAS: KeyChord =
    KeyChord::new(KeyModifiers::CONTROL, KeyCode::Char('a'));

// ───────────── helpers ─────────────

pub fn matches_quick_open(key: &KeyEvent) -> bool {
    QUICK_OPEN.matches(key)
}

pub fn matches_tree_toggle(key: &KeyEvent) -> bool {
    TREE_TOGGLE.matches(key)
}

pub fn matches_focus_swap(key: &KeyEvent) -> bool {
    // `Tab` in some terminals carries SHIFT for `<S-Tab>`; we accept
    // any modifier set since the focus swap is symmetric.
    matches!(key.code, KeyCode::Tab)
}

pub fn matches_run_block(key: &KeyEvent) -> bool {
    RUN_BLOCK.matches(key)
}

pub fn matches_open_db_row_detail(key: &KeyEvent) -> bool {
    OPEN_DB_ROW_DETAIL.matches(key)
}

pub fn matches_open_connection_picker(key: &KeyEvent) -> bool {
    OPEN_CONNECTION_PICKER.matches(key)
}

pub fn matches_explain_block(key: &KeyEvent) -> bool {
    EXPLAIN_BLOCK.matches(key)
}

pub fn matches_edit_block_alias(key: &KeyEvent) -> bool {
    EDIT_BLOCK_ALIAS.matches(key)
}
