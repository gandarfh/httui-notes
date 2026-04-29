use crossterm::{
    event::{DisableMouseCapture, EnableMouseCapture},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{backend::CrosstermBackend, Terminal};
use std::io::{self, Stdout};

use crate::error::{TuiError, TuiResult};

pub type Tui = Terminal<CrosstermBackend<Stdout>>;

/// Switch the terminal into alt screen + raw mode, optionally enabling
/// mouse capture. Returns a [`Terminal`] handle ready for drawing.
pub fn setup(mouse: bool) -> TuiResult<Tui> {
    enable_raw_mode().map_err(|e| TuiError::Terminal(format!("enable_raw_mode: {e}")))?;
    let mut stdout = io::stdout();
    if mouse {
        execute!(stdout, EnterAlternateScreen, EnableMouseCapture)
            .map_err(|e| TuiError::Terminal(format!("enter alt screen: {e}")))?;
    } else {
        execute!(stdout, EnterAlternateScreen)
            .map_err(|e| TuiError::Terminal(format!("enter alt screen: {e}")))?;
    }
    let backend = CrosstermBackend::new(stdout);
    let terminal =
        Terminal::new(backend).map_err(|e| TuiError::Terminal(format!("ratatui new: {e}")))?;
    Ok(terminal)
}

/// Restore the terminal to its previous state. Idempotent — calling twice
/// (e.g. once in normal teardown, once via the panic hook) is harmless.
pub fn teardown(terminal: &mut Tui) -> TuiResult<()> {
    let _ = disable_raw_mode();
    let _ = execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen,
        DisableMouseCapture
    );
    let _ = terminal.show_cursor();
    Ok(())
}

/// Restore the terminal directly via stdout, without owning a `Terminal`
/// handle. Used by the panic hook, which runs from a context where the
/// `Terminal` value is unreachable.
pub fn restore_raw_stdout() {
    let _ = disable_raw_mode();
    let _ = execute!(io::stdout(), LeaveAlternateScreen, DisableMouseCapture);
}

/// Install a panic hook that restores the terminal *before* the default
/// hook prints the panic message. Without this, panics leave the terminal
/// in raw / alt-screen mode and the trace is unreadable.
pub fn install_panic_hook() {
    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        restore_raw_stdout();
        prev(info);
    }));
}
