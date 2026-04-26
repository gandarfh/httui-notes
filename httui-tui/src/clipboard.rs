//! System clipboard wrapper around `arboard`.
//!
//! Yank operations (`y{motion}`, `yy`, `yiw`, visual+`y`, the
//! row-detail modal's `y`) call `set_text` after writing to the
//! unnamed register so the user can paste outside the TUI. Failures
//! are returned as `Err(String)` for the caller to surface on the
//! status bar — common reasons: SSH session without an X/Wayland
//! forward, headless container, sandbox.

use arboard::Clipboard;

/// Push `text` to the OS clipboard. Each call opens a fresh
/// `Clipboard` handle — the alternative (caching one in `App`)
/// keeps a system resource alive for the whole TUI lifetime, which
/// can interact poorly with screen lockers / paste daemons. Yank is
/// rare enough that the per-call open is invisible.
pub fn set_text(text: &str) -> Result<(), String> {
    let mut clip = Clipboard::new().map_err(|e| format!("clipboard unavailable: {e}"))?;
    clip.set_text(text.to_string())
        .map_err(|e| format!("clipboard write failed: {e}"))
}
