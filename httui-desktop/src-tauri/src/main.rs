// size:exclude file — Tauri command orchestrator. Listed in
// tech-debt.md "Storage" section under main.rs (1013 L baseline);
// scheduled for split in Epic 17 / 20a sweep. Until then incremental
// epics that need to register a command pay 5-15 lines and don't
// trigger refactor.
// coverage:exclude file — Tauri command shells + setup wiring with
// no extractable logic. The substantive code is in `httui-core` and
// the per-domain modules (`chat/`, `executions.rs`,
// `vault_config_commands.rs`), each tested independently.
//
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use sqlx::sqlite::SqlitePool;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use httui_notes::chat::commands::*;
use httui_notes::db::connections::{self, PoolManager, StatusEmitter};

// --- Tauri StatusEmitter implementation ---

#[derive(Clone, serde::Serialize)]
struct ConnectionStatusEvent {
    connection_id: String,
    name: String,
    status: String,
}

struct TauriStatusEmitter {
    app_handle: AppHandle,
}

impl StatusEmitter for TauriStatusEmitter {
    fn emit_connection_status(&self, connection_id: &str, name: &str, status: &str) {
        let _ = self.app_handle.emit(
            "connection-status",
            ConnectionStatusEvent {
                connection_id: connection_id.to_string(),
                name: name.to_string(),
                status: status.to_string(),
            },
        );
    }
}

// --- Execute block command ---

/// Generic dispatch: route a `BlockRequest` to the executor registered
/// under `block_type`. Used by the legacy non-streamed path; streamed
/// HTTP/DB execution lives in `executions.rs`.
#[tauri::command]
async fn execute_block(
    registry: tauri::State<'_, httui_notes::executor::ExecutorRegistry>,
    block_type: String,
    params: serde_json::Value,
) -> Result<httui_notes::executor::BlockResult, String> {
    let req = httui_notes::executor::BlockRequest { block_type, params };
    registry.execute(req).await.map_err(|e| e.to_string())
}

/// Newtype wrapper letting the registry hold `DbExecutor` via `Arc` so the
/// same instance can also back the streamed/cancel-aware Tauri command.
struct SharedDbExecutor(Arc<httui_notes::executor::db::DbExecutor>);

#[async_trait::async_trait]
impl httui_notes::executor::Executor for SharedDbExecutor {
    fn block_type(&self) -> &str {
        self.0.block_type()
    }

    async fn validate(&self, params: &serde_json::Value) -> Result<(), String> {
        self.0.validate(params).await
    }

    async fn execute(
        &self,
        params: serde_json::Value,
    ) -> Result<httui_notes::executor::BlockResult, httui_notes::executor::ExecutorError> {
        self.0.execute(params).await
    }
}

/// Same pattern as `SharedDbExecutor` for the HTTP executor. The streamed
/// command lives in `executions.rs` and pulls the `Arc<HttpExecutor>` from
/// Tauri state; the legacy `execute_block` path continues through the
/// registry via this wrapper.
struct SharedHttpExecutor(Arc<httui_notes::executor::http::HttpExecutor>);

#[async_trait::async_trait]
impl httui_notes::executor::Executor for SharedHttpExecutor {
    fn block_type(&self) -> &str {
        self.0.block_type()
    }

    async fn validate(&self, params: &serde_json::Value) -> Result<(), String> {
        self.0.validate(params).await
    }

    async fn execute(
        &self,
        params: serde_json::Value,
    ) -> Result<httui_notes::executor::BlockResult, httui_notes::executor::ExecutorError> {
        self.0.execute(params).await
    }
}

// --- Block result cache commands ---

/// Look up a previously cached `BlockResult` by `(file_path, block_hash)`.
/// Returns `None` if no cached row matches.
#[tauri::command]
async fn get_block_result(
    pool: tauri::State<'_, SqlitePool>,
    file_path: String,
    block_hash: String,
) -> Result<Option<httui_notes::block_results::CachedBlockResult>, String> {
    httui_notes::block_results::get_block_result(&pool, &file_path, &block_hash)
        .await
        .map_err(|e| e.to_string())
}

/// Persist the terminal outcome of a block execution into the cache so
/// the next run with the same content + env context can short-circuit.
#[tauri::command]
async fn save_block_result(
    pool: tauri::State<'_, SqlitePool>,
    file_path: String,
    block_hash: String,
    status: String,
    response: String,
    elapsed_ms: i64,
    total_rows: Option<i64>,
) -> Result<(), String> {
    httui_notes::block_results::save_block_result(
        &pool,
        &file_path,
        &block_hash,
        &status,
        &response,
        elapsed_ms,
        total_rows,
    )
    .await
    .map_err(|e| e.to_string())
}

// --- Block run history (Story 24.6) ---

/// Return the trim-capped run history (metadata only — no bodies)
/// for `(file_path, block_alias)`.
#[tauri::command]
async fn list_block_history(
    pool: tauri::State<'_, SqlitePool>,
    file_path: String,
    block_alias: String,
) -> Result<Vec<httui_notes::block_history::HistoryEntry>, String> {
    httui_notes::block_history::list_history(&pool, &file_path, &block_alias)
        .await
        .map_err(|e| e.to_string())
}

/// Append a single run-history row; trim to the retention cap is
/// handled by the underlying `insert_history_entry`.
#[tauri::command]
async fn insert_block_history(
    pool: tauri::State<'_, SqlitePool>,
    entry: httui_notes::block_history::InsertEntry,
) -> Result<(), String> {
    httui_notes::block_history::insert_history_entry(&pool, entry)
        .await
        .map_err(|e| e.to_string())
}

/// Delete every run-history row for `(file_path, block_alias)`.
/// Returns the number of rows removed.
#[tauri::command]
async fn purge_block_history(
    pool: tauri::State<'_, SqlitePool>,
    file_path: String,
    block_alias: String,
) -> Result<u64, String> {
    httui_notes::block_history::purge_history(&pool, &file_path, &block_alias)
        .await
        .map_err(|e| e.to_string())
}

// --- Per-block settings (Onda 1) ---

/// Fetch persistent per-block settings (limit/timeout overrides) for
/// `(file_path, block_alias)`. Returns defaults if no row exists.
#[tauri::command]
async fn get_block_settings(
    pool: tauri::State<'_, SqlitePool>,
    file_path: String,
    block_alias: String,
) -> Result<httui_notes::block_settings::BlockSettings, String> {
    httui_notes::block_settings::get_settings(&pool, &file_path, &block_alias)
        .await
        .map_err(|e| e.to_string())
}

/// Insert or update the per-block settings row.
#[tauri::command]
async fn upsert_block_settings(
    pool: tauri::State<'_, SqlitePool>,
    file_path: String,
    block_alias: String,
    settings: httui_notes::block_settings::BlockSettings,
) -> Result<(), String> {
    httui_notes::block_settings::upsert_settings(&pool, &file_path, &block_alias, settings)
        .await
        .map_err(|e| e.to_string())
}

/// Delete per-block settings for `(file_path, block_alias)` — used when
/// the block is removed from the document.
#[tauri::command]
async fn purge_block_settings(
    pool: tauri::State<'_, SqlitePool>,
    file_path: String,
    block_alias: String,
) -> Result<u64, String> {
    httui_notes::block_settings::purge_settings(&pool, &file_path, &block_alias)
        .await
        .map_err(|e| e.to_string())
}

// --- Pinned response examples (Onda 3) ---

/// Pin a named response snapshot for a block so the user can revisit
/// it later without re-running.
#[tauri::command]
async fn save_block_example(
    pool: tauri::State<'_, SqlitePool>,
    file_path: String,
    block_alias: String,
    name: String,
    response_json: String,
) -> Result<i64, String> {
    httui_notes::block_examples::save_example(
        &pool,
        &file_path,
        &block_alias,
        &name,
        &response_json,
    )
    .await
    .map_err(|e| e.to_string())
}

/// List every pinned example for `(file_path, block_alias)`.
#[tauri::command]
async fn list_block_examples(
    pool: tauri::State<'_, SqlitePool>,
    file_path: String,
    block_alias: String,
) -> Result<Vec<httui_notes::block_examples::BlockExample>, String> {
    httui_notes::block_examples::list_examples(&pool, &file_path, &block_alias)
        .await
        .map_err(|e| e.to_string())
}

/// Delete a single pinned example by primary key.
#[tauri::command]
async fn delete_block_example(pool: tauri::State<'_, SqlitePool>, id: i64) -> Result<u64, String> {
    httui_notes::block_examples::delete_example(&pool, id)
        .await
        .map_err(|e| e.to_string())
}

/// Delete every pinned example for `(file_path, block_alias)`.
#[tauri::command]
async fn purge_block_examples(
    pool: tauri::State<'_, SqlitePool>,
    file_path: String,
    block_alias: String,
) -> Result<u64, String> {
    httui_notes::block_examples::purge_examples_for_block(&pool, &file_path, &block_alias)
        .await
        .map_err(|e| e.to_string())
}

/// T31/T35: Server-side hash computation including environment + connection context.
#[tauri::command]
async fn compute_block_hash(
    pool: tauri::State<'_, SqlitePool>,
    content: String,
    connection_id: Option<String>,
) -> Result<String, String> {
    let env_id = httui_notes::db::environments::get_active_environment_id(&pool).await;
    Ok(httui_notes::block_results::compute_block_hash(
        &content,
        env_id.as_deref(),
        connection_id.as_deref(),
    ))
}

// --- Schema introspection commands ---

/// Walk the target DB's metadata tables to discover schemas, tables and
/// columns. Caches the result in SQLite; falls through to fresh lookup
/// when the cached row is older than 5s.
#[tauri::command]
async fn introspect_schema(
    pool: tauri::State<'_, SqlitePool>,
    conn_manager: tauri::State<'_, Arc<PoolManager>>,
    connection_id: String,
) -> Result<Vec<httui_notes::db::schema_cache::SchemaEntry>, String> {
    // T24: Debounce — return cached schema if fresh (< 5s) to prevent hammering target DB
    if let Ok(Some(cached)) =
        httui_notes::db::schema_cache::get_cached_schema(&pool, &connection_id, 5).await
    {
        return Ok(cached);
    }
    httui_notes::db::schema_cache::introspect_schema(&conn_manager, &pool, &connection_id).await
}

/// Read-only access to the cached schema for `connection_id`. Returns
/// `None` if no cache hit younger than `ttl_seconds` (default 300s).
#[tauri::command]
async fn get_cached_schema(
    pool: tauri::State<'_, SqlitePool>,
    connection_id: String,
    ttl_seconds: Option<i64>,
) -> Result<Option<Vec<httui_notes::db::schema_cache::SchemaEntry>>, String> {
    httui_notes::db::schema_cache::get_cached_schema(
        &pool,
        &connection_id,
        ttl_seconds.unwrap_or(300),
    )
    .await
}

// --- Config commands ---

/// Read a single key from the `app_config` table.
#[tauri::command]
async fn get_config(
    pool: tauri::State<'_, SqlitePool>,
    key: String,
) -> Result<Option<String>, String> {
    httui_notes::config::get_config(&pool, &key)
        .await
        .map_err(|e| e.to_string())
}

/// Upsert a single key into the `app_config` table.
#[tauri::command]
async fn set_config(
    pool: tauri::State<'_, SqlitePool>,
    key: String,
    value: String,
) -> Result<(), String> {
    httui_notes::config::set_config(&pool, &key, &value)
        .await
        .map_err(|e| e.to_string())
}

// --- Filesystem commands ---

/// Walk `vault_path` and return the file tree, filtering out heavy
/// directories (`node_modules`, `target`, etc.) the editor never opens.
#[tauri::command]
fn list_workspace(vault_path: String) -> Result<Vec<httui_notes::fs::FileEntry>, String> {
    httui_notes::fs::list_workspace(&vault_path)
}

/// Read a markdown note from disk. `file_path` is resolved relative to
/// `vault_path`; resolved paths must stay inside the vault.
#[tauri::command]
fn read_note(vault_path: String, file_path: String) -> Result<String, String> {
    httui_notes::fs::read_note(&vault_path, &file_path)
}

/// Save markdown content to a vault-relative path. Adds the path to a
/// short-lived ignore list so the file watcher does not echo our own
/// write back to the frontend as an external change.
#[tauri::command]
fn write_note(
    vault_path: String,
    file_path: String,
    content: String,
    ignore_paths: tauri::State<'_, Arc<Mutex<Vec<String>>>>,
) -> Result<(), String> {
    // Add to ignore list so file watcher skips this event
    {
        let mut ignored = ignore_paths.lock().unwrap();
        if !ignored.contains(&file_path) {
            ignored.push(file_path.clone());
        }
    }

    let result = httui_notes::fs::write_note(&vault_path, &file_path, &content);

    // Remove from ignore list after a short delay
    let ignore = ignore_paths.inner().clone();
    let fp = file_path.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(500));
        let mut ignored = ignore.lock().unwrap();
        ignored.retain(|p| p != &fp);
    });

    result
}

/// Create an empty markdown note. Errors if the file already exists.
#[tauri::command]
fn create_note(vault_path: String, file_path: String) -> Result<(), String> {
    httui_notes::fs::create_note(&vault_path, &file_path)
}

/// Move a note to the OS trash (recoverable) and clear any related
/// per-block cache rows.
#[tauri::command]
async fn delete_note(
    vault_path: String,
    file_path: String,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<(), String> {
    // Move the file to trash first; only purge SQLite state if the FS
    // operation succeeded so we don't drop history/examples for a file
    // that's still on disk.
    httui_notes::fs::delete_note(&vault_path, &file_path)?;

    // Cascade purge across every per-block table (Onda 1-3). Each call is
    // best-effort — a failure here doesn't undo the trash operation.
    let absolute = format!("{vault_path}/{file_path}");
    for path_variant in [&file_path, &absolute] {
        let _ = httui_notes::block_history::purge_history_for_file(&pool, path_variant).await;
        let _ = httui_notes::block_settings::purge_settings_for_file(&pool, path_variant).await;
        let _ = httui_notes::block_examples::purge_examples_for_file(&pool, path_variant).await;
        let _ =
            httui_notes::block_results::delete_block_results_for_file(&pool, path_variant).await;
    }
    Ok(())
}

/// Rename / move a note within the vault. Errors if `new_path` already
/// exists or escapes the vault.
#[tauri::command]
fn rename_note(vault_path: String, old_path: String, new_path: String) -> Result<(), String> {
    httui_notes::fs::rename_note(&vault_path, &old_path, &new_path)
}

/// Create a folder under `vault_path`. Idempotent — succeeds if the
/// folder already exists.
#[tauri::command]
fn create_folder(vault_path: String, folder_path: String) -> Result<(), String> {
    httui_notes::fs::create_folder(&vault_path, &folder_path)
}

/// Re-read a file from disk and emit `file-reloaded` so the editor
/// replaces its in-memory copy. Used after MCP writes to defeat the
/// auto-save suppression window.
#[tauri::command]
fn force_reload_file(
    vault_path: String,
    file_path: String,
    app_handle: AppHandle,
) -> Result<(), String> {
    let markdown = httui_notes::fs::read_note(&vault_path, &file_path)?;
    app_handle
        .emit(
            "file-reloaded",
            httui_notes::fs::watcher::FileReloaded {
                path: file_path,
                markdown,
            },
        )
        .map_err(|e| e.to_string())
}

/// Start the `notify`-backed file watcher for `vault_path`. Subsequent
/// changes outside our own writes surface as `file-changed` events.
#[tauri::command]
fn start_watching(
    vault_path: String,
    app_handle: tauri::AppHandle,
    ignore_paths: tauri::State<'_, Arc<Mutex<Vec<String>>>>,
    watcher_state: tauri::State<'_, Mutex<Option<httui_notes::fs::watcher::VaultWatcher>>>,
) -> Result<(), String> {
    let watcher = httui_notes::fs::watcher::watch_vault(
        &vault_path,
        app_handle,
        ignore_paths.inner().clone(),
    )?;
    let mut state = watcher_state.lock().unwrap();
    *state = Some(watcher);
    Ok(())
}

/// Quick-open fuzzy file-name search across the vault. Backed by a
/// subsequence-scoring matcher in `httui-core::search`.
#[tauri::command]
fn search_files(
    vault_path: String,
    query: String,
) -> Result<Vec<httui_notes::search::SearchResult>, String> {
    httui_notes::search::search_files(&vault_path, &query)
}

/// Rebuild the SQLite FTS5 index for the vault. Called on first run
/// and when switching vaults.
#[tauri::command]
async fn rebuild_search_index(
    vault_path: String,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<(), String> {
    httui_notes::search::rebuild_search_index(&pool, &vault_path).await
}

/// Full-text search (Cmd+Shift+F) returning highlighted snippets from
/// the FTS5 index.
#[tauri::command]
async fn search_content(
    query: String,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Vec<httui_notes::search::ContentSearchResult>, String> {
    httui_notes::search::search_content(&pool, &query).await
}

/// Refresh a single FTS row (called on save) so search picks up edits
/// without rebuilding the whole index.
#[tauri::command]
async fn update_search_entry(
    file_path: String,
    content: String,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<(), String> {
    httui_notes::search::update_search_entry(&pool, &file_path, &content).await
}

/// Drop the active file watcher (e.g. on vault switch).
#[tauri::command]
fn stop_watching(
    watcher_state: tauri::State<'_, Mutex<Option<httui_notes::fs::watcher::VaultWatcher>>>,
) -> Result<(), String> {
    let mut state = watcher_state.lock().unwrap();
    *state = None;
    Ok(())
}

// --- Connection commands ---

/// List every saved DB connection with secrets stripped (only the
/// `__KEYCHAIN__` sentinel reaches the frontend).
#[tauri::command]
async fn list_connections(
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Vec<connections::ConnectionPublic>, String> {
    connections::list_connections_public(&pool).await
}

/// Insert a new connection row. Passwords are stored in the OS keychain
/// (sentinel in SQLite); fail-secure if the keychain is unavailable.
#[tauri::command]
async fn create_connection(
    pool: tauri::State<'_, SqlitePool>,
    input: connections::CreateConnection,
) -> Result<connections::ConnectionPublic, String> {
    let conn = connections::create_connection(&pool, input).await?;
    Ok(conn.to_public())
}

/// Update a connection row. Invalidates any cached pool managed by
/// `PoolManager` so the next execute re-handshakes.
#[tauri::command]
async fn update_connection(
    pool: tauri::State<'_, SqlitePool>,
    conn_manager: tauri::State<'_, Arc<PoolManager>>,
    id: String,
    input: connections::UpdateConnection,
) -> Result<connections::ConnectionPublic, String> {
    let result = connections::update_connection(&pool, &id, input).await?;
    conn_manager.invalidate(&id).await;
    Ok(result.to_public())
}

/// Delete a connection row, evict its pool, and remove the password
/// from the keychain.
#[tauri::command]
async fn delete_connection(
    pool: tauri::State<'_, SqlitePool>,
    conn_manager: tauri::State<'_, Arc<PoolManager>>,
    id: String,
) -> Result<(), String> {
    conn_manager.invalidate(&id).await;
    connections::delete_connection(&pool, &id).await
}

/// Validate that the connection's credentials and reachability are
/// good. Performs a lightweight query (e.g. `SELECT 1`) and returns
/// the underlying error verbatim on failure.
#[tauri::command]
async fn test_connection(
    conn_manager: tauri::State<'_, Arc<PoolManager>>,
    id: String,
) -> Result<(), String> {
    conn_manager.test_connection(&id).await
}

// Environment commands moved to `commands::environments` (Epic 19
// Story 02 Phase 2 — file-backed cutover; audit-015). Wire-compat is
// preserved (Environment.id == name; EnvVariable.id == "<env>::<key>").

// --- Internal DB query (audit/settings) ---

/// Run a SELECT against the app's own SQLite (audit/settings panel).
/// Multi-statements and writes are rejected; pagination via
/// `(offset, fetch_size)`.
#[tauri::command]
async fn query_internal_db(
    pool: tauri::State<'_, SqlitePool>,
    query: String,
    offset: u32,
    fetch_size: u32,
) -> Result<httui_notes::db::InternalQueryResult, String> {
    httui_notes::db::query_internal_db(&pool, &query, offset, fetch_size).await
}

// --- Session restore (single IPC call for startup) ---

#[derive(serde::Serialize)]
struct SessionTabContent {
    file_path: String,
    vault_path: String,
    content: Option<String>,
}

#[derive(serde::Serialize)]
struct SessionState {
    vaults: Vec<String>,
    active_vault: Option<String>,
    vim_enabled: bool,
    sidebar_open: bool,
    pane_layout: Option<String>,
    active_pane_id: Option<String>,
    active_file: Option<String>,
    scroll_positions: Option<String>,
    file_tree: Vec<httui_notes::fs::FileEntry>,
    tab_contents: Vec<SessionTabContent>,
}

// Extracts tab file paths from pane layout JSON
fn extract_tabs_from_layout(value: &serde_json::Value) -> Vec<(String, String)> {
    let mut tabs = Vec::new();
    if let Some(typ) = value.get("type").and_then(|t| t.as_str()) {
        if typ == "leaf" {
            if let Some(tab_arr) = value.get("tabs").and_then(|t| t.as_array()) {
                for tab in tab_arr {
                    if let (Some(fp), Some(vp)) = (
                        tab.get("filePath").and_then(|v| v.as_str()),
                        tab.get("vaultPath").and_then(|v| v.as_str()),
                    ) {
                        tabs.push((fp.to_string(), vp.to_string()));
                    }
                }
            }
        } else if typ == "split" {
            if let Some(children) = value.get("children").and_then(|c| c.as_array()) {
                for child in children {
                    tabs.extend(extract_tabs_from_layout(child));
                }
            }
        }
    }
    tabs
}

/// Single-shot startup IPC: load config keys, parse the pane layout,
/// list the workspace, and read every open tab's content concurrently.
/// Replaces ~10 chatty calls so the editor renders without flicker.
#[tauri::command]
async fn restore_session(pool: tauri::State<'_, SqlitePool>) -> Result<SessionState, String> {
    // Batch all config reads concurrently
    let (
        vaults_raw,
        vim_raw,
        sidebar_raw,
        active_vault,
        pane_layout,
        active_pane_id,
        active_file,
        scroll_positions,
    ) = tokio::join!(
        httui_notes::config::get_config(&pool, "vaults"),
        httui_notes::config::get_config(&pool, "vim_enabled"),
        httui_notes::config::get_config(&pool, "sidebar_open"),
        httui_notes::config::get_config(&pool, "active_vault"),
        httui_notes::config::get_config(&pool, "pane_layout"),
        httui_notes::config::get_config(&pool, "active_pane_id"),
        httui_notes::config::get_config(&pool, "active_file"),
        httui_notes::config::get_config(&pool, "scroll_positions"),
    );

    let vaults: Vec<String> = vaults_raw
        .ok()
        .flatten()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();

    let vim_enabled = vim_raw.ok().flatten().as_deref() == Some("true");
    let sidebar_open = sidebar_raw.ok().flatten().as_deref() != Some("false");
    let active_vault = active_vault.ok().flatten();
    let pane_layout = pane_layout.ok().flatten();
    let active_pane_id = active_pane_id.ok().flatten();
    let active_file = active_file.ok().flatten();
    let scroll_positions = scroll_positions.ok().flatten();

    // Extract tab file paths from saved layout (done in Rust, no extra roundtrip)
    let tab_files: Vec<(String, String)> = if let Some(ref layout_json) = pane_layout {
        serde_json::from_str::<serde_json::Value>(layout_json)
            .map(|v| extract_tabs_from_layout(&v))
            .unwrap_or_default()
    } else if let (Some(ref file), Some(ref vault)) = (&active_file, &active_vault) {
        vec![(file.clone(), vault.clone())]
    } else {
        vec![]
    };

    // Run list_workspace + read all tab files in parallel using blocking tasks
    let active_vault_clone = active_vault.clone();
    let tree_handle = tokio::task::spawn_blocking(move || {
        if let Some(ref vault) = active_vault_clone {
            httui_notes::fs::list_workspace(vault).unwrap_or_default()
        } else {
            vec![]
        }
    });

    let mut file_handles = Vec::new();
    for (file_path, vault_path) in tab_files {
        let fp = file_path.clone();
        let vp = vault_path.clone();
        file_handles.push(tokio::task::spawn_blocking(move || {
            let content = httui_notes::fs::read_note(&vp, &fp).ok();
            SessionTabContent {
                file_path: fp,
                vault_path: vp,
                content,
            }
        }));
    }

    let file_tree = tree_handle.await.unwrap_or_default();
    let mut tab_contents = Vec::new();
    for handle in file_handles {
        if let Ok(tab) = handle.await {
            tab_contents.push(tab);
        }
    }
    Ok(SessionState {
        vaults,
        active_vault,
        vim_enabled,
        sidebar_open,
        pane_layout,
        active_pane_id,
        active_file,
        scroll_positions,
        file_tree,
        tab_contents,
    })
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let app_data_dir =
                httui_core::paths::default_data_dir().expect("failed to resolve data dir");

            match httui_core::paths::migrate_legacy_data(&app_data_dir) {
                Ok(httui_core::paths::MigrationOutcome::Migrated { from }) => {
                    eprintln!(
                        "[migration] copied legacy data from {} to {}",
                        from.display(),
                        app_data_dir.display()
                    );
                }
                Ok(_) => {}
                Err(e) => eprintln!("[migration] failed: {e}"),
            }

            let pool = tauri::async_runtime::block_on(async {
                httui_notes::db::init_db(&app_data_dir)
                    .await
                    .expect("failed to initialize database")
            });

            app.manage(pool.clone());

            // Connection pool manager
            let emitter = Arc::new(TauriStatusEmitter {
                app_handle: app.handle().clone(),
            });
            let conn_manager = Arc::new(PoolManager::new_with_emitter(pool, emitter));
            app.manage(conn_manager.clone());

            // TTL cleanup + query log retention task
            let cm = conn_manager.clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(Duration::from_secs(60));
                let mut log_cleanup_counter: u32 = 0;
                loop {
                    interval.tick().await;
                    cm.cleanup_expired().await;
                    // Clean query_log every ~30 min (30 ticks of 60s)
                    log_cleanup_counter += 1;
                    if log_cleanup_counter >= 30 {
                        log_cleanup_counter = 0;
                        cm.cleanup_query_log().await;
                    }
                }
            });

            // Executor registry. DbExecutor is held as Arc<…> so the
            // cancel-aware streamed command (see src/executions.rs) can
            // share a single instance with the legacy `execute_block`.
            let db_executor = Arc::new(httui_notes::executor::db::DbExecutor::new(conn_manager));
            app.manage(db_executor.clone());
            app.manage(httui_notes::executions::ExecutionRegistry::new());

            // HTTP executor is held as Arc<…> so the cancel-aware streamed
            // command can share a single instance with the legacy `execute_block`.
            let http_executor = Arc::new(httui_notes::executor::http::HttpExecutor::new());
            app.manage(http_executor.clone());

            let mut executor_registry = httui_notes::executor::ExecutorRegistry::new();
            executor_registry.register(Box::new(SharedHttpExecutor(http_executor)));
            executor_registry.register(Box::new(SharedDbExecutor(db_executor)));
            app.manage(executor_registry);

            // Chat sidecar (lazy — spawned on first use, not at startup)
            app.manage(std::sync::Arc::new(tokio::sync::Mutex::new(
                None::<httui_notes::chat::sidecar::SidecarManager>,
            )));

            // Permission broker
            let pool_for_broker: SqlitePool = app.state::<SqlitePool>().inner().clone();
            app.manage(Arc::new(
                httui_notes::chat::permissions::PermissionBroker::new(pool_for_broker),
            ));

            app.manage(Arc::new(Mutex::new(Vec::<String>::new()))); // ignore_paths
            app.manage(Mutex::new(None::<httui_notes::fs::watcher::VaultWatcher>));

            // Per-vault file-backed store registry (Epic 19 cutover —
            // audit-015). Resolves ConnectionsStore + EnvironmentsStore
            // for the active vault on demand, caches per vault path.
            app.manage(httui_notes::commands::vault_stores::VaultStoreRegistry::new());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            execute_block,
            httui_notes::executions::execute_db_streamed,
            httui_notes::executions::execute_http_streamed,
            httui_notes::executions::cancel_block,
            list_block_history,
            insert_block_history,
            purge_block_history,
            get_block_settings,
            upsert_block_settings,
            purge_block_settings,
            save_block_example,
            list_block_examples,
            delete_block_example,
            purge_block_examples,
            get_block_result,
            save_block_result,
            compute_block_hash,
            get_config,
            set_config,
            // Epic 09 foundation — file-backed workspace + user config.
            // Frontend cutover lands in epic 19 (settings split).
            httui_notes::vault_config_commands::get_workspace_config,
            httui_notes::vault_config_commands::set_workspace_config,
            httui_notes::vault_config_commands::get_user_config,
            httui_notes::vault_config_commands::set_user_config,
            // Epic 10 — local override gitignore scaffolding.
            httui_notes::vault_config_commands::ensure_vault_gitignore,
            // Epic 12 — vault migration script.
            httui_notes::vault_config_commands::migrate_vault_to_v1,
            // Epic 17 — vault scaffold + validate.
            httui_notes::vault_config_commands::check_is_vault,
            httui_notes::vault_config_commands::scaffold_vault,
            // Epic 18 — first-run missing-secrets scan.
            httui_notes::vault_config_commands::list_missing_secrets,
            // Epic 20 — git panel.
            httui_notes::git_commands::git_status_cmd,
            httui_notes::git_commands::git_log_cmd,
            httui_notes::git_commands::git_diff_cmd,
            httui_notes::git_commands::git_branch_list_cmd,
            restore_session,
            list_workspace,
            read_note,
            write_note,
            create_note,
            delete_note,
            rename_note,
            create_folder,
            start_watching,
            stop_watching,
            search_files,
            rebuild_search_index,
            search_content,
            update_search_entry,
            list_connections,
            create_connection,
            update_connection,
            delete_connection,
            test_connection,
            introspect_schema,
            get_cached_schema,
            httui_notes::commands::environments::list_environments,
            httui_notes::commands::environments::create_environment,
            httui_notes::commands::environments::delete_environment,
            httui_notes::commands::environments::duplicate_environment,
            httui_notes::commands::environments::set_active_environment,
            httui_notes::commands::environments::list_env_variables,
            httui_notes::commands::environments::set_env_variable,
            httui_notes::commands::environments::delete_env_variable,
            // Chat
            create_chat_session,
            list_chat_sessions,
            get_chat_session,
            archive_chat_session,
            list_chat_messages,
            send_chat_message,
            abort_chat,
            respond_chat_permission,
            save_attachment_tmp,
            clear_session_claude_id,
            update_chat_session_cwd,
            delete_messages_after,
            list_tool_permissions,
            delete_tool_permission,
            get_usage_stats,
            force_reload_file,
            query_internal_db,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let app = window.app_handle().clone();
                let sidecar_state = app.state::<std::sync::Arc<
                    tokio::sync::Mutex<Option<httui_notes::chat::sidecar::SidecarManager>>,
                >>();
                let sidecar = sidecar_state.inner().clone();
                tauri::async_runtime::spawn(async move {
                    let guard = sidecar.lock().await;
                    if let Some(mgr) = guard.as_ref() {
                        mgr.shutdown().await;
                    }
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
