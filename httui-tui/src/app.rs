use crossterm::event::KeyEvent;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tokio::sync::mpsc::UnboundedSender;
use tokio_util::sync::CancellationToken;
use tracing::{debug, info, warn};

use std::sync::Arc;

use httui_core::db::connections::PoolManager;
use sqlx::SqlitePool;

use crate::buffer::layout::{layout_document, SegmentLayout};
use crate::buffer::{Cursor, Document, Segment};
use crate::config::Config;
use crate::document_loader;
use crate::error::TuiResult;
use crate::event::{AppEvent, EventLoop};
use crate::pane::{Pane, PaneNode, TabState};
use crate::terminal;
use crate::tree::FileTree;
use crate::ui;
use crate::vault::ResolvedVault;
use crate::vim::{self, VimState};

const SCROLL_OFF: u16 = 3;

/// Severity hint for [`StatusMessage`]; drives the status-bar styling.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StatusKind {
    Info,
    Error,
}

/// Transient footer message — shown until the next keystroke replaces it.
/// Set by ex commands (`:w wrote …`, `:q error …`).
#[derive(Debug, Clone)]
pub struct StatusMessage {
    pub text: String,
    pub kind: StatusKind,
}

/// Open-tab registry. Each tab owns an independent [`TabState`] (a
/// binary tree of panes); the active tab is `tabs[active]`. Inactive
/// tabs keep their full pane state — there is no "stash" indirection
/// any more, since the data lives in the tree itself.
#[derive(Default)]
pub struct TabBar {
    pub tabs: Vec<TabState>,
    pub active: usize,
}

impl TabBar {
    pub fn len(&self) -> usize {
        self.tabs.len()
    }

    pub fn is_empty(&self) -> bool {
        self.tabs.is_empty()
    }

    pub fn active(&self) -> usize {
        self.active
    }

    /// Path shown by each tab's focused leaf, in display order. Used to
    /// render tab titles and to detect whether a path is already open.
    pub fn focused_paths(&self) -> Vec<Option<PathBuf>> {
        self.tabs
            .iter()
            .map(|t| t.active_leaf().document_path.clone())
            .collect()
    }

    /// Index of the tab whose *focused* pane shows `path`, if any.
    /// Non-focused panes inside other tabs are not searched — they're
    /// not addressable through the tab bar.
    pub fn find_focused(&self, path: &Path) -> Option<usize> {
        self.tabs.iter().position(|t| {
            t.active_leaf()
                .document_path
                .as_deref()
                .is_some_and(|p| p == path)
        })
    }

    /// Mutable borrow of the active tab's focused-leaf document. Lives
    /// on `TabBar` (rather than `App`) so callers can hold it
    /// alongside borrows of disjoint `App` fields like
    /// `app.vim.unnamed` — Rust permits split borrows across distinct
    /// fields, but only when the borrow doesn't pass through a method
    /// call on `App` itself.
    pub fn active_document_mut(&mut self) -> Option<&mut crate::buffer::Document> {
        let idx = self.active;
        self.tabs
            .get_mut(idx)?
            .active_leaf_mut()
            .document
            .as_mut()
    }

}

/// In-flight async DB execution. Stores the cancel handle so a
/// `Ctrl-C` can abort the running future, plus enough context to
/// fold the result into the right block when the spawned task
/// reports back via `AppEvent::DbBlockResult`. The "unused" fields
/// (`segment_idx`, `started_at`, `kind`) are read by the renderer
/// (spinner placement / elapsed display) — `#[allow(dead_code)]`
/// keeps the warning quiet until that lands.
#[allow(dead_code)]
pub struct RunningQuery {
    pub segment_idx: usize,
    pub cancel: CancellationToken,
    pub started_at: Instant,
    pub kind: RunningKind,
    /// Cache key for save-on-success: `(file_path, hash)`. Populated
    /// by `apply_run_block` only for cacheable queries (SELECT-ish)
    /// and only when the active pane has a file path. `None` for
    /// mutations and load-more pages — they never write to the cache.
    pub cache_key: Option<(String, String)>,
}

#[derive(Debug, Clone, Copy)]
#[allow(dead_code)]
pub enum RunningKind {
    /// Initial run (`r` keypress) — replaces the block's
    /// `cached_result` on completion.
    Run,
    /// Pagination triggered by the result-table prefetch — appends
    /// rows to the existing `cached_result`.
    LoadMore,
    /// `<C-x>` (EXPLAIN) — runs the query wrapped in the dialect's
    /// EXPLAIN keyword. Lands in `cached_result["plan"]` so the
    /// original query's output stays intact; auto-switches the
    /// result tab to `Plan` so the user sees the new plan.
    Explain,
}

/// Open instance of the connection picker popup. Anchored to the
/// DB block at `segment_idx` (the cursor was on it when the picker
/// opened); `connections` is the list pulled from `httui-core`'s
/// connection registry; `selected` indexes into it. The renderer
/// paints the popup just below the block (or above when there's no
/// room) — see `ui::connection_picker`.
pub struct ConnectionPickerState {
    pub segment_idx: usize,
    pub connections: Vec<ConnectionEntry>,
    pub selected: usize,
}

/// Lightweight snapshot of one connection — the picker only needs
/// the id (to write back to the fence) and the human label (to
/// show in the list). Cloned out of `httui-core`'s registry at
/// open-time so the picker doesn't hold a borrow on the pool
/// manager while it's up.
#[derive(Debug, Clone)]
pub struct ConnectionEntry {
    pub id: String,
    pub name: String,
    pub kind: String,
}

/// Open instance of the SQL completion popup. Anchored to the DB
/// block at `segment_idx`; `(anchor_line, anchor_offset)` is where
/// the prefix word starts inside the block body — Accept replaces
/// from there to the current cursor with the selected item's label.
///
/// The popup co-exists with `Mode::Insert` (mode never flips) so the
/// user can keep typing to filter the list. The dispatcher
/// intercepts a small set of keys (`Tab`/`Enter`/`Esc`/`Ctrl-n`/
/// `Ctrl-p`/`Down`/`Up`) and routes them to the popup; everything
/// else falls through to normal insert handling and triggers a
/// re-filter.
pub struct CompletionPopupState {
    pub segment_idx: usize,
    pub items: Vec<crate::sql_completion::CompletionItem>,
    pub selected: usize,
    /// `(line, offset)` where the prefix word starts in the block
    /// body — the renderer drops the popup right below this cell so
    /// the dropdown tracks the cursor as the user types.
    pub anchor_line: usize,
    pub anchor_offset: usize,
    /// What the user has typed so far — drives the popup header and
    /// gets replaced on Accept.
    pub prefix: String,
}

/// Open instance of the row-detail modal. The body lives in its own
/// `Document` so the editor's full motion vocabulary (`hjkl`, `wbe`,
/// `gg`/`G`, `Ctrl-d`/`Ctrl-u`, `f`/`F`, etc.) navigates the modal
/// out of the box — `parse_db_row_detail` filters `parse_normal`
/// down to motions and the dispatch routes them to `state.doc`.
///
/// `segment_idx` + `row` are kept as a back-pointer for the title +
/// status (and a future "jump back to the source row" command). The
/// body text is snapshotted at open time; re-running the underlying
/// block while the modal is up doesn't mutate it. `viewport_height`
/// is written back by the renderer so half/full-page motions know
/// how far to jump.
pub struct DbRowDetailState {
    /// Back-pointer to the source row in the editor's document.
    /// Used by `dispatch::db_row_payload` for the (yet-to-land)
    /// clipboard copy and by a future "jump back to row" command.
    #[allow(dead_code)]
    pub segment_idx: usize,
    #[allow(dead_code)]
    pub row: usize,
    pub title: String,
    pub doc: Document,
    pub viewport_height: u16,
    /// Top line of the visible window inside the modal. Persists
    /// across frames so the viewport behaves like the editor's: it
    /// stays put while the cursor moves inside the window, and only
    /// adjusts when the cursor would otherwise scroll off-screen
    /// (mirrors `app::clamp_viewport`).
    pub viewport_top: u16,
}

/// Global application state.
pub struct App {
    pub config: Config,
    pub vault_path: PathBuf,
    pub vim: VimState,
    pub tree: FileTree,
    pub tabs: TabBar,
    pub status_message: Option<StatusMessage>,
    pub should_quit: bool,
    /// Shared connection-pool registry. Built once at startup, holds
    /// pools per `connection_id` so the DB executor doesn't reconnect
    /// on every run.
    pub pool_manager: Arc<PoolManager>,
    /// `connection_id → human-readable name` lookup, populated at
    /// startup. The renderer uses this to show `connection: prod-db`
    /// in DB block footers instead of a raw UUID. Refreshed by
    /// `App::refresh_connection_names`.
    pub connection_names: std::collections::HashMap<String, String>,
    /// `Some` while the row-detail modal is open. Mode flips to
    /// `Mode::DbRowDetail` in lockstep so the dispatcher routes keys
    /// to the modal's parser.
    pub db_row_detail: Option<DbRowDetailState>,
    /// Sender for the main loop's `AppEvent` channel — handed to
    /// spawned async tasks (currently the DB executor) so they can
    /// notify the loop when their work completes. Optional so unit
    /// tests can construct an `App` without an event loop; in
    /// production it's always populated by `App::wire_event_sender`
    /// before `main_loop` starts.
    pub event_sender: Option<UnboundedSender<AppEvent>>,
    /// Currently running async DB query, if any. Populated by
    /// `apply_run_block` / `load_more_db_block`; cleared by the
    /// main loop when the corresponding `DbBlockResult` arrives.
    /// Used by both the renderer (spinner) and the dispatcher
    /// (`Ctrl-C` to cancel).
    pub running_query: Option<RunningQuery>,
    /// Top row index of each DB block's result-table viewport,
    /// keyed by `segment_idx`. Persists across cursor moves so the
    /// scroll feels like an editor pane (cursor floats inside the
    /// window; window only slides when the cursor would scroll
    /// off-screen). Updated by the renderer in `ui::blocks`.
    pub result_viewport_top: std::collections::HashMap<usize, u16>,
    /// `Some` while the connection picker popup is open. Mode flips
    /// to `Mode::ConnectionPicker` so dispatch routes keys to the
    /// picker's parser. The popup renders independently of mode —
    /// any `Some` value paints it.
    pub connection_picker: Option<ConnectionPickerState>,
    /// In-memory introspection cache, fed by background tasks
    /// spawned from `ensure_schema_loaded`. Keyed by `connection_id`.
    /// The SQL completion engine (Story 04.4b) reads from here
    /// synchronously and falls back to "loading…" when the entry is
    /// absent. See `crate::schema` for the cache + dedup model.
    pub schema_cache: crate::schema::SchemaCache,
    /// `Some` while the SQL completion popup is open. Created by the
    /// dispatcher after a typing-relevant action lands in a DB block
    /// body; cleared on Accept/Dismiss or when the prefix becomes
    /// empty.
    pub completion_popup: Option<CompletionPopupState>,
    /// `Some` while the run-confirm modal is up. Set by
    /// `apply_run_block` when it detects an unscoped destructive
    /// query (UPDATE/DELETE without WHERE); the user answers `y`
    /// to run anyway or `n`/Esc/Ctrl-C to cancel.
    pub db_confirm_run: Option<DbConfirmRunState>,
    /// Selected tab in the DB result panel. Single global state —
    /// every block's result section uses the same selection. Cycled
    /// via `gt` / `gT` while the cursor is on a result row.
    pub db_result_tab: ResultPanelTab,
    /// `Some` while an inline fence-edit prompt is open (alias /
    /// limit / timeout). Mode flips to `Mode::FenceEdit` so dispatch
    /// routes typing into the prompt's `LineEdit`. Renders in the
    /// status bar like `TreePrompt` so the editor underneath stays
    /// visible. See `commands::db::open_fence_edit_*`.
    pub fence_edit: Option<FenceEditState>,
}

/// State for the inline fence-edit prompt. `kind` carries the field
/// being edited (alias today; limit / timeout once those slices land);
/// `input` is the actual text-edit buffer that the prompt parser
/// drives. `segment_idx` pins the block — the cursor may move while
/// the prompt is up, but the edit always commits to the block the
/// user opened the prompt against.
#[derive(Debug, Clone)]
pub struct FenceEditState {
    pub segment_idx: usize,
    pub kind: FenceEditKind,
    pub input: crate::vim::lineedit::LineEdit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FenceEditKind {
    /// `<C-a>` on a block — edit the alias used in `{{alias.path}}`
    /// refs and shown in the block title. Blank input clears the
    /// alias (block becomes anonymous).
    Alias,
}

impl FenceEditKind {
    pub fn label(self) -> &'static str {
        match self {
            FenceEditKind::Alias => "alias",
        }
    }
}

/// State for the run-confirm modal. Carries the segment to re-run
/// (the cursor may have moved in between) and the human reason
/// shown to the user (e.g. "UPDATE without WHERE").
pub struct DbConfirmRunState {
    pub segment_idx: usize,
    pub reason: String,
}

/// Selected tab in the DB result panel. Single global state — every
/// DB block uses the same selection so cycling on one block carries
/// over when you jump to another. Default `Result`.
///
/// Order matches the visual order of the tab bar; `next()` / `prev()`
/// wrap so cycling is keyboard-friendly.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub enum ResultPanelTab {
    #[default]
    Result,
    Messages,
    Plan,
    Stats,
}

impl ResultPanelTab {
    pub fn label(self) -> &'static str {
        match self {
            ResultPanelTab::Result => "Result",
            ResultPanelTab::Messages => "Messages",
            ResultPanelTab::Plan => "Plan",
            ResultPanelTab::Stats => "Stats",
        }
    }

    pub fn next(self) -> Self {
        match self {
            ResultPanelTab::Result => ResultPanelTab::Messages,
            ResultPanelTab::Messages => ResultPanelTab::Plan,
            ResultPanelTab::Plan => ResultPanelTab::Stats,
            ResultPanelTab::Stats => ResultPanelTab::Result,
        }
    }

    pub fn prev(self) -> Self {
        match self {
            ResultPanelTab::Result => ResultPanelTab::Stats,
            ResultPanelTab::Messages => ResultPanelTab::Result,
            ResultPanelTab::Plan => ResultPanelTab::Messages,
            ResultPanelTab::Stats => ResultPanelTab::Plan,
        }
    }
}

#[cfg(test)]
mod tab_tests {
    use super::ResultPanelTab;

    #[test]
    fn tab_next_cycles_forward_with_wrap() {
        // Result → Messages → Plan → Stats → Result. The wrap is
        // important: `gt` keeps spinning instead of getting stuck
        // at the end.
        let mut t = ResultPanelTab::default();
        assert_eq!(t, ResultPanelTab::Result);
        t = t.next();
        assert_eq!(t, ResultPanelTab::Messages);
        t = t.next();
        assert_eq!(t, ResultPanelTab::Plan);
        t = t.next();
        assert_eq!(t, ResultPanelTab::Stats);
        t = t.next();
        assert_eq!(t, ResultPanelTab::Result);
    }

    #[test]
    fn tab_prev_inverts_next() {
        // Walking back is the mirror of walking forward — useful
        // when the user overshoots with `gt` and needs `gT` to
        // back out.
        let mut t = ResultPanelTab::default();
        for _ in 0..4 {
            let forward = t.next();
            let back = forward.prev();
            assert_eq!(back, t);
            t = forward;
        }
    }
}

impl App {
    pub fn new(config: Config, resolved: ResolvedVault, app_pool: SqlitePool) -> Self {
        let pool_manager = Arc::new(PoolManager::new_standalone(app_pool));
        let connection_names = load_connection_names(pool_manager.app_pool());
        let mut app = Self {
            config,
            vault_path: resolved.vault,
            vim: VimState::new(),
            tree: FileTree::default(),
            tabs: TabBar::default(),
            status_message: None,
            should_quit: false,
            pool_manager,
            connection_names,
            db_row_detail: None,
            event_sender: None,
            running_query: None,
            result_viewport_top: std::collections::HashMap::new(),
            connection_picker: None,
            schema_cache: crate::schema::SchemaCache::new(),
            completion_popup: None,
            db_confirm_run: None,
            db_result_tab: ResultPanelTab::default(),
            fence_edit: None,
        };
        app.load_initial_document();
        app
    }

    /// Kick off a background introspection of `connection_id` if one
    /// isn't already pending and the cache is empty. Cheap to call
    /// repeatedly — the dedup gate makes the second/third call a
    /// no-op. Result lands as `AppEvent::SchemaLoaded`.
    pub fn ensure_schema_loaded(&mut self, connection_id: &str) {
        if self.schema_cache.get(connection_id).is_some() {
            return;
        }
        if self.schema_cache.is_pending(connection_id) {
            return;
        }
        let Some(sender) = self.event_sender.clone() else {
            // No event loop wired yet (unit-test-only path). Skip
            // silently — the test that constructed the App didn't
            // need async cache resolution.
            return;
        };
        self.schema_cache.mark_pending(connection_id);
        let pool_mgr = self.pool_manager.clone();
        let app_pool = self.pool_manager.app_pool().clone();
        let conn_id = connection_id.to_string();
        tokio::spawn(async move {
            // SQLite cache (TTL 300s) is the fast path; introspection
            // hits the actual driver only on miss / expired entries.
            // Mirrors `useSchemaCacheStore.ensureLoaded` on desktop.
            let result = match httui_core::db::schema_cache::get_cached_schema(
                &app_pool, &conn_id, 300,
            )
            .await
            {
                Ok(Some(entries)) if !entries.is_empty() => Ok(entries),
                _ => httui_core::db::schema_cache::introspect_schema(
                    &pool_mgr, &app_pool, &conn_id,
                )
                .await,
            };
            let _ = sender.send(crate::event::AppEvent::SchemaLoaded {
                connection_id: conn_id,
                result,
            });
        });
    }

    /// Fold a `SchemaLoaded` event into `schema_cache`. Called from
    /// the main loop. Errors surface in the status bar but don't
    /// poison the cache so a retry can succeed.
    pub fn on_schema_loaded(
        &mut self,
        connection_id: String,
        result: Result<Vec<httui_core::db::schema_cache::SchemaEntry>, String>,
    ) {
        self.schema_cache.clear_pending(&connection_id);
        match result {
            Ok(entries) => {
                let tables = crate::schema::group_entries(entries);
                self.schema_cache.store(&connection_id, tables);
            }
            Err(msg) => {
                self.set_status(
                    StatusKind::Error,
                    format!("schema introspection failed: {msg}"),
                );
            }
        }
    }

    /// Refresh the connection_id → name cache from SQLite. Call
    /// after creating / renaming / deleting a connection so block
    /// footers update without restarting the TUI.
    #[allow(dead_code)] // wired up by the upcoming connection picker.
    pub fn refresh_connection_names(&mut self) {
        self.connection_names = load_connection_names(self.pool_manager.app_pool());
    }

    /// Set the transient footer message. Cleared on next key dispatch.
    pub fn set_status(&mut self, kind: StatusKind, text: impl Into<String>) {
        self.status_message = Some(StatusMessage {
            text: text.into(),
            kind,
        });
    }

    pub fn clear_status(&mut self) {
        self.status_message = None;
    }

    fn load_initial_document(&mut self) {
        let Some(file) = document_loader::pick_initial_file(&self.vault_path) else {
            // No file → still create an empty tab so the tree has
            // somewhere to anchor focus when files appear later.
            self.tabs.tabs.push(TabState::new(Pane::empty()));
            self.tabs.active = 0;
            return;
        };
        match document_loader::load_document(&self.vault_path, &file) {
            Ok(doc) => {
                self.tabs.tabs.push(TabState::new(Pane::new(doc, file)));
                self.tabs.active = 0;
            }
            Err(e) => {
                warn!(?e, "failed to load initial document");
                self.tabs.tabs.push(TabState::new(Pane::empty()));
                self.tabs.active = 0;
            }
        }
    }

    // ----- pane accessors --------------------------------------------------

    pub fn active_tab(&self) -> Option<&TabState> {
        self.tabs.tabs.get(self.tabs.active)
    }

    pub fn active_tab_mut(&mut self) -> Option<&mut TabState> {
        self.tabs.tabs.get_mut(self.tabs.active)
    }

    pub fn active_pane(&self) -> Option<&Pane> {
        self.active_tab().map(|t| t.active_leaf())
    }

    pub fn active_pane_mut(&mut self) -> Option<&mut Pane> {
        self.active_tab_mut().map(|t| t.active_leaf_mut())
    }

    /// The document the vim engine should operate on right now. When
    /// the row-detail modal is open this returns the modal's body
    /// `Document`, so motions, search, visual, yank — every read
    /// pathway in the dispatch — see the modal as the active buffer.
    /// File-save / status-bar code that needs the editor's note
    /// specifically should reach for `tabs.active_document()` instead.
    pub fn document(&self) -> Option<&Document> {
        if let Some(state) = self.db_row_detail.as_ref() {
            return Some(&state.doc);
        }
        self.active_pane().and_then(|p| p.document.as_ref())
    }

    /// Mutable counterpart of [`Self::document`]. Same redirect: the
    /// modal's body doc wins while the modal is up. Mutating the
    /// modal doc is fine — the parser filter blocks every action
    /// that would actually change its contents (insert / edit /
    /// paste / undo), so this stays "read-only" from the user's
    /// perspective.
    pub fn document_mut(&mut self) -> Option<&mut Document> {
        // Two-step access keeps the borrow checker happy: probe
        // `is_some` immutably (drops at end of `if`), then take a
        // fresh mut borrow only on the modal branch.
        if self.db_row_detail.is_some() {
            return self.db_row_detail.as_mut().map(|s| &mut s.doc);
        }
        self.active_pane_mut().and_then(|p| p.document.as_mut())
    }

    pub fn document_path(&self) -> Option<&PathBuf> {
        self.active_pane().and_then(|p| p.document_path.as_ref())
    }

    /// Height the vim engine should use for half-page motions. While
    /// the modal is open this returns the modal's body height — same
    /// reasoning as [`Self::document`].
    pub fn viewport_height(&self) -> u16 {
        if let Some(state) = self.db_row_detail.as_ref() {
            return state.viewport_height;
        }
        self.active_pane().map(|p| p.viewport_height).unwrap_or(0)
    }

    // ----- viewport refresh ----------------------------------------------

    /// Re-anchor the viewport so the cursor stays visible after a
    /// motion or edit. Public so the vim dispatcher can call it.
    pub fn refresh_viewport_for_cursor(&mut self) {
        let Some(pane) = self.active_pane_mut() else {
            return;
        };
        let Some(doc) = pane.document.as_ref() else {
            return;
        };
        let layouts = layout_document(doc, 80);
        let cursor_y = cursor_y(doc, &layouts);
        pane.viewport_top = clamp_viewport(pane.viewport_top, pane.viewport_height, cursor_y);
    }

    // ----- file open / tab management ------------------------------------

    /// Replace the focused pane's document with the file at
    /// `relative_path`. If that file is the focused leaf of another
    /// tab, switches to that tab instead. Refuses to clobber a dirty
    /// buffer unless `force` is true.
    pub fn open_document(&mut self, relative_path: PathBuf, force: bool) -> Result<String, String> {
        if let Some(idx) = self.tabs.find_focused(&relative_path) {
            self.tabs.active = idx;
            return Ok(format!("\"{}\"", file_name(&relative_path)));
        }
        if !force
            && self
                .active_pane()
                .and_then(|p| p.document.as_ref())
                .is_some_and(|d| d.is_dirty())
        {
            return Err("no write since last change (add ! to override)".into());
        }
        let doc = document_loader::load_document(&self.vault_path, &relative_path)
            .map_err(|e| format!("E484: Can't open file: {e}"))?;
        let name = file_name(&relative_path);
        // No tab yet (e.g. last close left us empty)? Open as new tab.
        if self.tabs.is_empty() {
            self.tabs.tabs.push(TabState::new(Pane::new(doc, relative_path)));
            self.tabs.active = 0;
            return Ok(format!("\"{name}\""));
        }
        // Replace the focused pane's document in-place.
        if let Some(p) = self.active_pane_mut() {
            p.document = Some(doc);
            p.document_path = Some(relative_path);
            p.viewport_top = 0;
        }
        Ok(format!("\"{name}\""))
    }

    /// Open `relative_path` in a brand-new tab. If already focused in
    /// another tab, switches to it instead.
    pub fn open_in_new_tab(&mut self, relative_path: PathBuf) -> Result<String, String> {
        if let Some(idx) = self.tabs.find_focused(&relative_path) {
            self.tabs.active = idx;
            return Ok(format!("\"{}\"", file_name(&relative_path)));
        }
        let doc = document_loader::load_document(&self.vault_path, &relative_path)
            .map_err(|e| format!("E484: Can't open file: {e}"))?;
        let name = file_name(&relative_path);
        let new_tab = TabState::new(Pane::new(doc, relative_path));
        self.tabs.tabs.push(new_tab);
        self.tabs.active = self.tabs.tabs.len() - 1;
        Ok(format!("\"{name}\""))
    }

    pub fn next_tab(&mut self) {
        if self.tabs.len() <= 1 {
            return;
        }
        self.tabs.active = (self.tabs.active + 1) % self.tabs.len();
    }

    pub fn prev_tab(&mut self) {
        if self.tabs.len() <= 1 {
            return;
        }
        self.tabs.active = if self.tabs.active == 0 {
            self.tabs.len() - 1
        } else {
            self.tabs.active - 1
        };
    }

    /// Switch to the 1-indexed tab number `n`. Out-of-range no-ops.
    pub fn goto_tab(&mut self, n: usize) {
        if n == 0 || n > self.tabs.len() {
            return;
        }
        self.tabs.active = n - 1;
    }

    /// Close the active tab (drops every pane inside it). With dirty
    /// content in any pane and `force == false`, refuses.
    pub fn close_tab(&mut self, force: bool) -> Result<String, String> {
        if self.tabs.is_empty() {
            return Err("no tab to close".into());
        }
        let active = self.tabs.active;
        if !force && tab_has_dirty(&self.tabs.tabs[active]) {
            return Err("no write since last change (add ! to override)".into());
        }
        let removed = self.tabs.tabs.remove(active);
        let removed_path = removed
            .active_leaf()
            .document_path
            .clone()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|| "(no name)".into());
        if self.tabs.tabs.is_empty() {
            self.tabs.active = 0;
            return Ok(format!("closed \"{removed_path}\""));
        }
        if active >= self.tabs.tabs.len() {
            self.tabs.active = self.tabs.tabs.len() - 1;
        }
        Ok(format!("closed \"{removed_path}\""))
    }

    // ----- file CRUD (vault-relative) ------------------------------------

    pub fn create_document(
        &mut self,
        relative_path: PathBuf,
        force: bool,
    ) -> Result<String, String> {
        if !force
            && self
                .active_pane()
                .and_then(|p| p.document.as_ref())
                .is_some_and(|d| d.is_dirty())
        {
            return Err("no write since last change (add ! to override)".into());
        }
        let vault = self.vault_path.to_string_lossy().into_owned();
        let path_str = relative_path.to_string_lossy().into_owned();
        httui_core::fs::create_note(&vault, &path_str)
            .map_err(|e| format!("create failed: {e}"))?;
        self.open_document(relative_path, true)
    }

    pub fn create_folder(&mut self, relative_path: PathBuf) -> Result<String, String> {
        let abs = self.vault_path.join(&relative_path);
        if abs.exists() {
            return Err(format!(
                "create folder failed: path already exists: {}",
                relative_path.display()
            ));
        }
        std::fs::create_dir_all(&abs).map_err(|e| format!("create folder failed: {e}"))?;
        Ok(format!(
            "created folder \"{}\"",
            file_name(&relative_path)
        ))
    }

    /// Rename a vault-relative path. With `src == None` the focused
    /// pane's path is used. Updates every pane (across all tabs) that
    /// currently shows the renamed path.
    pub fn rename_path(
        &mut self,
        src: Option<PathBuf>,
        dst: PathBuf,
    ) -> Result<String, String> {
        let src_rel = match src {
            Some(p) => p,
            None => self
                .document_path()
                .cloned()
                .ok_or_else(|| "no file name".to_string())?,
        };
        let vault = self.vault_path.clone();
        let src_abs = vault.join(&src_rel);
        let dst_abs = vault.join(&dst);
        if dst_abs.exists() {
            return Err(format!(
                "E13: File exists (add ! to override): {}",
                dst.display()
            ));
        }
        if let Some(parent) = dst_abs.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("rename failed: {e}"))?;
        }
        std::fs::rename(&src_abs, &dst_abs).map_err(|e| format!("rename failed: {e}"))?;
        // Update every pane referencing the old path.
        for tab in self.tabs.tabs.iter_mut() {
            for_each_leaf_mut(&mut tab.root, &mut |pane| {
                if pane.document_path.as_deref() == Some(src_rel.as_path()) {
                    pane.document_path = Some(dst.clone());
                }
            });
        }
        let name = file_name(&dst);
        Ok(format!("renamed to \"{name}\""))
    }

    /// Delete a path under the vault. Panes pointing at the deleted
    /// path are emptied (document/path → None); a tab containing only
    /// empty leaves is collapsed to a single empty leaf.
    pub fn delete_path(
        &mut self,
        target: Option<PathBuf>,
        force: bool,
    ) -> Result<String, String> {
        let target_rel = match target {
            Some(p) => p,
            None => self
                .document_path()
                .cloned()
                .ok_or_else(|| "no file name".to_string())?,
        };
        let opens_current = self.document_path() == Some(&target_rel);
        if opens_current
            && !force
            && self.document().is_some_and(|d| d.is_dirty())
        {
            return Err("no write since last change (add ! to override)".into());
        }
        let vault = self.vault_path.clone();
        let abs = vault.join(&target_rel);
        let metadata = std::fs::metadata(&abs)
            .map_err(|e| format!("delete failed: {e}"))?;
        if metadata.is_dir() {
            std::fs::remove_dir_all(&abs).map_err(|e| format!("delete failed: {e}"))?;
        } else {
            std::fs::remove_file(&abs).map_err(|e| format!("delete failed: {e}"))?;
        }
        // Empty out any pane whose path matched the deleted target.
        for tab in self.tabs.tabs.iter_mut() {
            for_each_leaf_mut(&mut tab.root, &mut |pane| {
                if pane.document_path.as_deref() == Some(target_rel.as_path()) {
                    pane.document = None;
                    pane.document_path = None;
                    pane.viewport_top = 0;
                }
            });
        }
        Ok(format!("deleted \"{}\"", file_name(&target_rel)))
    }
}

fn tab_has_dirty(tab: &TabState) -> bool {
    let mut dirty = false;
    for_each_leaf(&tab.root, &mut |pane| {
        if pane.document.as_ref().is_some_and(|d| d.is_dirty()) {
            dirty = true;
        }
    });
    dirty
}

fn for_each_leaf(node: &PaneNode, f: &mut impl FnMut(&Pane)) {
    match node {
        PaneNode::Leaf(p) => f(p),
        PaneNode::Split { first, second, .. } => {
            for_each_leaf(first, f);
            for_each_leaf(second, f);
        }
    }
}

fn for_each_leaf_mut(node: &mut PaneNode, f: &mut impl FnMut(&mut Pane)) {
    match node {
        PaneNode::Leaf(p) => f(p),
        PaneNode::Split { first, second, .. } => {
            for_each_leaf_mut(first, f);
            for_each_leaf_mut(second, f);
        }
    }
}

/// Snapshot the connection table into a `id → name` map so renderers
/// can stay sync. Falls back to an empty map on any error — the worst
/// case is footers showing the raw `connection=…` value from the fence.
fn load_connection_names(pool: &SqlitePool) -> std::collections::HashMap<String, String> {
    use httui_core::db::connections::list_connections;
    let result = tokio::task::block_in_place(|| {
        tokio::runtime::Handle::current().block_on(list_connections(pool))
    });
    result
        .ok()
        .map(|conns| conns.into_iter().map(|c| (c.id, c.name)).collect())
        .unwrap_or_default()
}

fn file_name(p: &std::path::Path) -> String {
    p.file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| p.display().to_string())
}

pub async fn run(
    config: Config,
    resolved: ResolvedVault,
    app_pool: SqlitePool,
) -> TuiResult<()> {
    info!(vault = %resolved.vault.display(), "starting notes-tui");

    terminal::install_panic_hook();
    let mut terminal = terminal::setup(config.mouse_enabled)?;
    let mut events = EventLoop::start(Duration::from_millis(250))?;
    let mut app = App::new(config, resolved, app_pool);
    // Spawned async tasks (currently the DB executor in
    // `vim::dispatch`) push their results back through this sender;
    // the main loop folds them into the app via `AppEvent` matches.
    app.event_sender = Some(events.sender());

    let result = main_loop(&mut terminal, &mut app, &mut events).await;

    let _ = terminal::teardown(&mut terminal);
    result
}

async fn main_loop(
    terminal: &mut terminal::Tui,
    app: &mut App,
    events: &mut EventLoop,
) -> TuiResult<()> {
    while !app.should_quit {
        terminal
            .draw(|f| {
                ui::render(f, app);
            })
            .map_err(|e| crate::error::TuiError::Terminal(format!("draw: {e}")))?;

        match events.next().await {
            Some(AppEvent::Key(k)) => handle_key(app, k),
            Some(AppEvent::Resize(_, _)) => {}
            Some(AppEvent::Tick) => {}
            Some(AppEvent::DbBlockResult {
                segment_idx,
                kind,
                outcome,
            }) => {
                crate::commands::db::handle_db_block_result(
                    app,
                    segment_idx,
                    kind,
                    outcome,
                );
            }
            Some(AppEvent::SchemaLoaded {
                connection_id,
                result,
            }) => {
                app.on_schema_loaded(connection_id, result);
            }
            Some(AppEvent::Quit) | None => app.should_quit = true,
        }
    }
    debug!("main loop exiting");
    Ok(())
}

fn handle_key(app: &mut App, key: KeyEvent) {
    vim::dispatch(app, key);
}

/// Y row of the cursor in document-absolute coordinates.
fn cursor_y(doc: &Document, layouts: &[SegmentLayout]) -> u16 {
    match doc.cursor() {
        Cursor::InProse {
            segment_idx,
            offset,
        } => {
            let layout = layouts
                .iter()
                .find(|l| l.segment_idx == segment_idx)
                .copied()
                .unwrap_or(SegmentLayout {
                    segment_idx,
                    y_start: 0,
                    height: 1,
                });
            let line_offset = if let Some(Segment::Prose(rope)) = doc.segments().get(segment_idx) {
                rope.char_to_line(offset.min(rope.len_chars())) as u16
            } else {
                0
            };
            layout.y_start.saturating_add(line_offset)
        }
        Cursor::InBlock {
            segment_idx,
            offset,
        } => layouts
            .iter()
            .find(|l| l.segment_idx == segment_idx)
            .map(|l| {
                use crate::buffer::block::{raw_section_at, RawSection};
                use crate::buffer::Segment;
                let raw = match doc.segments().get(segment_idx) {
                    Some(Segment::Block(b)) => &b.raw,
                    _ => return l.y_start,
                };
                match raw_section_at(raw, offset) {
                    // Header sits on the block's top row.
                    RawSection::Header => l.y_start,
                    // Body lines render starting one row below the
                    // top border (rendered chrome) — keep the same
                    // `+1` offset the previous model used.
                    RawSection::Body { line, .. } => {
                        l.y_start.saturating_add(1).saturating_add(line as u16)
                    }
                    // Closer sits on the block's last row.
                    RawSection::Closer => {
                        l.y_start.saturating_add(l.height.saturating_sub(1))
                    }
                }
            })
            .unwrap_or(0),
        Cursor::InBlockResult { segment_idx, .. } => layouts
            .iter()
            .find(|l| l.segment_idx == segment_idx)
            // Park near the bottom of the block — refresh_viewport
            // already keeps the result table in view. A more precise
            // landing requires knowing each row's y inside the table.
            .map(|l| l.y_start.saturating_add(l.height.saturating_sub(2)))
            .unwrap_or(0),
    }
}

/// Adjust `viewport_top` so the cursor stays inside `[top + scrolloff,
/// top + height - scrolloff)`. Returns the new top.
fn clamp_viewport(viewport_top: u16, height: u16, cursor_y: u16) -> u16 {
    if height == 0 {
        return viewport_top;
    }
    let scrolloff = SCROLL_OFF.min(height / 2);
    let upper = cursor_y.saturating_sub(scrolloff);
    let lower = cursor_y
        .saturating_add(scrolloff + 1)
        .saturating_sub(height);
    if viewport_top > upper {
        upper
    } else if viewport_top < lower {
        lower
    } else {
        viewport_top
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamp_viewport_keeps_cursor_visible() {
        let new_top = clamp_viewport(0, 10, 50);
        assert!(new_top > 0);
        let no_change = clamp_viewport(40, 10, 45);
        assert_eq!(no_change, 40);
    }

    #[test]
    fn clamp_viewport_handles_zero_height() {
        assert_eq!(clamp_viewport(7, 0, 100), 7);
    }
}
