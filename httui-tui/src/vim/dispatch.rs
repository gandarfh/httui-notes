use crossterm::event::KeyEvent;
use ropey::Rope;
use tokio_util::sync::CancellationToken;

use crate::app::{App, StatusKind};
use crate::buffer::{block::ExecutionState, Cursor, Segment};
use crate::buffer::block::BlockNode;
use crate::vim::change::{ChangeOrigin, ChangeRecord};
use crate::vim::ex::{self, ExResult};
use crate::vim::insert::{position_for_insert, recoil_after_exit};
use crate::vim::mode::Mode;
use crate::vim::motions;
use crate::vim::operator;
use crate::pane::{FocusDir, SplitDir};
use crate::vim::parser::{
    parse_cmdline, parse_connection_picker, parse_db_row_detail, parse_insert, parse_normal,
    parse_quickopen, parse_search, parse_tree, parse_tree_prompt, parse_visual, Action,
    InsertPos, Motion, Operator, PastePos, TextObject, WindowCmd,
};
use crate::vim::search;
use crate::tree::{TreePrompt, TreePromptKind};

/// Top-level vim key dispatcher. The app's `handle_key` delegates here.
pub fn dispatch(app: &mut App, key: KeyEvent) {
    // Any keystroke clears the previous transient status message,
    // matching vim's "press a key to dismiss" feel.
    app.clear_status();

    // `Ctrl-C` while a query is running cancels it — runs before
    // mode parsing so it works from anywhere (Normal, Modal, the
    // middle of a chord). Other modes that bind Ctrl-C (modal close
    // etc.) lose to it; the next key after the cancel completes
    // returns control.
    use crossterm::event::{KeyCode, KeyModifiers};
    if app.running_query.is_some()
        && key.modifiers == KeyModifiers::CONTROL
        && key.code == KeyCode::Char('c')
    {
        cancel_running_query(app);
        return;
    }

    let action = match app.vim.mode {
        Mode::Normal => parse_normal(&mut app.vim, key),
        Mode::Insert => parse_insert(key),
        Mode::CommandLine => parse_cmdline(key),
        Mode::Search => parse_search(key),
        Mode::QuickOpen => parse_quickopen(key),
        Mode::Tree => parse_tree(key),
        Mode::TreePrompt => parse_tree_prompt(key),
        Mode::Visual | Mode::VisualLine => parse_visual(&mut app.vim, key),
        Mode::DbRowDetail => parse_db_row_detail(&mut app.vim, key),
        Mode::ConnectionPicker => parse_connection_picker(key),
    };

    // When the cursor is parked inside a block's editable body, swap
    // the block segment for a synthetic prose segment so the entire
    // motion/operator engine — built around `Cursor::InProse` — can
    // run unchanged. The reverse swap happens after the action so the
    // file on disk still serializes back to a fence.
    let swap = if action_needs_block_swap(&action) {
        InBlockSwap::maybe_enter(app)
    } else {
        None
    };
    apply_action(app, action, /* recording = */ true);
    if let Some(s) = swap {
        s.exit(app);
    }
}

/// Decide whether an action should run with the block-as-prose swap
/// active. Buffer-touching actions (motions, operators, edits, paste,
/// undo) need the swap so they see the SQL as a normal rope; mode
/// transitions and tab/window plumbing don't care.
///
/// Vertical motions (`j`/`k`) are deliberately excluded: they need to
/// see `Cursor::InBlock` so they can hop into the result table at the
/// SQL boundary. Inside the SQL, the same branches in `motions::apply_*`
/// already handle line-by-line navigation — no swap required.
fn action_needs_block_swap(action: &Action) -> bool {
    if let Action::Motion(motion, _) = action {
        if matches!(motion, Motion::Down | Motion::Up) {
            return false;
        }
    }
    matches!(
        action,
        Action::Motion(..)
            | Action::OperatorMotion(..)
            | Action::OperatorLinewise(..)
            | Action::OperatorTextObject(..)
            | Action::VisualOperator(_)
            | Action::VisualSwap
            | Action::Paste(..)
            | Action::Undo
            | Action::Redo
            | Action::RepeatChange(_)
            | Action::InsertChar(_)
            | Action::InsertNewline
            | Action::DeleteBackward
            | Action::DeleteForward
            | Action::EnterInsert(_)
            | Action::ExitInsert
            | Action::EnterVisual
            | Action::EnterVisualLine
            | Action::SearchExecute
            | Action::SearchRepeat { .. }
    )
}

/// While alive, the active document's `segment_idx`-th block is
/// pretending to be a prose run with the SQL as its content.
/// `exit` puts the block back together with whatever the action ended
/// up writing into the prose, and converts the cursor back to
/// `InBlock` if it's still pointing into the swapped slot.
struct InBlockSwap {
    segment_idx: usize,
    original_block: BlockNode,
    original_query: String,
}

impl InBlockSwap {
    fn maybe_enter(app: &mut App) -> Option<Self> {
        let cursor = app.document()?.cursor();
        let Cursor::InBlock {
            segment_idx,
            line,
            offset,
        } = cursor
        else {
            return None;
        };
        let doc = app.tabs.active_document_mut()?;
        let block = match doc.segments().get(segment_idx)? {
            Segment::Block(b) => b.clone(),
            _ => return None,
        };
        let query = block
            .params
            .get("query")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let chars: Vec<char> = query.chars().collect();
        let abs = chars_index_for_line_col(&chars, line, offset);
        doc.replace_segment(segment_idx, Segment::Prose(Rope::from_str(&query)));
        doc.set_cursor(Cursor::InProse {
            segment_idx,
            offset: abs,
        });
        Some(Self {
            segment_idx,
            original_block: block,
            original_query: query,
        })
    }

    fn exit(self, app: &mut App) {
        let Some(doc) = app.tabs.active_document_mut() else {
            return;
        };
        let new_query = match doc.segments().get(self.segment_idx) {
            Some(Segment::Prose(rope)) => rope.to_string(),
            _ => self.original_query.clone(),
        };
        let cursor_after = doc.cursor();
        let mut new_block = self.original_block.clone();
        if let Some(obj) = new_block.params.as_object_mut() {
            obj.insert(
                "query".into(),
                serde_json::Value::String(new_query.clone()),
            );
        }
        doc.replace_segment(self.segment_idx, Segment::Block(new_block));
        // If the cursor still points at the swapped segment, convert
        // back to InBlock at the equivalent (line, offset). If the
        // action moved the cursor out (j/k crossed the boundary, etc.)
        // leave it where it landed.
        if let Cursor::InProse {
            segment_idx,
            offset: abs,
        } = cursor_after
        {
            if segment_idx == self.segment_idx {
                let chars: Vec<char> = new_query.chars().collect();
                let (line, col) = line_col_from_abs(&chars, abs);
                doc.set_cursor(Cursor::InBlock {
                    segment_idx,
                    line,
                    offset: col,
                });
            }
        }
    }
}

fn chars_index_for_line_col(chars: &[char], line: usize, offset: usize) -> usize {
    let mut current_line = 0usize;
    let mut col = 0usize;
    for (idx, c) in chars.iter().enumerate() {
        if current_line == line {
            if col == offset {
                return idx;
            }
            if *c == '\n' {
                return idx;
            }
            col += 1;
        }
        if *c == '\n' {
            if current_line == line {
                return idx;
            }
            current_line += 1;
            col = 0;
        }
    }
    chars.len()
}

fn line_col_from_abs(chars: &[char], abs: usize) -> (usize, usize) {
    let mut line = 0usize;
    let mut col = 0usize;
    for (i, c) in chars.iter().enumerate() {
        if i == abs {
            return (line, col);
        }
        if *c == '\n' {
            line += 1;
            col = 0;
        } else {
            col += 1;
        }
    }
    (line, col)
}

/// Run an action against the app. `recording` toggles whether the
/// resulting change updates `last_change` — `.` replay sets it to
/// `false` so a `.` after a `.` doesn't trample its own record.
fn apply_action(app: &mut App, action: Action, recording: bool) {
    match action {
        Action::Noop => {}
        Action::Quit => {
            app.should_quit = true;
        }
        Action::Motion(m, count) => {
            // When the row-detail modal is open `app.document_mut()`
            // redirects to its body doc, so the motion engine drives
            // the modal's cursor automatically. Skip the editor-only
            // book-keeping (paginated-result prefetch, viewport
            // refresh) when the modal owns the focus.
            let in_modal = app.vim.mode == Mode::DbRowDetail;
            if !in_modal && matches!(m, Motion::Down) {
                maybe_prefetch_db_more_rows(app);
            }
            let viewport = app.viewport_height();
            if let Some(doc) = app.document_mut() {
                motions::apply(m, doc, count, viewport);
            }
            if m.is_find() {
                app.vim.last_find = Some(m);
            }
            if !in_modal {
                app.refresh_viewport_for_cursor();
            }
        }
        Action::EnterInsert(pos) => {
            if let Some(doc) = app.document_mut() {
                doc.snapshot();
                position_for_insert(doc, pos);
            }
            app.vim.enter_insert();
            app.vim.insert_session.start_plain(pos);
            app.refresh_viewport_for_cursor();
        }
        Action::EnterVisual => {
            if let Some(doc) = app.document() {
                let cur = doc.cursor();
                app.vim.enter_visual(cur);
            }
        }
        Action::EnterVisualLine => {
            if let Some(doc) = app.document() {
                let cur = doc.cursor();
                app.vim.enter_visual_line(cur);
            }
        }
        Action::ExitVisual => {
            return_from_visual(app);
        }
        Action::VisualSwap => {
            if let (Some(anchor), Some(doc)) =
                (app.vim.visual_anchor, app.document_mut())
            {
                let cur = doc.cursor();
                doc.set_cursor(anchor);
                app.vim.visual_anchor = Some(cur);
                app.refresh_viewport_for_cursor();
            }
        }
        Action::VisualOperator(op) => apply_visual_operator(app, op, recording),
        Action::VisualSelectTextObject(textobj) => {
            apply_visual_select_textobject(app, textobj);
        }
        Action::RunBlock => apply_run_block(app),
        Action::OpenDbRowDetail => apply_open_db_row_detail(app),
        Action::CloseDbRowDetail => apply_close_db_row_detail(app),
        Action::CopyDbRowDetailJson => apply_copy_db_row_detail_json(app),
        Action::OpenConnectionPicker => {
            if let Err(msg) = open_connection_picker(app) {
                app.set_status(StatusKind::Error, msg);
            }
        }
        Action::CloseConnectionPicker => apply_close_connection_picker(app),
        Action::MoveConnectionPickerCursor(delta) => {
            apply_move_connection_picker_cursor(app, delta)
        }
        Action::ConfirmConnectionPicker => apply_confirm_connection_picker(app),
        Action::ExitInsert => {
            if let Some(doc) = app.document_mut() {
                recoil_after_exit(doc);
            }
            app.vim.enter_normal();
            if recording {
                if let Some(record) = app.vim.insert_session.finish() {
                    app.vim.last_change = Some(record);
                }
            } else {
                // Discard the in-flight session without overwriting the
                // existing `last_change` — replay path.
                let _ = app.vim.insert_session.finish();
            }
        }
        Action::InsertChar(c) => {
            if let Some(doc) = app.document_mut() {
                doc.insert_char_at_cursor(c);
            }
            app.vim.insert_session.push_char(c);
        }
        Action::InsertNewline => {
            if let Some(doc) = app.document_mut() {
                doc.insert_newline_at_cursor();
            }
            app.vim.insert_session.push_newline();
            app.refresh_viewport_for_cursor();
        }
        Action::DeleteBackward => {
            if let Some(doc) = app.document_mut() {
                doc.delete_char_before_cursor();
            }
            app.vim.insert_session.pop_char();
        }
        Action::DeleteForward => {
            if let Some(doc) = app.document_mut() {
                doc.delete_char_at_cursor();
            }
        }
        Action::EnterCmdline => {
            app.vim.enter_cmdline();
        }
        Action::CmdlineChar(c) => {
            app.vim.cmdline_push(c);
        }
        Action::CmdlineBackspace => {
            // Empty buffer + backspace exits the prompt — same as `<Esc>`.
            if !app.vim.cmdline_pop() {
                app.vim.enter_normal();
            }
        }
        Action::CmdlineDelete => {
            app.vim.cmdline.delete_after();
        }
        Action::CmdlineCursorLeft => app.vim.cmdline.move_left(),
        Action::CmdlineCursorRight => app.vim.cmdline.move_right(),
        Action::CmdlineCursorHome => app.vim.cmdline.move_home(),
        Action::CmdlineCursorEnd => app.vim.cmdline.move_end(),
        Action::CmdlineCancel => {
            app.vim.enter_normal();
        }
        Action::CmdlineExecute => {
            let buf = app.vim.cmdline.take();
            app.vim.enter_normal();
            match ex::run(app, &buf) {
                ExResult::Ok(msg) => app.set_status(StatusKind::Info, msg),
                ExResult::Err(msg) => app.set_status(StatusKind::Error, msg),
                ExResult::Unknown(s) => {
                    app.set_status(StatusKind::Error, format!("E492: not an editor command: {s}"))
                }
                ExResult::Empty | ExResult::Quit => {}
            }
        }
        Action::OperatorMotion(op, motion, count) => {
            apply_op_motion(app, op, motion, count, recording);
        }
        Action::OperatorLinewise(op, count) => {
            apply_op_linewise(app, op, count, recording);
        }
        Action::OperatorTextObject(op, textobj, count) => {
            apply_op_textobject(app, op, textobj, count, recording);
        }
        Action::Paste(pos, count) => {
            apply_paste(app, pos, count, recording);
        }
        Action::Undo => {
            if let Some(doc) = app.document_mut() {
                if !doc.undo() {
                    app.set_status(StatusKind::Info, "already at oldest change");
                }
            }
            app.refresh_viewport_for_cursor();
        }
        Action::Redo => {
            if let Some(doc) = app.document_mut() {
                if !doc.redo() {
                    app.set_status(StatusKind::Info, "already at newest change");
                }
            }
            app.refresh_viewport_for_cursor();
        }
        Action::RepeatChange(count) => {
            replay_last_change(app, count.max(1));
        }
        Action::EnterSearch(forward) => {
            app.vim.enter_search(forward);
        }
        Action::SearchChar(c) => {
            app.vim.search_push(c);
        }
        Action::SearchBackspace => {
            if !app.vim.search_pop() {
                app.vim.enter_normal();
            }
        }
        Action::SearchDelete => {
            app.vim.search_buf.delete_after();
        }
        Action::SearchCursorLeft => app.vim.search_buf.move_left(),
        Action::SearchCursorRight => app.vim.search_buf.move_right(),
        Action::SearchCursorHome => app.vim.search_buf.move_home(),
        Action::SearchCursorEnd => app.vim.search_buf.move_end(),
        Action::SearchCancel => {
            app.vim.enter_normal();
        }
        Action::SearchExecute => {
            let pattern = app.vim.search_buf.take();
            let forward = app.vim.search_forward;
            app.vim.enter_normal();
            execute_search(app, &pattern, forward, /* save = */ true);
        }
        Action::SearchRepeat { reverse } => {
            let Some(pattern) = app.vim.last_search.clone() else {
                app.set_status(StatusKind::Error, "no previous search");
                return;
            };
            let forward = if reverse {
                !app.vim.last_search_forward
            } else {
                app.vim.last_search_forward
            };
            execute_search(app, &pattern, forward, /* save = */ false);
        }
        Action::EnterQuickOpen => {
            let files = list_vault_md_files(&app.vault_path.to_string_lossy());
            app.vim.enter_quickopen(files);
        }
        Action::QuickOpenChar(c) => {
            app.vim.quickopen.push_char(c);
        }
        Action::QuickOpenBackspace => {
            // Empty buffer + backspace closes the modal — same as `<Esc>`.
            if app.vim.quickopen.query.is_empty() {
                app.vim.enter_normal();
            } else {
                app.vim.quickopen.pop_char();
            }
        }
        Action::QuickOpenDelete => app.vim.quickopen.delete_after(),
        Action::QuickOpenCursorLeft => app.vim.quickopen.move_left(),
        Action::QuickOpenCursorRight => app.vim.quickopen.move_right(),
        Action::QuickOpenCursorHome => app.vim.quickopen.move_home(),
        Action::QuickOpenCursorEnd => app.vim.quickopen.move_end(),
        Action::QuickOpenSelectNext => {
            app.vim.quickopen.select_next();
        }
        Action::QuickOpenSelectPrev => {
            app.vim.quickopen.select_prev();
        }
        Action::QuickOpenCancel => {
            app.vim.enter_normal();
        }
        Action::QuickOpenExecute => {
            // Quick Open is the picker — always opens in a new tab (or
            // switches to the existing tab if already open). The vim
            // ex command `:e <path>` is the explicit "replace current"
            // path for users who want that.
            let chosen = app.vim.quickopen.chosen_path();
            app.vim.enter_normal();
            if let Some(path) = chosen {
                match app.open_in_new_tab(path) {
                    Ok(msg) => app.set_status(StatusKind::Info, msg),
                    Err(msg) => app.set_status(StatusKind::Error, msg),
                }
            }
        }
        Action::Window(cmd) => apply_window_cmd(app, cmd),
        Action::TreeToggle => {
            if app.tree.visible {
                app.tree.visible = false;
                if app.vim.mode == Mode::Tree {
                    app.vim.enter_normal();
                }
            } else {
                app.tree.visible = true;
                app.tree.refresh(&app.vault_path);
                app.vim.mode = Mode::Tree;
            }
        }
        Action::FocusSwap => {
            if !app.tree.visible {
                return;
            }
            if app.vim.mode == Mode::Tree {
                app.vim.enter_normal();
            } else if app.vim.mode == Mode::Normal {
                app.vim.mode = Mode::Tree;
            }
        }
        Action::TreeSelectNext => app.tree.select_next(),
        Action::TreeSelectPrev => app.tree.select_prev(),
        Action::TreeSelectFirst => app.tree.select_first(),
        Action::TreeSelectLast => app.tree.select_last(),
        Action::TreeRefresh => {
            let vault = app.vault_path.clone();
            app.tree.refresh(&vault);
        }
        Action::TreeCollapse => {
            if app.tree.collapse_parent() {
                let vault = app.vault_path.clone();
                app.tree.refresh(&vault);
            }
        }
        Action::TreeActivate => {
            let Some(node) = app.tree.current().cloned() else {
                return;
            };
            if node.is_dir {
                if app.tree.toggle_expand() {
                    let vault = app.vault_path.clone();
                    app.tree.refresh(&vault);
                }
            } else {
                // Tree-driven open mirrors the modal: every Enter opens
                // a new tab (or switches to an existing one). Use `:e
                // <path>` if you want the vim-style replace behavior.
                let path = std::path::PathBuf::from(&node.path);
                match app.open_in_new_tab(path) {
                    Ok(msg) => {
                        app.set_status(StatusKind::Info, msg);
                        // Hand focus back to the editor on successful open —
                        // matches how netrw exits the tree after Enter.
                        app.vim.enter_normal();
                    }
                    Err(msg) => app.set_status(StatusKind::Error, msg),
                }
            }
        }
        Action::TabNext => {
            app.next_tab();
            app.refresh_viewport_for_cursor();
        }
        Action::TabPrev => {
            app.prev_tab();
            app.refresh_viewport_for_cursor();
        }
        Action::TabGoto(n) => {
            app.goto_tab(n);
            app.refresh_viewport_for_cursor();
        }
        Action::TreeCreate => {
            // Open the in-tree prompt anchored to the selected folder
            // (or the parent of the selected file). The user types
            // either a filename (e.g. `notes.md`) or a name with
            // trailing `/` (e.g. `subdir/`) to make a folder.
            let dir = match app.tree.current() {
                Some(node) if node.is_dir => node.path.clone(),
                Some(node) => match std::path::Path::new(&node.path).parent() {
                    Some(p) if !p.as_os_str().is_empty() => p.display().to_string(),
                    _ => String::new(),
                },
                None => String::new(),
            };
            app.tree.prompt = Some(TreePrompt::new(
                TreePromptKind::Create { dir },
                String::new(),
            ));
            app.vim.mode = Mode::TreePrompt;
        }
        Action::TreeRename => {
            let Some(node) = app.tree.current() else {
                return;
            };
            // Pre-fill the buffer with the source path so the user
            // edits the destination in place. Allowed for files and
            // folders alike — `rename_path` handles both.
            let path = node.path.clone();
            app.tree.prompt = Some(TreePrompt::new(
                TreePromptKind::Rename { from: path.clone() },
                path,
            ));
            app.vim.mode = Mode::TreePrompt;
        }
        Action::TreeDelete => {
            let Some(node) = app.tree.current() else {
                return;
            };
            app.tree.prompt = Some(TreePrompt::new(
                TreePromptKind::Delete {
                    target: node.path.clone(),
                },
                String::new(),
            ));
            app.vim.mode = Mode::TreePrompt;
        }
        Action::TreePromptChar(c) => {
            if let Some(prompt) = app.tree.prompt.as_mut() {
                prompt.input.insert_char(c);
            }
        }
        Action::TreePromptBackspace => {
            if let Some(prompt) = app.tree.prompt.as_mut() {
                if !prompt.input.delete_before() {
                    // Empty buffer + backspace acts like cancel.
                    app.tree.prompt = None;
                    app.vim.mode = Mode::Tree;
                }
            } else {
                app.vim.mode = Mode::Tree;
            }
        }
        Action::TreePromptDelete => {
            if let Some(prompt) = app.tree.prompt.as_mut() {
                prompt.input.delete_after();
            }
        }
        Action::TreePromptCursorLeft => {
            if let Some(prompt) = app.tree.prompt.as_mut() {
                prompt.input.move_left();
            }
        }
        Action::TreePromptCursorRight => {
            if let Some(prompt) = app.tree.prompt.as_mut() {
                prompt.input.move_right();
            }
        }
        Action::TreePromptCursorHome => {
            if let Some(prompt) = app.tree.prompt.as_mut() {
                prompt.input.move_home();
            }
        }
        Action::TreePromptCursorEnd => {
            if let Some(prompt) = app.tree.prompt.as_mut() {
                prompt.input.move_end();
            }
        }
        Action::TreePromptCancel => {
            app.tree.prompt = None;
            app.vim.mode = Mode::Tree;
        }
        Action::TreePromptExecute => {
            let Some(prompt) = app.tree.prompt.take() else {
                app.vim.mode = Mode::Tree;
                return;
            };
            app.vim.mode = Mode::Tree;
            run_tree_prompt(app, prompt);
        }
    }
}

/// Execute the pending tree prompt against `app`. Refreshes the tree on
/// success so the sidebar shows the new state without a manual `R`.
fn run_tree_prompt(app: &mut App, prompt: TreePrompt) {
    let buffer = prompt.input.buffer;
    let outcome = match prompt.kind {
        TreePromptKind::Create { dir } => {
            let raw = buffer.trim();
            if raw.is_empty() {
                Err("create: name required".to_string())
            } else {
                // Trailing slash → folder; otherwise file.
                let is_folder = raw.ends_with('/') || raw.ends_with(std::path::MAIN_SEPARATOR);
                let name = raw.trim_end_matches(['/', std::path::MAIN_SEPARATOR]);
                if name.is_empty() {
                    Err("create: name required".into())
                } else {
                    let path = if dir.is_empty() {
                        std::path::PathBuf::from(name)
                    } else {
                        std::path::Path::new(&dir).join(name)
                    };
                    if is_folder {
                        app.create_folder(path)
                    } else {
                        app.create_document(path, false)
                    }
                }
            }
        }
        TreePromptKind::Rename { from } => {
            let dst = buffer.trim();
            if dst.is_empty() || dst == from {
                Err("rename: destination unchanged".to_string())
            } else {
                app.rename_path(
                    Some(std::path::PathBuf::from(&from)),
                    std::path::PathBuf::from(dst),
                )
            }
        }
        TreePromptKind::Delete { target } => {
            let answer = buffer.trim().to_lowercase();
            if answer == "y" || answer == "yes" {
                app.delete_path(Some(std::path::PathBuf::from(&target)), true)
            } else {
                Err("delete: cancelled".to_string())
            }
        }
    };
    match outcome {
        Ok(msg) => {
            let vault = app.vault_path.clone();
            app.tree.refresh(&vault);
            app.set_status(StatusKind::Info, msg);
        }
        Err(msg) => app.set_status(StatusKind::Error, msg),
    }
}

/// Recursively list every `.md` file in the vault, returning paths
/// relative to the vault root. Hidden directories and the usual
/// build-artifact dirs are filtered by `httui_core::fs::list_workspace`,
/// so we just walk what it gives us.
fn list_vault_md_files(vault: &str) -> Vec<String> {
    let Ok(entries) = httui_core::fs::list_workspace(vault) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    collect_md(&entries, &mut out);
    // Stable order: alphabetic by full path. The fuzzy filter sort takes
    // over once the user types something.
    out.sort();
    out
}

fn collect_md(entries: &[httui_core::fs::FileEntry], out: &mut Vec<String>) {
    for e in entries {
        if e.is_dir {
            if let Some(children) = e.children.as_deref() {
                collect_md(children, out);
            }
        } else if e.name.ends_with(".md") {
            out.push(e.path.clone());
        }
    }
}

fn execute_search(app: &mut App, pattern: &str, forward: bool, save: bool) {
    if pattern.is_empty() {
        return;
    }
    // Any new search re-arms the highlight that `:noh` may have hidden.
    app.vim.search_highlight = true;
    let result = app
        .document()
        .and_then(|doc| search::search(doc, pattern, forward));
    match result {
        Some(cursor) => {
            if let Some(doc) = app.document_mut() {
                doc.set_cursor(cursor);
            }
            if save {
                app.vim.last_search = Some(pattern.to_string());
                app.vim.last_search_forward = forward;
            }
            app.refresh_viewport_for_cursor();
        }
        None => {
            // Still save the pattern — `n` after a missed search should
            // try the same query again rather than re-prompting.
            if save {
                app.vim.last_search = Some(pattern.to_string());
                app.vim.last_search_forward = forward;
            }
            app.set_status(
                StatusKind::Error,
                format!("E486: Pattern not found: {pattern}"),
            );
        }
    }
}

// ───────────── operator wrappers (snapshot + record) ─────────────

fn apply_op_motion(
    app: &mut App,
    op: Operator,
    motion: Motion,
    count: usize,
    recording: bool,
) {
    let viewport = app.viewport_height();
    let mut outcome = operator::OpOutcome::default();
    // Borrow the unnamed register out so we can use `app.document_mut()`
    // (which holds a mut borrow on the whole app) at the same time.
    // Restore at the end so yanks that landed in this call survive.
    let mut unnamed = std::mem::take(&mut app.vim.unnamed);
    if let Some(doc) = app.document_mut() {
        if op_mutates(op) {
            doc.snapshot();
        }
        outcome = operator::apply_motion(op, motion, count, doc, &mut unnamed, viewport);
    }
    app.vim.unnamed = unnamed;
    sync_yank_to_clipboard(app, op);
    if motion.is_find() {
        app.vim.last_find = Some(motion);
    }
    if outcome.enter_insert {
        app.vim.enter_insert();
        app.vim
            .insert_session
            .start_change(ChangeOrigin::Motion {
                motion,
                op_count: count,
            });
    } else if recording && op_mutates(op) {
        app.vim.last_change = Some(ChangeRecord::OperatorMotion(op, motion, count));
    }
    app.refresh_viewport_for_cursor();
}

fn apply_op_linewise(app: &mut App, op: Operator, count: usize, recording: bool) {
    let mut outcome = operator::OpOutcome::default();
    let mut unnamed = std::mem::take(&mut app.vim.unnamed);
    if let Some(doc) = app.document_mut() {
        if op_mutates(op) {
            doc.snapshot();
        }
        outcome = operator::apply_linewise(op, count, doc, &mut unnamed);
    }
    app.vim.unnamed = unnamed;
    sync_yank_to_clipboard(app, op);
    if outcome.enter_insert {
        app.vim.enter_insert();
        app.vim
            .insert_session
            .start_change(ChangeOrigin::Linewise { op_count: count });
    } else if recording && op_mutates(op) {
        app.vim.last_change = Some(ChangeRecord::OperatorLinewise(op, count));
    }
    app.refresh_viewport_for_cursor();
}

fn apply_op_textobject(
    app: &mut App,
    op: Operator,
    textobj: TextObject,
    count: usize,
    recording: bool,
) {
    let mut outcome = operator::OpOutcome::default();
    let mut unnamed = std::mem::take(&mut app.vim.unnamed);
    if let Some(doc) = app.document_mut() {
        if op_mutates(op) {
            doc.snapshot();
        }
        outcome = operator::apply_text_object(op, textobj, count, doc, &mut unnamed);
    }
    app.vim.unnamed = unnamed;
    sync_yank_to_clipboard(app, op);
    if outcome.enter_insert {
        app.vim.enter_insert();
        app.vim
            .insert_session
            .start_change(ChangeOrigin::TextObject {
                textobj,
                op_count: count,
            });
    } else if recording && op_mutates(op) {
        app.vim.last_change = Some(ChangeRecord::OperatorTextObject(op, textobj, count));
    }
    app.refresh_viewport_for_cursor();
}

fn apply_paste(app: &mut App, pos: PastePos, count: usize, recording: bool) {
    if let Some(doc) = app.document_mut() {
        doc.snapshot();
    }
    let reg = app.vim.unnamed.clone();
    if let Some(doc) = app.document_mut() {
        operator::paste(pos, count, doc, &reg);
    }
    if recording {
        app.vim.last_change = Some(ChangeRecord::Paste(pos, count));
    }
    app.refresh_viewport_for_cursor();
}

fn op_mutates(op: Operator) -> bool {
    !matches!(op, Operator::Yank)
}

/// After a yank lands in `app.vim.unnamed`, push its text to the
/// system clipboard so paste outside the TUI works. Failures (no X
/// forwarder, sandbox, etc.) bubble up to a non-fatal status hint —
/// the unnamed register still holds the text for in-TUI paste.
fn sync_yank_to_clipboard(app: &mut App, op: Operator) {
    if !matches!(op, Operator::Yank) {
        return;
    }
    if app.vim.unnamed.text.is_empty() {
        return;
    }
    if let Err(msg) = crate::clipboard::set_text(&app.vim.unnamed.text) {
        app.set_status(StatusKind::Error, msg);
    }
}

// ───────────── visual mode operators ─────────────

fn apply_visual_operator(app: &mut App, op: Operator, _recording: bool) {
    let Some(anchor) = app.vim.visual_anchor else {
        return;
    };
    let linewise = matches!(app.vim.mode, Mode::VisualLine);
    let mut outcome = operator::OpOutcome::default();
    let mut unnamed = std::mem::take(&mut app.vim.unnamed);
    if let Some(doc) = app.document_mut() {
        if !matches!(op, Operator::Yank) {
            doc.snapshot();
        }
        let cursor = doc.cursor();
        outcome = operator::apply_visual(op, anchor, cursor, linewise, doc, &mut unnamed);
    }
    app.vim.unnamed = unnamed;
    sync_yank_to_clipboard(app, op);
    if outcome.enter_insert {
        // `c` from visual: drop anchor, enter insert, capture session
        // so `.` can replay (treated as a plain insert for now — visual
        // re-entry on dot-repeat lands later).
        app.vim.enter_insert();
        app.vim.insert_session.start_plain(InsertPos::Current);
    } else {
        return_from_visual(app);
    }
    app.refresh_viewport_for_cursor();
}

/// `va{` / `vi{` / `vaw` / `vi"` etc. — extend the current visual
/// selection to cover the resolved text object. Reuses the same
/// `textobject::compute_range` the operator engine uses, so the
/// notion of what's "inside" / "around" stays consistent. The
/// returned range is `[start, end)` (end exclusive); we snap the
/// anchor to `start` and the moving cursor to `end - 1` so the
/// selection paints inclusively at both ends. Mode stays Visual /
/// VisualLine — user can layer more motions on top.
fn apply_visual_select_textobject(app: &mut App, textobj: TextObject) {
    let Some(doc) = app.document_mut() else { return };
    let Some((segment_idx, start, end)) =
        crate::vim::textobject::compute_range(textobj, doc)
    else {
        return;
    };
    if end == 0 || end <= start {
        return;
    }
    app.vim.visual_anchor = Some(Cursor::InProse {
        segment_idx,
        offset: start,
    });
    if let Some(doc) = app.document_mut() {
        doc.set_cursor(Cursor::InProse {
            segment_idx,
            offset: end - 1,
        });
    }
    app.refresh_viewport_for_cursor();
}

/// Leave Visual / VisualLine and pick the right "back" mode. When
/// the row-detail modal is the active surface (it owns its own
/// `Document` via `App::document_mut`'s redirect), we restore
/// `Mode::DbRowDetail` so the modal keeps rendering and key input
/// keeps flowing through `parse_db_row_detail`. Otherwise the
/// editor's normal mode is the natural exit.
fn return_from_visual(app: &mut App) {
    if app.db_row_detail.is_some() {
        app.vim.mode = Mode::DbRowDetail;
        app.vim.visual_anchor = None;
        app.vim.reset_pending();
    } else {
        app.vim.enter_normal();
    }
}

// ───────────── block execution (`r` in normal) ─────────────

/// Run the block at the cursor. Phase 1 only handles `db` / `db-*`
/// blocks — everything else surfaces a status hint and bails. The
/// query runs in a `tokio::spawn` task so the UI stays responsive
/// (and `Ctrl-C` can cancel it via the stored `CancellationToken`).
/// When the task finishes it pushes an `AppEvent::DbBlockResult`
/// back to the main loop, which folds the outcome into the block
/// via `handle_db_block_result`.
fn apply_run_block(app: &mut App) {
    if app.running_query.is_some() {
        app.set_status(
            StatusKind::Info,
            "another query is already running — Ctrl-C to cancel",
        );
        return;
    }

    // Resolve the cursor → block.
    let Some(doc) = app.document() else { return; };
    let Cursor::InBlock { segment_idx, .. } = doc.cursor() else {
        app.set_status(StatusKind::Info, "no block at cursor (place cursor on a block first)");
        return;
    };
    // Snapshot the block so we can release the immutable doc borrow
    // before mutating later.
    let block = match doc.segments().get(segment_idx) {
        Some(crate::buffer::Segment::Block(b)) => b.clone(),
        _ => return,
    };

    if !block.is_db() {
        app.set_status(
            StatusKind::Info,
            format!("`{}` blocks aren't runnable yet", block.block_type),
        );
        return;
    }

    // Build DbParams from the block's params blob. The fence parser
    // accepts both `connection` (info-string) and `connection_id`
    // (legacy JSON body); we accept either.
    let connection_id_raw = block
        .params
        .get("connection_id")
        .or_else(|| block.params.get("connection"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if connection_id_raw.is_empty() {
        app.set_status(
            StatusKind::Error,
            "no connection set on this block (add `connection=<id>` to the fence)",
        );
        return;
    }
    let raw_query = block
        .params
        .get("query")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if raw_query.is_empty() {
        app.set_status(StatusKind::Error, "empty SQL");
        return;
    }
    // Pre-flight resolves env vars + block refs + connection name.
    // These are fast (in-memory + a couple of SQLite reads) so we
    // keep them on the dispatch thread; only the actual query goes
    // async. If any pre-flight step fails the run never spawns —
    // surface the error and bail.
    let env_vars: std::collections::HashMap<String, String> =
        tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current()
                .block_on(load_active_env_vars(app.pool_manager.app_pool()))
        })
        .unwrap_or_default();
    let resolved = match app.document() {
        Some(d) => resolve_block_refs(d.segments(), segment_idx, &raw_query, &env_vars),
        None => Ok((raw_query.clone(), Vec::new())),
    };
    let (query, bind_values) = match resolved {
        Ok(qb) => qb,
        Err(msg) => {
            if let Some(doc) = app.tabs.active_document_mut() {
                if let Some(b) = doc.block_at_mut(segment_idx) {
                    b.state = ExecutionState::Error(msg.clone());
                    b.cached_result = None;
                }
            }
            app.set_status(StatusKind::Error, msg);
            return;
        }
    };
    let limit = block
        .params
        .get("limit")
        .and_then(|v| v.as_u64())
        .unwrap_or(100);

    let pool_mgr = app.pool_manager.clone();
    let resolved = tokio::task::block_in_place(|| {
        tokio::runtime::Handle::current()
            .block_on(resolve_connection_id(pool_mgr.app_pool(), &connection_id_raw))
    });
    let connection_id = match resolved {
        Ok(id) => id,
        Err(msg) => {
            if let Some(doc) = app.tabs.active_document_mut() {
                if let Some(b) = doc.block_at_mut(segment_idx) {
                    b.state = ExecutionState::Error(msg.clone());
                    b.cached_result = None;
                }
            }
            app.set_status(StatusKind::Error, msg);
            return;
        }
    };

    // Mark the block Running so the renderer paints the spinner /
    // yellow border on the next frame.
    if let Some(doc) = app.tabs.active_document_mut() {
        if let Some(b) = doc.block_at_mut(segment_idx) {
            b.state = ExecutionState::Running;
        }
    }

    let token = CancellationToken::new();
    spawn_db_query(
        app,
        segment_idx,
        crate::app::RunningKind::Run,
        token,
        connection_id,
        query,
        bind_values,
        limit,
        0,
    );
}

/// Common spawn path for both initial runs and load-more pages.
/// Captures the executor params, fires `tokio::spawn`, stores the
/// cancel handle on `App.running_query`, and arranges for the
/// completion `AppEvent::DbBlockResult` to land back in the main
/// loop. Caller is responsible for setting the block's state to
/// `ExecutionState::Running` before calling — this function only
/// owns the async dispatch.
#[allow(clippy::too_many_arguments)]
fn spawn_db_query(
    app: &mut App,
    segment_idx: usize,
    kind: crate::app::RunningKind,
    token: CancellationToken,
    connection_id: String,
    query: String,
    bind_values: Vec<serde_json::Value>,
    limit: u64,
    offset: u64,
) {
    let Some(sender) = app.event_sender.clone() else {
        app.set_status(
            StatusKind::Error,
            "internal: no event sender wired (spawn aborted)",
        );
        return;
    };
    let executor = httui_core::executor::db::DbExecutor::new(app.pool_manager.clone());
    let params = serde_json::json!({
        "connection_id": connection_id,
        "query": query,
        "bind_values": bind_values,
        "offset": offset,
        "fetch_size": limit,
    });
    let token_for_task = token.clone();
    let kind_for_task = kind;
    tokio::spawn(async move {
        let outcome = executor
            .execute_with_cancel(params, token_for_task)
            .await
            .map_err(|e| format!("{e}"));
        let result_kind = match kind_for_task {
            crate::app::RunningKind::Run => crate::event::DbBlockResultKind::Run,
            crate::app::RunningKind::LoadMore => crate::event::DbBlockResultKind::LoadMore,
        };
        let _ = sender.send(crate::event::AppEvent::DbBlockResult {
            segment_idx,
            kind: result_kind,
            outcome,
        });
    });
    app.running_query = Some(crate::app::RunningQuery {
        segment_idx,
        cancel: token,
        started_at: std::time::Instant::now(),
        kind,
    });
}

/// Fold the outcome of a backgrounded DB query (kicked off by
/// `apply_run_block` or the load-more prefetch) into the matching
/// block. Called by the main loop on `AppEvent::DbBlockResult`.
/// Always clears `app.running_query` so the next run / Ctrl-C
/// behave correctly.
pub fn handle_db_block_result(
    app: &mut App,
    segment_idx: usize,
    kind: crate::event::DbBlockResultKind,
    outcome: Result<httui_core::executor::db::types::DbResponse, String>,
) {
    app.running_query = None;
    use crate::event::DbBlockResultKind;
    use httui_core::executor::db::types::DbResult;
    match kind {
        DbBlockResultKind::Run => match outcome {
            Ok(response) => {
                let first_was_error = matches!(
                    response.results.first(),
                    Some(DbResult::Error { .. })
                );
                let summary = summarize_db_response(&response);
                let value = serde_json::to_value(&response).ok();
                if let Some(doc) = app.tabs.active_document_mut() {
                    if let Some(b) = doc.block_at_mut(segment_idx) {
                        b.state = if first_was_error {
                            ExecutionState::Error(summary.clone())
                        } else {
                            ExecutionState::Success
                        };
                        b.cached_result = value;
                    }
                }
                if first_was_error {
                    app.set_status(StatusKind::Error, summary);
                } else {
                    app.set_status(StatusKind::Info, summary);
                }
            }
            Err(msg) => {
                if let Some(doc) = app.tabs.active_document_mut() {
                    if let Some(b) = doc.block_at_mut(segment_idx) {
                        b.state = ExecutionState::Error(msg.clone());
                        b.cached_result = None;
                    }
                }
                app.set_status(StatusKind::Error, msg);
            }
        },
        DbBlockResultKind::LoadMore => match outcome {
            Ok(response) => {
                let (new_rows, new_has_more) = match response.results.first() {
                    Some(DbResult::Select {
                        rows, has_more, ..
                    }) => (rows.clone(), *has_more),
                    Some(DbResult::Error { message, .. }) => {
                        app.set_status(
                            StatusKind::Error,
                            format!("load more: {message}"),
                        );
                        return;
                    }
                    _ => {
                        app.set_status(
                            StatusKind::Error,
                            "load more: unexpected response shape",
                        );
                        return;
                    }
                };
                let new_total = if let Some(doc) = app.tabs.active_document_mut() {
                    if let Some(b) = doc.block_at_mut(segment_idx) {
                        if let Some(cached) = b.cached_result.as_mut() {
                            if let Some(first) = cached
                                .get_mut("results")
                                .and_then(|v| v.as_array_mut())
                                .and_then(|a| a.first_mut())
                            {
                                if let Some(rows) =
                                    first.get_mut("rows").and_then(|v| v.as_array_mut())
                                {
                                    rows.extend(new_rows);
                                    let total = rows.len();
                                    if let Some(slot) = first.get_mut("has_more") {
                                        *slot = serde_json::Value::Bool(new_has_more);
                                    }
                                    total
                                } else {
                                    0
                                }
                            } else {
                                0
                            }
                        } else {
                            0
                        }
                    } else {
                        0
                    }
                } else {
                    0
                };
                let suffix = if new_has_more { "+" } else { "" };
                app.set_status(
                    StatusKind::Info,
                    format!("loaded {new_total}{suffix} rows"),
                );
            }
            Err(msg) => {
                app.set_status(StatusKind::Error, format!("load more: {msg}"));
            }
        },
    }
}

/// Cancel an in-flight DB query, if any. Called from the
/// dispatcher when `Ctrl-C` arrives while `app.running_query` is
/// `Some`. The actual abort is reported back via the regular
/// `DbBlockResult` path (the executor's cancel-aware future
/// resolves to `Err("Request cancelled")`).
pub fn cancel_running_query(app: &mut App) -> bool {
    let Some(rq) = app.running_query.as_ref() else {
        return false;
    };
    rq.cancel.cancel();
    app.set_status(StatusKind::Info, "cancelling query…");
    true
}

/// Distance from the bottom of the loaded result that triggers an
/// eager fetch of the next page. Half the on-screen viewport feels
/// natural — by the time the user is looking at the last visible
/// row, the next batch is usually already there.
const DB_PREFETCH_THRESHOLD: usize = 5;

/// Pure decision function for the infinite-scroll prefetch. Returns
/// `true` when the cursor is close enough to the bottom of the
/// currently loaded rows that we should fetch the next page.
///
/// `cursor_row` is 0-indexed, `total` is the number of rows currently
/// in the cache, and `has_more` is the backend's signal that more
/// pages are still available.
fn should_prefetch(cursor_row: usize, total: usize, has_more: bool, threshold: usize) -> bool {
    has_more && cursor_row + threshold >= total
}

/// Hook called from the motion dispatcher: when the cursor is parked
/// inside a DB result whose backend reports `has_more`, fetch the
/// next page once we're within `DB_PREFETCH_THRESHOLD` rows of the
/// loaded bottom. Mirrors the desktop's near-bottom load-more pattern
/// (`DbFencedPanel.tsx` → `ResultTable.handleScroll`).
fn maybe_prefetch_db_more_rows(app: &mut App) {
    let Some(doc) = app.document() else { return };
    let Cursor::InBlockResult { segment_idx, row } = doc.cursor() else {
        return;
    };
    let Some(seg) = doc.segments().get(segment_idx) else {
        return;
    };
    let Segment::Block(block) = seg else { return };
    if !block.is_db() {
        return;
    }
    let Some(cached) = block.cached_result.as_ref() else {
        return;
    };
    let Some(first) = cached
        .get("results")
        .and_then(|v| v.as_array())
        .and_then(|a| a.first())
    else {
        return;
    };
    if first.get("kind").and_then(|v| v.as_str()) != Some("select") {
        return;
    }
    let has_more = first
        .get("has_more")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let total = first
        .get("rows")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    if !should_prefetch(row, total, has_more, DB_PREFETCH_THRESHOLD) {
        return;
    }
    // While a query is already in flight, the prefetch silently
    // backs off — the user is moving the cursor around naturally
    // and we don't want to spam the status bar with "another query
    // is already running" on every motion.
    if app.running_query.is_some() {
        return;
    }
    if let Err(msg) = load_more_db_block(app, segment_idx) {
        app.set_status(StatusKind::Error, format!("load more: {msg}"));
    }
}

/// Fire the next page of rows for a paginated DB block. Mirrors
/// `apply_run_block` but with `offset = rows.len()` and merge-on-
/// completion (the result handler appends instead of replacing the
/// `cached_result`). Returns `Ok(())` on dispatch, `Err(msg)` if
/// the pre-flight (no cache, no connection, ref resolution …)
/// failed — the caller surfaces that as a status hint.
fn load_more_db_block(app: &mut App, segment_idx: usize) -> Result<(), String> {
    if app.running_query.is_some() {
        return Err("another query is already running".into());
    }
    // Snapshot the block; release the immutable doc borrow before
    // any later mutation.
    let block = {
        let doc = app.document().ok_or_else(|| "no document".to_string())?;
        match doc.segments().get(segment_idx) {
            Some(Segment::Block(b)) => b.clone(),
            _ => return Err("block missing".into()),
        }
    };
    if !block.is_db() {
        return Err("not a DB block".into());
    }

    let cached = block
        .cached_result
        .as_ref()
        .ok_or_else(|| "no result cached yet".to_string())?;
    let first = cached
        .get("results")
        .and_then(|v| v.as_array())
        .and_then(|a| a.first())
        .ok_or_else(|| "result has no rows".to_string())?;
    if first.get("kind").and_then(|v| v.as_str()) != Some("select") {
        return Err("not a select result".into());
    }
    let has_more = first
        .get("has_more")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !has_more {
        return Err("no more rows".into());
    }
    let current_offset = first
        .get("rows")
        .and_then(|v| v.as_array())
        .map(|a| a.len() as u64)
        .unwrap_or(0);

    let raw_query = block
        .params
        .get("query")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if raw_query.is_empty() {
        return Err("empty SQL".into());
    }
    let connection_id_raw = block
        .params
        .get("connection_id")
        .or_else(|| block.params.get("connection"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if connection_id_raw.is_empty() {
        return Err("no connection on block".into());
    }
    let limit = block
        .params
        .get("limit")
        .and_then(|v| v.as_u64())
        .unwrap_or(100);

    let env_vars: std::collections::HashMap<String, String> =
        tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current()
                .block_on(load_active_env_vars(app.pool_manager.app_pool()))
        })
        .unwrap_or_default();
    let (query, bind_values) = match app.document() {
        Some(d) => resolve_block_refs(d.segments(), segment_idx, &raw_query, &env_vars)?,
        None => (raw_query.clone(), Vec::new()),
    };
    let pool_mgr = app.pool_manager.clone();
    let connection_id = tokio::task::block_in_place(|| {
        tokio::runtime::Handle::current()
            .block_on(resolve_connection_id(pool_mgr.app_pool(), &connection_id_raw))
    })?;

    let token = CancellationToken::new();
    spawn_db_query(
        app,
        segment_idx,
        crate::app::RunningKind::LoadMore,
        token,
        connection_id,
        query,
        bind_values,
        limit,
        current_offset,
    );
    Ok(())
}

// ───────────── connection picker popup ─────────────

/// `gc` — open the connection picker popup anchored to the DB
/// block at the cursor. Loads connections from `httui-core`
/// synchronously (small SQLite read, runs on the dispatch thread)
/// and seeds the picker state. Returns `Err(msg)` on validation
/// failures (no DB block at cursor, no connections registered) so
/// the caller can surface a status.
fn open_connection_picker(app: &mut App) -> Result<(), String> {
    let segment_idx = match app.document().map(|d| d.cursor()) {
        Some(Cursor::InBlock { segment_idx, .. })
        | Some(Cursor::InBlockResult { segment_idx, .. }) => segment_idx,
        _ => return Err("no DB block at cursor".into()),
    };
    let block = match app.document().and_then(|d| d.segments().get(segment_idx).cloned()) {
        Some(Segment::Block(b)) => b,
        _ => return Err("no DB block at cursor".into()),
    };
    if !block.is_db() {
        return Err(format!(
            "`{}` blocks don't have a connection",
            block.block_type
        ));
    }

    let pool_mgr = app.pool_manager.clone();
    let raw = tokio::task::block_in_place(|| {
        tokio::runtime::Handle::current()
            .block_on(httui_core::db::connections::list_connections(pool_mgr.app_pool()))
    });
    let connections: Vec<crate::app::ConnectionEntry> = match raw {
        Ok(list) => list
            .into_iter()
            .map(|c| crate::app::ConnectionEntry {
                id: c.id,
                name: c.name,
                kind: c.driver,
            })
            .collect(),
        Err(e) => return Err(format!("connection list failed: {e}")),
    };
    if connections.is_empty() {
        return Err("no connections registered yet".into());
    }

    // Pre-select the block's current connection so the user can hit
    // Enter to keep it (or arrow to switch). Falls back to the first
    // entry when the current value matches nothing.
    let current = block
        .params
        .get("connection_id")
        .or_else(|| block.params.get("connection"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let selected = connections
        .iter()
        .position(|c| c.id == current || c.name == current)
        .unwrap_or(0);

    app.connection_picker = Some(crate::app::ConnectionPickerState {
        segment_idx,
        connections,
        selected,
    });
    app.vim.mode = Mode::ConnectionPicker;
    app.vim.reset_pending();
    Ok(())
}

fn apply_close_connection_picker(app: &mut App) {
    app.connection_picker = None;
    app.vim.enter_normal();
}

fn apply_move_connection_picker_cursor(app: &mut App, delta: i32) {
    let Some(state) = app.connection_picker.as_mut() else { return };
    if state.connections.is_empty() {
        return;
    }
    let last = state.connections.len() as i64 - 1;
    let next = (state.selected as i64).saturating_add(delta as i64).clamp(0, last);
    state.selected = next as usize;
}

/// `Enter` in the picker — write the selected connection's id to
/// the anchored block's params (`connection` field) and close. The
/// document is marked dirty via `snapshot()` so undo can restore
/// the previous value.
fn apply_confirm_connection_picker(app: &mut App) {
    let Some(state) = app.connection_picker.take() else {
        app.vim.enter_normal();
        return;
    };
    app.vim.enter_normal();
    let Some(picked) = state.connections.get(state.selected).cloned() else {
        return;
    };
    let segment_idx = state.segment_idx;
    let Some(doc) = app.tabs.active_document_mut() else { return };
    doc.snapshot();
    let Some(block) = doc.block_at_mut(segment_idx) else { return };
    let Some(obj) = block.params.as_object_mut() else { return };
    obj.insert(
        "connection".into(),
        serde_json::Value::String(picked.id.clone()),
    );
    // Drop the legacy alias so the next save serializes the
    // canonical `connection=<id>` form only — `connection_id` was
    // a JSON-body field from pre-redesign blocks and gets resolved
    // the same way at run time.
    obj.remove("connection_id");
    app.set_status(
        StatusKind::Info,
        format!("connection set to {}", picked.name),
    );
}

// ───────────── DB row-detail modal ─────────────

/// `<CR>` in normal mode → open the row-detail modal. Validates the
/// cursor is parked on a real result row of a `select`, snapshots
/// the row's columns into a freshly-built `Document` (body text as
/// a single prose run), and flips the mode. The pending vim state
/// is reset so a stale count from the editor doesn't leak into the
/// modal's first keystroke.
fn apply_open_db_row_detail(app: &mut App) {
    let Some(doc) = app.document() else { return };
    let Cursor::InBlockResult { segment_idx, row } = doc.cursor() else {
        return;
    };
    let Some(seg) = doc.segments().get(segment_idx) else {
        return;
    };
    let Segment::Block(block) = seg else { return };
    if !block.is_db() {
        return;
    }
    let title = build_db_row_modal_title(block, row);
    let body_text = match build_db_row_body_text(block, row) {
        Some(t) => t,
        None => return,
    };
    // Build a Document from the body text. `from_markdown` of plain
    // text yields a single Prose segment, which is exactly what we
    // want — the motion engine treats it as one editable run. We
    // sanitize triple-backticks first so a row carrying ``` doesn't
    // accidentally open a fence and split the body in two.
    let safe_body = body_text.replace("```", "ʼʼʼ");
    let modal_doc = match crate::buffer::Document::from_markdown(&safe_body) {
        Ok(d) => d,
        Err(_) => return,
    };
    app.db_row_detail = Some(crate::app::DbRowDetailState {
        segment_idx,
        row,
        title,
        doc: modal_doc,
        // Updated by the renderer on the first paint; 1 is just a
        // safe lower bound so the first half-page motion (rare, but
        // possible if the user types `Ctrl-d` immediately) doesn't
        // divide by zero anywhere.
        viewport_height: 1,
        viewport_top: 0,
    });
    app.vim.mode = Mode::DbRowDetail;
    app.vim.reset_pending();
}

/// `Esc`/`q`/`Ctrl-c` inside the modal → drop the state and return
/// to normal mode. The editor cursor stays on the result row that
/// was being inspected, which feels right when the modal closes.
fn apply_close_db_row_detail(app: &mut App) {
    app.db_row_detail = None;
    app.vim.enter_normal();
}

/// Build the modal's title line. Uses the block's alias when set so
/// `Row 7 · 4 fields · q1` reads naturally; falls back to
/// `Row N · M fields` when no alias is present.
fn build_db_row_modal_title(block: &BlockNode, row: usize) -> String {
    let columns = block
        .cached_result
        .as_ref()
        .and_then(|v| v.get("results"))
        .and_then(|v| v.as_array())
        .and_then(|a| a.first())
        .and_then(|r| r.get("columns"))
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    let suffix = if columns == 1 { "field" } else { "fields" };
    match block.alias.as_deref() {
        Some(alias) => format!(" Row {} · {} {} · {} ", row + 1, columns, suffix, alias),
        None => format!(" Row {} · {} {} ", row + 1, columns, suffix),
    }
}

/// Render one row as the body text the modal will navigate. Mirrors
/// `ui::db_row_detail::build_body_lines` (column header line + 2-
/// space-indented value lines + blank separator) but emits a `String`
/// so it can be parsed into a `Document` for the motion engine.
fn build_db_row_body_text(block: &BlockNode, row: usize) -> Option<String> {
    let cached = block.cached_result.as_ref()?;
    let first = cached
        .get("results")
        .and_then(|v| v.as_array())
        .and_then(|a| a.first())?;
    if first.get("kind").and_then(|v| v.as_str()) != Some("select") {
        return None;
    }
    let columns: Vec<(String, String)> = first
        .get("columns")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .map(|c| {
                    let name = c
                        .get("name")
                        .and_then(|n| n.as_str())
                        .unwrap_or("?")
                        .to_string();
                    let ty = c
                        .get("type")
                        .and_then(|n| n.as_str())
                        .unwrap_or("")
                        .to_string();
                    (name, ty)
                })
                .collect()
        })
        .unwrap_or_default();
    if columns.is_empty() {
        return None;
    }
    let row_obj = first.get("rows").and_then(|v| v.as_array())?.get(row)?;
    let mut out = String::new();
    for (i, (name, ty)) in columns.iter().enumerate() {
        if i > 0 {
            out.push('\n');
        }
        if ty.is_empty() {
            out.push_str(name);
        } else {
            out.push_str(&format!("{name}  ({ty})"));
        }
        out.push('\n');
        let value = row_obj
            .get(name)
            .cloned()
            .unwrap_or(serde_json::Value::Null);
        for line in render_value_text(&value) {
            out.push_str("  ");
            out.push_str(&line);
            out.push('\n');
        }
    }
    Some(out)
}

/// Plain-text rendering of a JSON value for the body. Strings that
/// look like JSON (stringified objects/arrays — common with
/// Postgres `jsonb` over wire) are unwrapped + pretty-printed so
/// `metadata` columns aren't a single illegible blob.
fn render_value_text(v: &serde_json::Value) -> Vec<String> {
    match v {
        serde_json::Value::Null => vec!["NULL".into()],
        serde_json::Value::Bool(_) | serde_json::Value::Number(_) => vec![v.to_string()],
        serde_json::Value::String(s) => {
            let trimmed = s.trim();
            let looks_jsonish = (trimmed.starts_with('{') && trimmed.ends_with('}'))
                || (trimmed.starts_with('[') && trimmed.ends_with(']'));
            if looks_jsonish {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    return serde_json::to_string_pretty(&parsed)
                        .unwrap_or_default()
                        .lines()
                        .map(String::from)
                        .collect();
                }
            }
            if s.is_empty() {
                vec!["(empty)".into()]
            } else {
                s.lines().map(String::from).collect()
            }
        }
        serde_json::Value::Array(_) | serde_json::Value::Object(_) => {
            serde_json::to_string_pretty(v)
                .unwrap_or_default()
                .lines()
                .map(String::from)
                .collect()
        }
    }
}

/// `y` inside the modal → copy the inspected row to the system
/// clipboard as pretty-printed JSON. Status hints differentiate the
/// success path ("row copied as JSON") from environments where no
/// clipboard backend is reachable (SSH without a forwarder, headless
/// container, sandbox).
fn apply_copy_db_row_detail_json(app: &mut App) {
    let Some(state) = app.db_row_detail.as_ref() else { return };
    let Some(payload) = db_row_payload(app, state.segment_idx, state.row) else {
        app.set_status(StatusKind::Error, "row no longer available");
        return;
    };
    let text = serde_json::to_string_pretty(&payload)
        .unwrap_or_else(|_| payload.to_string());
    match crate::clipboard::set_text(&text) {
        Ok(()) => app.set_status(StatusKind::Info, "row copied as JSON"),
        Err(msg) => app.set_status(StatusKind::Error, msg),
    }
}

/// Snapshot of a single result row as a `{column: value}` JSON
/// object. Source for the modal's `y` clipboard copy. Returns
/// `None` if the block / row vanished between the keystroke and
/// the dispatch (e.g. user re-ran the block in another tab).
fn db_row_payload(
    app: &App,
    segment_idx: usize,
    row: usize,
) -> Option<serde_json::Value> {
    let doc = app.document()?;
    let Segment::Block(block) = doc.segments().get(segment_idx)? else {
        return None;
    };
    let cached = block.cached_result.as_ref()?;
    let first = cached
        .get("results")
        .and_then(|v| v.as_array())
        .and_then(|a| a.first())?;
    if first.get("kind").and_then(|v| v.as_str()) != Some("select") {
        return None;
    }
    let columns: Vec<&str> = first
        .get("columns")
        .and_then(|v| v.as_array())?
        .iter()
        .filter_map(|c| c.get("name").and_then(|n| n.as_str()))
        .collect();
    let row_obj = first.get("rows").and_then(|v| v.as_array())?.get(row)?;
    let mut out = serde_json::Map::new();
    for name in columns {
        out.insert(
            name.to_string(),
            row_obj
                .get(name)
                .cloned()
                .unwrap_or(serde_json::Value::Null),
        );
    }
    Some(serde_json::Value::Object(out))
}

/// Replace `{{alias.response.path...}}` placeholders in `query` with
/// SQL bind placeholders (`?`) and collect each resolved value into a
/// parallel array. Mirrors `resolveRefsToBindParams` on the desktop
/// (`src/components/blocks/db/fenced/DbFencedPanel.tsx:340-360`):
/// values **never** become part of the SQL string — sqlx binds them
/// at the driver layer, so a malicious upstream value like
/// `'7; DROP TABLE x'` lands as a single literal string parameter,
/// not as injected SQL.
///
/// The function is pure: callers thread the document's segment slice
/// in. That keeps tests free of `App` plumbing and matches how
/// `apply_run_block` / `load_more_db_block` already split the
/// pre-flight (read-only) phase from the spawn (mutates `app`).
fn resolve_block_refs(
    segments: &[crate::buffer::Segment],
    current_segment: usize,
    query: &str,
    env_vars: &std::collections::HashMap<String, String>,
) -> Result<(String, Vec<serde_json::Value>), String> {
    let mut out = String::with_capacity(query.len());
    let mut binds: Vec<serde_json::Value> = Vec::new();
    let bytes = query.as_bytes();
    let mut i = 0usize;
    while i < bytes.len() {
        // `{{` opens a placeholder. Anything else is copied verbatim.
        if i + 1 < bytes.len() && bytes[i] == b'{' && bytes[i + 1] == b'{' {
            let close = match find_close_marker(&bytes[i + 2..]) {
                Some(rel) => i + 2 + rel,
                None => {
                    out.push('{');
                    i += 1;
                    continue;
                }
            };
            let inner = std::str::from_utf8(&bytes[i + 2..close])
                .map_err(|_| "invalid utf-8 inside reference".to_string())?
                .trim();
            let value = resolve_one_ref(segments, current_segment, inner, env_vars)?;
            out.push('?');
            binds.push(value);
            i = close + 2;
        } else {
            out.push(bytes[i] as char);
            i += 1;
        }
    }
    Ok((out, binds))
}

/// Locate the `}}` closing brace inside a placeholder body. Returns
/// `None` if the placeholder is never closed (the caller falls back
/// to copying the input).
fn find_close_marker(b: &[u8]) -> Option<usize> {
    let mut i = 0usize;
    while i + 1 < b.len() {
        if b[i] == b'}' && b[i + 1] == b'}' {
            return Some(i);
        }
        i += 1;
    }
    None
}

fn resolve_one_ref(
    segments: &[crate::buffer::Segment],
    current_segment: usize,
    inner: &str,
    env_vars: &std::collections::HashMap<String, String>,
) -> Result<serde_json::Value, String> {
    let parts: Vec<&str> = inner.split('.').map(str::trim).collect();
    let head = parts.first().copied().unwrap_or("").trim();
    if head.is_empty() {
        return Err("empty reference".into());
    }
    // Block refs are dotted (`alias.field…`); when missing, fall back
    // to env vars only for single-segment keys (`{{TOKEN}}`). This
    // mirrors the desktop precedence: blocks win over env collisions.
    let block_match = segments
        .iter()
        .take(current_segment)
        .filter_map(|s| match s {
            crate::buffer::Segment::Block(b) => Some(b),
            _ => None,
        })
        .find(|b| b.alias.as_deref() == Some(head));
    if let Some(block) = block_match {
        let cached = block
            .cached_result
            .as_ref()
            .ok_or_else(|| format!("block `{head}` hasn't run yet — execute it first"))?;
        let nav: Vec<&str> = parts[1..].to_vec();

        // DB blocks get the multi-result shim that mirrors desktop's
        // `makeDbResponseView` (`src/lib/blocks/references.ts:174-223`):
        // the `response.*` namespace exposes three access patterns
        // (passthrough / numeric / legacy column). Non-DB blocks keep
        // the simple "strip `response` and dot-navigate" behavior.
        if block.is_db()
            && nav.first().copied() == Some("response")
            && is_db_response_shape(cached)
        {
            return resolve_db_response_path(cached, &nav[1..]);
        }

        // Skip a literal `response` segment for desktop-compat:
        // `{{alias.response.path}}` ≡ `{{alias.path}}`.
        let mut nav = nav;
        if nav.first().copied() == Some("response") {
            nav.remove(0);
        }
        let mut value = cached;
        for part in &nav {
            value = navigate_json(value, part)
                .ok_or_else(|| format!("path `{part}` not found in `{head}`"))?;
        }
        return value_for_bind(value);
    }
    // No matching block. A dotted reference can only be a block, so
    // fail loudly. Single-segment refs try env vars next.
    if parts.len() > 1 {
        return Err(format!("block `{head}` not found above this one"));
    }
    if let Some(v) = env_vars.get(head) {
        // Env values bind as plain strings — same shape every other
        // value gets, so the driver decides numeric coercion.
        return Ok(serde_json::Value::String(v.clone()));
    }
    Err(format!("`{head}` is not a block alias above or an env var"))
}

/// Quick check: does this cached value carry the shape of a serialized
/// `DbResponse` (top-level `results` array)? Used to gate the DB-only
/// ref shim so older / non-DB cached blobs keep navigating raw.
fn is_db_response_shape(v: &serde_json::Value) -> bool {
    v.get("results")
        .map(|r| r.is_array())
        .unwrap_or(false)
}

/// Navigate the part of a `{{alias.response.…}}` ref that comes
/// *after* the literal `response` segment. Three access patterns,
/// dispatched on the first remaining segment:
///
/// - `response.results` / `response.messages` / `response.stats` /
///   `response.plan` — passthrough to the matching `DbResponse` field.
/// - `response.<N>` — numeric shortcut for `results[N]`.
/// - `response.<col>` — legacy shim from before multi-result existed:
///   the column is read from `results[0].rows[0]`.
fn resolve_db_response_path(
    cached: &serde_json::Value,
    nav: &[&str],
) -> Result<serde_json::Value, String> {
    // `{{alias.response}}` alone — there's nothing scalar to bind.
    let Some((first, rest)) = nav.split_first() else {
        return Err(
            "reference points to a non-scalar value".into(),
        );
    };

    // Passthrough fields — `response.results`, `response.stats`, etc.
    // We let the user navigate *through* these the long way: it's the
    // shape `{{` autocomplete will guide users toward.
    if matches!(*first, "results" | "messages" | "stats" | "plan") {
        let mut value = cached
            .get(*first)
            .ok_or_else(|| format!("response has no `{first}`"))?;
        for part in rest {
            value = navigate_json(value, part)
                .ok_or_else(|| format!("path `{part}` not found"))?;
        }
        return value_for_bind(value);
    }

    let results = cached
        .get("results")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "response has no results array".to_string())?;

    // Numeric shortcut: `response.0.rows.0.id` ≡ `response.results.0.rows.0.id`.
    if let Ok(idx) = first.parse::<usize>() {
        let mut value = results.get(idx).ok_or_else(|| {
            format!(
                "result index {idx} out of bounds (have {} result(s))",
                results.len()
            )
        })?;
        for part in rest {
            value = navigate_json(value, part)
                .ok_or_else(|| format!("path `{part}` not found"))?;
        }
        return value_for_bind(value);
    }

    // Legacy column shim: `response.col` → `results[0].rows[0].col`.
    // The pre-redesign refs all looked like this — keep them working
    // so existing notes don't break.
    let first_result = results
        .first()
        .ok_or_else(|| "response has no result sets".to_string())?;
    let rows = first_result
        .get("rows")
        .and_then(|v| v.as_array())
        .ok_or_else(|| {
            "first result has no rows (was it a mutation or error?)".to_string()
        })?;
    let first_row = rows
        .first()
        .ok_or_else(|| "first result has no rows yet".to_string())?;
    let mut value = navigate_json(first_row, first)
        .ok_or_else(|| format!("column `{first}` not found in first row"))?;
    for part in rest {
        value = navigate_json(value, part)
            .ok_or_else(|| format!("path `{part}` not found"))?;
    }
    value_for_bind(value)
}

fn navigate_json<'a>(v: &'a serde_json::Value, key: &str) -> Option<&'a serde_json::Value> {
    if let Ok(idx) = key.parse::<usize>() {
        if let Some(arr) = v.as_array() {
            return arr.get(idx);
        }
    }
    v.as_object()?.get(key)
}

/// Verify a reference's resolved value is bind-safe and clone it for
/// the bind array. Arrays and objects can't go through driver-side
/// parameter binding for the dialects we target, so reject them
/// loudly; the user almost always meant a scalar field anyway and a
/// silent JSON-stringify would mask the typo.
fn value_for_bind(v: &serde_json::Value) -> Result<serde_json::Value, String> {
    match v {
        serde_json::Value::Null
        | serde_json::Value::Bool(_)
        | serde_json::Value::Number(_)
        | serde_json::Value::String(_) => Ok(v.clone()),
        serde_json::Value::Array(_) | serde_json::Value::Object(_) => {
            Err("reference points to a non-scalar value".into())
        }
    }
}

/// Load the active environment's variables into a `key → value` map.
/// Secrets are already keychain-resolved by `list_env_variables`.
/// Returns `None` when there's no active environment, the lookup
/// fails, or the active env has no variables — callers fall back to
/// an empty map and surface a clearer error from the resolver.
async fn load_active_env_vars(
    pool: &sqlx::SqlitePool,
) -> Option<std::collections::HashMap<String, String>> {
    use httui_core::db::environments::{get_active_environment_id, list_env_variables};
    let env_id = get_active_environment_id(pool).await?;
    let vars = list_env_variables(pool, &env_id).await.ok()?;
    Some(vars.into_iter().map(|v| (v.key, v.value)).collect())
}

/// Resolve a fence's `connection=` value to a real connection UUID.
/// First tries it as a UUID (most blocks reference connections by id);
/// falls back to a case-sensitive name lookup so a user can write
/// `connection=Notes` if that's the human label they remember.
async fn resolve_connection_id(
    app_pool: &sqlx::SqlitePool,
    key: &str,
) -> Result<String, String> {
    use httui_core::db::connections::{get_connection, list_connections};
    if let Some(c) = get_connection(app_pool, key)
        .await
        .map_err(|e| format!("connection lookup failed: {e}"))?
    {
        return Ok(c.id);
    }
    let all = list_connections(app_pool)
        .await
        .map_err(|e| format!("connection lookup failed: {e}"))?;
    if let Some(c) = all.iter().find(|c| c.name == key) {
        return Ok(c.id.clone());
    }
    Err(format!("Connection '{key}' not found"))
}

/// Compact one-liner for the status bar: `5 rows · 12ms` /
/// `mutation: 3 affected · 8ms` / `error: …`. Multi-statement
/// queries get a `(+N more)` suffix so users know the renderer is
/// only surfacing `results[0]` for now (Story 05.1 ships tabs).
fn summarize_db_response(resp: &httui_core::executor::db::types::DbResponse) -> String {
    use httui_core::executor::db::types::DbResult;
    let elapsed = resp.stats.elapsed_ms;
    let extras = match resp.results.len() {
        0 | 1 => String::new(),
        n => format!(" (+{} more)", n - 1),
    };
    if let Some(first) = resp.results.first() {
        match first {
            DbResult::Select { rows, has_more, .. } => {
                let suffix = if *has_more { "+" } else { "" };
                format!("{}{} rows · {}ms{}", rows.len(), suffix, elapsed, extras)
            }
            DbResult::Mutation { rows_affected } => {
                format!("{} affected · {}ms{}", rows_affected, elapsed, extras)
            }
            DbResult::Error { message, .. } => format!("error: {message}{extras}"),
        }
    } else {
        format!("ok · {}ms", elapsed)
    }
}

// ───────────── window / split commands ─────────────

fn apply_window_cmd(app: &mut App, cmd: WindowCmd) {
    match cmd {
        WindowCmd::SplitVertical => split_focused(app, SplitDir::Vertical),
        WindowCmd::SplitHorizontal => split_focused(app, SplitDir::Horizontal),
        WindowCmd::FocusLeft => focus_dir(app, FocusDir::Left),
        WindowCmd::FocusRight => focus_dir(app, FocusDir::Right),
        WindowCmd::FocusUp => focus_dir(app, FocusDir::Up),
        WindowCmd::FocusDown => focus_dir(app, FocusDir::Down),
        WindowCmd::Cycle => {
            if let Some(tab) = app.active_tab_mut() {
                tab.cycle_focus();
            }
            app.refresh_viewport_for_cursor();
        }
        WindowCmd::Close => close_focused_pane(app),
        WindowCmd::Equalize => {
            if let Some(tab) = app.active_tab_mut() {
                tab.equalize();
            }
        }
    }
}

fn split_focused(app: &mut App, dir: SplitDir) {
    let Some(tab) = app.active_tab_mut() else {
        return;
    };
    let new_pane = tab.active_leaf().snapshot_clone();
    tab.split(dir, new_pane);
    app.refresh_viewport_for_cursor();
}

fn focus_dir(app: &mut App, dir: FocusDir) {
    if let Some(tab) = app.active_tab_mut() {
        tab.focus_dir(dir);
    }
    app.refresh_viewport_for_cursor();
}

/// Close the focused pane. When it's the only pane in the active tab,
/// closes the tab; when there are no tabs left, quits.
fn close_focused_pane(app: &mut App) {
    let leaf_count = app
        .active_tab()
        .map(|t| t.leaf_count())
        .unwrap_or(0);
    if leaf_count > 1 {
        if app.document().is_some_and(|d| d.is_dirty()) {
            app.set_status(
                StatusKind::Error,
                "no write since last change (add ! to override)",
            );
            return;
        }
        if let Some(tab) = app.active_tab_mut() {
            tab.close_focused();
        }
        app.refresh_viewport_for_cursor();
        return;
    }
    match app.close_tab(false) {
        Ok(msg) => app.set_status(StatusKind::Info, msg),
        Err(msg) => {
            app.set_status(StatusKind::Error, msg);
            return;
        }
    }
    if app.tabs.is_empty() {
        app.should_quit = true;
    }
}

// ───────────── . repeat ─────────────

fn replay_last_change(app: &mut App, count: usize) {
    let Some(record) = app.vim.last_change.clone() else {
        return;
    };
    for _ in 0..count {
        replay_once(app, record.clone());
    }
}

fn replay_once(app: &mut App, record: ChangeRecord) {
    match record {
        ChangeRecord::OperatorMotion(op, motion, c) => {
            apply_op_motion(app, op, motion, c, false);
        }
        ChangeRecord::OperatorLinewise(op, c) => {
            apply_op_linewise(app, op, c, false);
        }
        ChangeRecord::OperatorTextObject(op, t, c) => {
            apply_op_textobject(app, op, t, c, false);
        }
        ChangeRecord::Paste(pos, c) => {
            apply_paste(app, pos, c, false);
        }
        ChangeRecord::Insert { pos, typed } => {
            replay_insert_session(app, Some(pos), None, &typed);
        }
        ChangeRecord::ChangeMotion {
            motion,
            op_count,
            typed,
        } => {
            apply_op_motion(app, Operator::Change, motion, op_count, false);
            replay_typed(app, &typed);
            // Replay's ExitInsert fires through dispatch only via real
            // keystrokes; here we exit synthetically.
            apply_action(app, Action::ExitInsert, false);
        }
        ChangeRecord::ChangeLinewise { op_count, typed } => {
            apply_op_linewise(app, Operator::Change, op_count, false);
            replay_typed(app, &typed);
            apply_action(app, Action::ExitInsert, false);
        }
        ChangeRecord::ChangeTextObject {
            textobj,
            op_count,
            typed,
        } => {
            apply_op_textobject(app, Operator::Change, textobj, op_count, false);
            replay_typed(app, &typed);
            apply_action(app, Action::ExitInsert, false);
        }
    }
}

fn replay_insert_session(
    app: &mut App,
    pos: Option<InsertPos>,
    _origin: Option<()>,
    typed: &str,
) {
    if let Some(p) = pos {
        apply_action(app, Action::EnterInsert(p), false);
    }
    replay_typed(app, typed);
    apply_action(app, Action::ExitInsert, false);
}

fn replay_typed(app: &mut App, typed: &str) {
    for c in typed.chars() {
        if c == '\n' {
            apply_action(app, Action::InsertNewline, false);
        } else {
            apply_action(app, Action::InsertChar(c), false);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_prefetch_skips_when_backend_says_done() {
        // Cursor near the bottom but the server already exhausted
        // pages — no further fetch should fire.
        assert!(!should_prefetch(95, 100, false, 5));
        assert!(!should_prefetch(99, 100, false, 5));
    }

    #[test]
    fn should_prefetch_waits_for_threshold_when_more_pages_exist() {
        // Plenty of headroom: don't trigger.
        assert!(!should_prefetch(0, 100, true, 5));
        assert!(!should_prefetch(94, 100, true, 5));
        // Within the threshold band: trigger.
        assert!(should_prefetch(95, 100, true, 5));
        assert!(should_prefetch(99, 100, true, 5));
        // Past the loaded set (the engine reaches this momentarily
        // when motion overshoots before append finishes).
        assert!(should_prefetch(100, 100, true, 5));
    }

    #[test]
    fn should_prefetch_fires_immediately_for_small_initial_pages() {
        // 3 rows back, threshold 5, has_more true → trigger from
        // row 0 (page is smaller than the prefetch window).
        assert!(should_prefetch(0, 3, true, 5));
        assert!(should_prefetch(2, 3, true, 5));
    }

    #[test]
    fn should_prefetch_handles_empty_set() {
        // Defensive: no rows + has_more shouldn't crash on the
        // arithmetic and shouldn't fire (cursor can't be in an
        // empty result anyway).
        assert!(should_prefetch(0, 0, true, 5));
        assert!(!should_prefetch(0, 0, false, 5));
    }

    // ───────────── resolve_block_refs (bind-params) ─────────────
    //
    // These tests guard the security invariant: every `{{ref}}` value,
    // no matter what the upstream block emits, must leave the function
    // as a *bind value* — never as part of the SQL string. A malicious
    // value like `'; DROP TABLE x;` should land in the bind array
    // intact and reach the driver as a single string parameter.
    //
    // Tests build a `Document` from markdown so we can fill
    // `cached_result` on parsed blocks before resolving — that mirrors
    // how `apply_run_block` sees the world at run time.

    use crate::buffer::{Document, Segment};

    fn make_doc(md: &str) -> Document {
        Document::from_markdown(md).expect("valid markdown")
    }

    fn set_cache(doc: &mut Document, idx: usize, v: serde_json::Value) {
        let block = doc
            .block_at_mut(idx)
            .expect("segment idx should be a block");
        block.cached_result = Some(v);
    }

    fn block_indices(doc: &Document) -> Vec<usize> {
        doc.segments()
            .iter()
            .enumerate()
            .filter_map(|(i, s)| matches!(s, Segment::Block(_)).then_some(i))
            .collect()
    }

    fn empty_env() -> std::collections::HashMap<String, String> {
        std::collections::HashMap::new()
    }

    #[test]
    fn resolve_block_refs_replaces_refs_with_question_marks() {
        // Two-block doc; second block references the first by alias.
        // The output SQL must carry placeholders, never the raw value.
        let md = "```http alias=upstream\nGET /users/7\n```\n\n```db-postgres alias=q\nSELECT 1\n```\n";
        let mut doc = make_doc(md);
        let blocks = block_indices(&doc);
        set_cache(&mut doc, blocks[0], serde_json::json!({ "id": 7 }));
        let (sql, binds) = resolve_block_refs(
            doc.segments(),
            blocks[1],
            "SELECT * FROM users WHERE id = {{upstream.id}}",
            &empty_env(),
        )
        .expect("resolves");
        assert_eq!(sql, "SELECT * FROM users WHERE id = ?");
        assert_eq!(binds, vec![serde_json::json!(7)]);
    }

    #[test]
    fn resolve_block_refs_blocks_sql_injection_via_string_value() {
        // Classic injection payload returned by an upstream block: the
        // single-quote-and-DROP must NOT escape into the SQL string.
        // It belongs in the bind array as a single literal.
        let md = "```http alias=evil\nGET /\n```\n\n```db-postgres alias=q\nSELECT 1\n```\n";
        let mut doc = make_doc(md);
        let blocks = block_indices(&doc);
        let payload = "7'; DROP TABLE users; --";
        set_cache(
            &mut doc,
            blocks[0],
            serde_json::json!({ "id": payload }),
        );
        let (sql, binds) = resolve_block_refs(
            doc.segments(),
            blocks[1],
            "SELECT * FROM users WHERE id = {{evil.id}}",
            &empty_env(),
        )
        .expect("resolves");
        assert_eq!(sql, "SELECT * FROM users WHERE id = ?");
        assert!(
            !sql.contains("DROP"),
            "injection payload leaked into SQL: {sql}"
        );
        assert_eq!(
            binds,
            vec![serde_json::Value::String(payload.to_string())]
        );
    }

    #[test]
    fn resolve_block_refs_emits_one_bind_per_placeholder_in_order() {
        // Multiple placeholders → array order matches placeholder order.
        // sqlx slices binds per-statement by `count_placeholders`, so
        // ordering matters when 04.2 multi-statement lands.
        let md = "```http alias=src\nGET /\n```\n\n```db-postgres alias=q\nSELECT 1\n```\n";
        let mut doc = make_doc(md);
        let blocks = block_indices(&doc);
        set_cache(
            &mut doc,
            blocks[0],
            serde_json::json!({ "a": 1, "b": "two", "c": true }),
        );
        let (sql, binds) = resolve_block_refs(
            doc.segments(),
            blocks[1],
            "SELECT {{src.a}}, {{src.b}}, {{src.c}}",
            &empty_env(),
        )
        .expect("resolves");
        assert_eq!(sql, "SELECT ?, ?, ?");
        assert_eq!(
            binds,
            vec![
                serde_json::json!(1),
                serde_json::json!("two"),
                serde_json::json!(true),
            ]
        );
    }

    #[test]
    fn resolve_block_refs_preserves_value_types() {
        // Number stays a Number (driver decides numeric coercion);
        // bool stays a Bool; null stays Null. Earlier code stringified
        // each into a SQL literal — that's what we're moving away from.
        let md = "```http alias=src\nGET /\n```\n\n```db-postgres alias=q\nSELECT 1\n```\n";
        let mut doc = make_doc(md);
        let blocks = block_indices(&doc);
        set_cache(
            &mut doc,
            blocks[0],
            serde_json::json!({ "n": 42, "f": false, "z": serde_json::Value::Null }),
        );
        let (_, binds) = resolve_block_refs(
            doc.segments(),
            blocks[1],
            "SELECT {{src.n}}, {{src.f}}, {{src.z}}",
            &empty_env(),
        )
        .expect("resolves");
        assert!(binds[0].is_number(), "number type lost: {:?}", binds[0]);
        assert!(binds[1].is_boolean(), "bool type lost: {:?}", binds[1]);
        assert!(binds[2].is_null(), "null type lost: {:?}", binds[2]);
    }

    #[test]
    fn resolve_block_refs_env_var_becomes_string_bind() {
        // Single-segment refs that don't match a block fall back to
        // env vars and bind as a String. This replaces the old path
        // that wrapped values in `'...'` SQL literals.
        let mut env = std::collections::HashMap::new();
        env.insert("API_TOKEN".to_string(), "abc-123".to_string());
        let md = "```db-postgres alias=q\nSELECT 1\n```\n";
        let doc = make_doc(md);
        let blocks = block_indices(&doc);
        let (sql, binds) = resolve_block_refs(
            doc.segments(),
            blocks[0],
            "SELECT {{API_TOKEN}}",
            &env,
        )
        .expect("resolves");
        assert_eq!(sql, "SELECT ?");
        assert_eq!(binds, vec![serde_json::json!("abc-123")]);
    }

    #[test]
    fn resolve_block_refs_rejects_array_or_object_value() {
        // Driver-side bind can't take a JSON array or object on the
        // dialects we target — caller sees a clear error instead of a
        // silent stringify. Mirrors desktop behavior.
        let md = "```http alias=src\nGET /\n```\n\n```db-postgres alias=q\nSELECT 1\n```\n";
        let mut doc = make_doc(md);
        let blocks = block_indices(&doc);
        set_cache(
            &mut doc,
            blocks[0],
            serde_json::json!({ "items": [1, 2, 3] }),
        );
        let err = resolve_block_refs(
            doc.segments(),
            blocks[1],
            "SELECT * FROM x WHERE y = {{src.items}}",
            &empty_env(),
        )
        .expect_err("array values can't bind");
        assert!(err.contains("non-scalar"), "got: {err}");
    }

    #[test]
    fn resolve_block_refs_unknown_alias_errors() {
        // A dotted ref to a non-existent block fails loudly instead of
        // silently leaving the placeholder — same desktop semantics.
        let md = "```db-postgres alias=q\nSELECT 1\n```\n";
        let doc = make_doc(md);
        let blocks = block_indices(&doc);
        let err = resolve_block_refs(
            doc.segments(),
            blocks[0],
            "SELECT * FROM x WHERE y = {{ghost.id}}",
            &empty_env(),
        )
        .expect_err("ghost alias has no upstream block");
        assert!(err.contains("ghost"), "got: {err}");
    }

    #[test]
    fn resolve_block_refs_preserves_query_when_no_refs_present() {
        // Plain SQL passes through verbatim with an empty bind array.
        let md = "```db-postgres alias=q\nSELECT 1\n```\n";
        let doc = make_doc(md);
        let blocks = block_indices(&doc);
        let (sql, binds) = resolve_block_refs(
            doc.segments(),
            blocks[0],
            "SELECT 1 FROM users LIMIT 10",
            &empty_env(),
        )
        .expect("resolves");
        assert_eq!(sql, "SELECT 1 FROM users LIMIT 10");
        assert!(binds.is_empty());
    }

    // ───────────── DB response shim (multi-statement) ─────────────
    //
    // Once a block is a `db-*` block and its cached_result has the
    // `{results: [...]}` shape, `{{alias.response.…}}` enters the
    // shim path that mirrors the desktop's `makeDbResponseView`:
    //   - response.results / response.messages / response.stats: passthrough
    //   - response.<N>: numeric shortcut → results[N]
    //   - response.<col>: legacy → results[0].rows[0].<col>

    fn db_response(results: serde_json::Value) -> serde_json::Value {
        // Build a minimal `DbResponse`-shaped JSON. Pre-redesign caches
        // (no `results` array) bypass the shim — see `is_db_response_shape`.
        serde_json::json!({
            "results": results,
            "messages": [],
            "plan": serde_json::Value::Null,
            "stats": { "elapsed_ms": 12 }
        })
    }

    fn select_result(rows: serde_json::Value) -> serde_json::Value {
        serde_json::json!({
            "kind": "select",
            "columns": [],
            "rows": rows,
            "has_more": false
        })
    }

    #[test]
    fn db_shim_legacy_response_col_resolves_first_row_first_result() {
        // `{{q.response.id}}` ≡ `results[0].rows[0].id` — the
        // pre-redesign shape. Notes that pre-date multi-result must
        // keep working, so this is a parity guarantee.
        let md = "```db-postgres alias=src\nSELECT 1\n```\n\n```db-postgres alias=q\nSELECT 1\n```\n";
        let mut doc = make_doc(md);
        let blocks = block_indices(&doc);
        set_cache(
            &mut doc,
            blocks[0],
            db_response(serde_json::json!([
                select_result(serde_json::json!([{ "id": 7, "name": "alice" }])),
            ])),
        );
        let (sql, binds) = resolve_block_refs(
            doc.segments(),
            blocks[1],
            "SELECT * FROM users WHERE id = {{src.response.id}}",
            &empty_env(),
        )
        .expect("resolves");
        assert_eq!(sql, "SELECT * FROM users WHERE id = ?");
        assert_eq!(binds, vec![serde_json::json!(7)]);
    }

    #[test]
    fn db_shim_explicit_path_walks_results_array() {
        // `{{q.response.0.rows.0.id}}` is the shape `{{` autocomplete
        // will guide users toward — passes through `results[]` cleanly.
        let md = "```db-postgres alias=src\nSELECT 1\n```\n\n```db-postgres alias=q\nSELECT 1\n```\n";
        let mut doc = make_doc(md);
        let blocks = block_indices(&doc);
        set_cache(
            &mut doc,
            blocks[0],
            db_response(serde_json::json!([
                select_result(serde_json::json!([{ "id": 7 }, { "id": 8 }])),
            ])),
        );
        let (_, binds) = resolve_block_refs(
            doc.segments(),
            blocks[1],
            "SELECT {{src.response.0.rows.1.id}}",
            &empty_env(),
        )
        .expect("resolves");
        assert_eq!(binds, vec![serde_json::json!(8)]);
    }

    #[test]
    fn db_shim_numeric_shortcut_targets_second_result_set() {
        // `BEGIN; SELECT a; SELECT b; ROLLBACK;` → 4 results. The
        // numeric shortcut `response.2` lets a downstream block grab
        // the *second* SELECT without spelling out `results.2`.
        let md = "```db-postgres alias=src\nSELECT 1\n```\n\n```db-postgres alias=q\nSELECT 1\n```\n";
        let mut doc = make_doc(md);
        let blocks = block_indices(&doc);
        set_cache(
            &mut doc,
            blocks[0],
            db_response(serde_json::json!([
                serde_json::json!({ "kind": "mutation", "rows_affected": 0 }),
                select_result(serde_json::json!([{ "x": 1 }])),
                select_result(serde_json::json!([{ "y": 99 }])),
                serde_json::json!({ "kind": "mutation", "rows_affected": 0 }),
            ])),
        );
        let (_, binds) = resolve_block_refs(
            doc.segments(),
            blocks[1],
            "SELECT {{src.response.2.rows.0.y}}",
            &empty_env(),
        )
        .expect("resolves");
        assert_eq!(binds, vec![serde_json::json!(99)]);
    }

    #[test]
    fn db_shim_passthrough_stats_returns_elapsed_ms() {
        // `response.stats.elapsed_ms` walks the raw `DbResponse`
        // shape — useful for "did the upstream block take too long?"
        // gating, and proves the passthrough branch is wired.
        let md = "```db-postgres alias=src\nSELECT 1\n```\n\n```db-postgres alias=q\nSELECT 1\n```\n";
        let mut doc = make_doc(md);
        let blocks = block_indices(&doc);
        set_cache(
            &mut doc,
            blocks[0],
            db_response(serde_json::json!([
                select_result(serde_json::json!([{ "id": 1 }])),
            ])),
        );
        let (_, binds) = resolve_block_refs(
            doc.segments(),
            blocks[1],
            "SELECT {{src.response.stats.elapsed_ms}}",
            &empty_env(),
        )
        .expect("resolves");
        assert_eq!(binds, vec![serde_json::json!(12)]);
    }

    #[test]
    fn db_shim_mutation_rows_affected_via_explicit_path() {
        // For mutations there's no `rows[]`, so the legacy column
        // shim doesn't apply. The explicit `response.0.rows_affected`
        // path goes through the numeric-shortcut branch and reads it
        // off the result-set object.
        let md = "```db-postgres alias=src\nUPDATE foo SET x=1\n```\n\n```db-postgres alias=q\nSELECT 1\n```\n";
        let mut doc = make_doc(md);
        let blocks = block_indices(&doc);
        set_cache(
            &mut doc,
            blocks[0],
            db_response(serde_json::json!([
                serde_json::json!({ "kind": "mutation", "rows_affected": 7 }),
            ])),
        );
        let (_, binds) = resolve_block_refs(
            doc.segments(),
            blocks[1],
            "SELECT {{src.response.0.rows_affected}}",
            &empty_env(),
        )
        .expect("resolves");
        assert_eq!(binds, vec![serde_json::json!(7)]);
    }

    #[test]
    fn db_shim_legacy_against_mutation_errors_clearly() {
        // `response.<col>` falls through the legacy branch which
        // expects rows[0]. A mutation has no rows, so the user sees a
        // clear error instead of a confusing "column not found".
        let md = "```db-postgres alias=src\nUPDATE foo SET x=1\n```\n\n```db-postgres alias=q\nSELECT 1\n```\n";
        let mut doc = make_doc(md);
        let blocks = block_indices(&doc);
        set_cache(
            &mut doc,
            blocks[0],
            db_response(serde_json::json!([
                serde_json::json!({ "kind": "mutation", "rows_affected": 1 }),
            ])),
        );
        let err = resolve_block_refs(
            doc.segments(),
            blocks[1],
            "SELECT {{src.response.id}}",
            &empty_env(),
        )
        .expect_err("mutation has no rows");
        assert!(
            err.contains("rows") || err.contains("mutation"),
            "got: {err}"
        );
    }

    #[test]
    fn db_shim_out_of_bounds_result_index_errors() {
        // `response.5` against a single-result response surfaces a
        // bounds error with the actual length so users can fix the
        // path.
        let md = "```db-postgres alias=src\nSELECT 1\n```\n\n```db-postgres alias=q\nSELECT 1\n```\n";
        let mut doc = make_doc(md);
        let blocks = block_indices(&doc);
        set_cache(
            &mut doc,
            blocks[0],
            db_response(serde_json::json!([
                select_result(serde_json::json!([{ "id": 1 }])),
            ])),
        );
        let err = resolve_block_refs(
            doc.segments(),
            blocks[1],
            "SELECT {{src.response.5.rows.0.id}}",
            &empty_env(),
        )
        .expect_err("only 1 result, idx 5 out of bounds");
        assert!(err.contains("out of bounds"), "got: {err}");
    }

    #[test]
    fn db_shim_skipped_when_cached_lacks_results_array() {
        // Pre-redesign caches don't have `{results: [...]}` — the
        // shim must not engage so older notes still resolve via plain
        // dot-navigation. Here the cached blob is a flat object.
        let md = "```db-postgres alias=src\nSELECT 1\n```\n\n```db-postgres alias=q\nSELECT 1\n```\n";
        let mut doc = make_doc(md);
        let blocks = block_indices(&doc);
        set_cache(
            &mut doc,
            blocks[0],
            serde_json::json!({ "id": 42 }),
        );
        let (_, binds) = resolve_block_refs(
            doc.segments(),
            blocks[1],
            "SELECT {{src.response.id}}",
            &empty_env(),
        )
        .expect("resolves via legacy dot-nav");
        assert_eq!(binds, vec![serde_json::json!(42)]);
    }
}
