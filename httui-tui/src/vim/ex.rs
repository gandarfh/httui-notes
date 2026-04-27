//! Ex commands — the `:foo` family. Round 2 covers the bare minimum:
//! `:w`, `:q`, `:wq` (alias `:x`), `:q!`. Everything else returns
//! [`ExResult::Unknown`] so callers can surface a `not an editor command`
//! error in the status bar.
//!
//! Persistence side-effect: `:w` serializes the document via
//! [`crate::buffer::Document::to_markdown`] and writes it to
//! `app.document_path`. No path → error.

use std::path::PathBuf;

use crate::app::App;

/// Parsed ex command. `force` is the trailing `!`: `:q!` overrides the
/// dirty-buffer guard; `:e!` is the same idea for opening another file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExCmd {
    Write,
    Quit { force: bool },
    WriteQuit,
    /// `:e <path>` / `:edit <path>` / `:e! <path>`.
    Edit { path: String, force: bool },
    /// `:noh` / `:nohlsearch` — clear the active search highlight.
    NoHighlight,
    /// `:explain` / `:exp` — wrap the focused DB block's query in
    /// the dialect's EXPLAIN keyword and run it. Output appears in
    /// the block's result panel like a normal run.
    Explain,
}

/// Outcome of an ex command. `Ok(msg)` carries a status string for the
/// footer; `Err(msg)` does the same but signals failure styling.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExResult {
    Ok(String),
    Err(String),
    /// Quit was requested — caller is responsible for setting
    /// `should_quit = true` (after persisting any final state).
    Quit,
    /// Buffer was empty (just `:`<Enter>) — silently no-op.
    Empty,
    /// Did not match any known command.
    Unknown(String),
}

/// Parse the cmdline buffer (no leading `:`) into an [`ExCmd`].
pub fn parse(buf: &str) -> Result<ExCmd, ParseError> {
    let trimmed = buf.trim();
    if trimmed.is_empty() {
        return Err(ParseError::Empty);
    }

    // Argument-bearing commands. Split on the first whitespace so the
    // head is the command and the tail is its (possibly empty) argument.
    let (head, rest) = trimmed
        .split_once(char::is_whitespace)
        .unwrap_or((trimmed, ""));
    let args = rest.trim();
    let force = head.ends_with('!');
    let head_no_bang = head.trim_end_matches('!');

    if matches!(head_no_bang, "e" | "edit") {
        if args.is_empty() {
            // `:e` / `:edit` with no arg — reloading the current buffer
            // is a vim convenience we don't support yet, so flag it as
            // a missing argument.
            return Err(ParseError::MissingArg(if force { "e!" } else { "e" }.into()));
        }
        return Ok(ExCmd::Edit {
            path: args.to_string(),
            force,
        });
    }

    match trimmed {
        "w" => Ok(ExCmd::Write),
        "q" => Ok(ExCmd::Quit { force: false }),
        "q!" => Ok(ExCmd::Quit { force: true }),
        "wq" | "x" => Ok(ExCmd::WriteQuit),
        "noh" | "nohl" | "nohls" | "nohlsearch" => Ok(ExCmd::NoHighlight),
        "exp" | "explain" => Ok(ExCmd::Explain),
        other => Err(ParseError::Unknown(other.to_string())),
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParseError {
    Empty,
    Unknown(String),
    /// Command recognized but its required argument is missing
    /// (`:e` with no path, etc.).
    MissingArg(String),
}

/// Run the parsed [`ExCmd`] against `app`. Mutates `app.should_quit`
/// when appropriate. Returns a status message to display.
pub fn execute(app: &mut App, cmd: ExCmd) -> ExResult {
    match cmd {
        ExCmd::Write => match write_document(app) {
            Ok(msg) => ExResult::Ok(msg),
            Err(msg) => ExResult::Err(msg),
        },
        ExCmd::Quit { force } => quit_or_close(app, force),
        ExCmd::WriteQuit => match write_document(app) {
            Ok(_) => quit_or_close(app, /* force = */ true),
            Err(msg) => ExResult::Err(msg),
        },
        ExCmd::Edit { path, force } => {
            match app.open_document(PathBuf::from(path), force) {
                Ok(msg) => ExResult::Ok(msg),
                Err(msg) => ExResult::Err(msg),
            }
        }
        ExCmd::NoHighlight => {
            // Hide matches without losing the pattern — `n`/`N` keep
            // navigating; the next `/`-search re-arms `search_highlight`.
            app.vim.search_highlight = false;
            ExResult::Ok(String::new())
        }
        ExCmd::Explain => {
            // Delegate to dispatch so the EXPLAIN run flows through
            // the same spawn / cancel / status pipeline as a normal
            // `r` press. Status feedback is handled inside.
            crate::vim::dispatch::run_explain_block(app);
            ExResult::Ok(String::new())
        }
    }
}


/// Convenience: parse + execute in one call. The cmdline buffer
/// passed in must NOT include the leading `:`.
pub fn run(app: &mut App, buf: &str) -> ExResult {
    match parse(buf) {
        Ok(cmd) => execute(app, cmd),
        Err(ParseError::Empty) => ExResult::Empty,
        Err(ParseError::Unknown(s)) => ExResult::Unknown(s),
        Err(ParseError::MissingArg(cmd)) => {
            ExResult::Err(format!("E471: Argument required for :{cmd}"))
        }
    }
}

/// Behavior of `:q` / `:wq` / `:x`:
///
/// 1. The active tab has more than one pane → close the focused split
///    (vim native window-close).
/// 2. Otherwise → close the active tab.
/// 3. The last tab just closed → quit the app.
///
/// `force == false` rejects when the closed unit has dirty content.
fn quit_or_close(app: &mut App, force: bool) -> ExResult {
    let leaf_count = app
        .active_tab()
        .map(|t| t.leaf_count())
        .unwrap_or(0);
    if leaf_count > 1 {
        // Closing a split. Refuse only when the *focused* pane is dirty
        // — sibling splits are unaffected.
        if !force && app.document().is_some_and(|d| d.is_dirty()) {
            return ExResult::Err(
                "no write since last change (add ! to override)".into(),
            );
        }
        if let Some(tab) = app.active_tab_mut() {
            tab.close_focused();
        }
        return ExResult::Ok(String::new());
    }
    // Single pane in the tab: close the whole tab. close_tab() handles
    // its own dirty check.
    match app.close_tab(force) {
        Ok(msg) => {
            if app.tabs.is_empty() {
                app.should_quit = true;
                ExResult::Quit
            } else {
                ExResult::Ok(msg)
            }
        }
        Err(msg) => ExResult::Err(msg),
    }
}

fn write_document(app: &mut App) -> Result<String, String> {
    let Some(file) = app.document_path().cloned() else {
        return Err("no file name".into());
    };
    let Some(doc) = app.tabs.active_document_mut() else {
        return Err("no buffer".into());
    };
    let body = doc.to_markdown();
    // `document_path` is stored relative to the active vault (matches
    // how `pick_initial_file` and `read_note` work). Reuse `write_note`
    // so the vault join + parent-dir creation logic stays in one place.
    let vault = app.vault_path.to_string_lossy().into_owned();
    let file_str = file.to_string_lossy().into_owned();
    httui_core::fs::write_note(&vault, &file_str, &body)
        .map_err(|e| format!("write failed: {e}"))?;
    doc.mark_clean();
    let bytes = body.len();
    let lines = body.lines().count();
    let name = file
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or(file_str);
    Ok(format!("\"{name}\" {lines}L, {bytes}B written"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_known_commands() {
        assert_eq!(parse("w"), Ok(ExCmd::Write));
        assert_eq!(parse("q"), Ok(ExCmd::Quit { force: false }));
        assert_eq!(parse("q!"), Ok(ExCmd::Quit { force: true }));
        assert_eq!(parse("wq"), Ok(ExCmd::WriteQuit));
        assert_eq!(parse("x"), Ok(ExCmd::WriteQuit));
    }

    #[test]
    fn parse_noh_aliases() {
        for alias in ["noh", "nohl", "nohls", "nohlsearch"] {
            assert_eq!(parse(alias), Ok(ExCmd::NoHighlight));
        }
    }

    #[test]
    fn parse_trims_whitespace() {
        assert_eq!(parse("  w  "), Ok(ExCmd::Write));
    }

    #[test]
    fn parse_empty_is_error() {
        assert_eq!(parse(""), Err(ParseError::Empty));
        assert_eq!(parse("   "), Err(ParseError::Empty));
    }

    #[test]
    fn parse_unknown() {
        match parse("frobnicate") {
            Err(ParseError::Unknown(s)) => assert_eq!(s, "frobnicate"),
            other => panic!("expected unknown, got {other:?}"),
        }
    }

    #[test]
    fn parse_edit_with_path() {
        assert_eq!(
            parse("e foo.md"),
            Ok(ExCmd::Edit {
                path: "foo.md".into(),
                force: false
            })
        );
        assert_eq!(
            parse("edit notes/today.md"),
            Ok(ExCmd::Edit {
                path: "notes/today.md".into(),
                force: false
            })
        );
    }

    #[test]
    fn parse_edit_force_variants() {
        assert_eq!(
            parse("e! foo.md"),
            Ok(ExCmd::Edit {
                path: "foo.md".into(),
                force: true
            })
        );
        assert_eq!(
            parse("edit! foo.md"),
            Ok(ExCmd::Edit {
                path: "foo.md".into(),
                force: true
            })
        );
    }

    #[test]
    fn parse_edit_missing_arg() {
        match parse("e") {
            Err(ParseError::MissingArg(s)) => assert_eq!(s, "e"),
            other => panic!("expected missing arg, got {other:?}"),
        }
        match parse("e!") {
            Err(ParseError::MissingArg(s)) => assert_eq!(s, "e!"),
            other => panic!("expected missing arg, got {other:?}"),
        }
        match parse("edit") {
            Err(ParseError::MissingArg(s)) => assert_eq!(s, "e"),
            other => panic!("expected missing arg, got {other:?}"),
        }
    }

    #[test]
    fn parse_no_longer_recognizes_file_op_commands() {
        // `:new`, `:mv`, `:rm` are features now, not vim natives.
        // The cmdline parser must reject them so users learn to use the
        // tree shortcuts (`a`/`r`/`d`).
        assert!(matches!(parse("new foo.md"), Err(ParseError::Unknown(_))));
        assert!(matches!(parse("mv foo.md"), Err(ParseError::Unknown(_))));
        assert!(matches!(parse("rm! foo.md"), Err(ParseError::Unknown(_))));
    }

    #[test]
    fn parse_no_longer_recognizes_tab_commands() {
        // Tab management is a TUI feature now — driven by Ctrl+T (new
        // tab via Quick Open) and Ctrl+W (close tab). The cmdline
        // parser must reject the old aliases so they stay one source
        // of truth.
        assert!(matches!(parse("tabnew foo.md"), Err(ParseError::Unknown(_))));
        assert!(matches!(parse("tabclose"), Err(ParseError::Unknown(_))));
    }
}
