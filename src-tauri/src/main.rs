// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use sqlx::sqlite::SqlitePool;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Manager;

use httui_notes::db::connections::{self, PoolManager};

// --- Execute block command ---

#[tauri::command]
async fn execute_block(
    registry: tauri::State<'_, httui_notes::executor::ExecutorRegistry>,
    block_type: String,
    params: serde_json::Value,
) -> Result<httui_notes::executor::BlockResult, String> {
    let req = httui_notes::executor::BlockRequest {
        block_type,
        params,
    };
    registry
        .execute(req)
        .await
        .map_err(|e| e.to_string())
}

// --- Block result cache commands ---

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

// --- Schema introspection commands ---

#[tauri::command]
async fn introspect_schema(
    pool: tauri::State<'_, SqlitePool>,
    conn_manager: tauri::State<'_, Arc<PoolManager>>,
    connection_id: String,
) -> Result<Vec<httui_notes::db::schema_cache::SchemaEntry>, String> {
    httui_notes::db::schema_cache::introspect_schema(&conn_manager, &pool, &connection_id).await
}

#[tauri::command]
async fn get_cached_schema(
    pool: tauri::State<'_, SqlitePool>,
    connection_id: String,
    ttl_seconds: Option<i64>,
) -> Result<Option<Vec<httui_notes::db::schema_cache::SchemaEntry>>, String> {
    httui_notes::db::schema_cache::get_cached_schema(&pool, &connection_id, ttl_seconds.unwrap_or(300)).await
}

// --- Config commands ---

#[tauri::command]
async fn get_config(
    pool: tauri::State<'_, SqlitePool>,
    key: String,
) -> Result<Option<String>, String> {
    httui_notes::config::get_config(&pool, &key)
        .await
        .map_err(|e| e.to_string())
}

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

#[tauri::command]
fn list_workspace(vault_path: String) -> Result<Vec<httui_notes::fs::FileEntry>, String> {
    httui_notes::fs::list_workspace(&vault_path)
}

#[tauri::command]
fn read_note(vault_path: String, file_path: String) -> Result<String, String> {
    httui_notes::fs::read_note(&vault_path, &file_path)
}

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

#[tauri::command]
fn create_note(vault_path: String, file_path: String) -> Result<(), String> {
    httui_notes::fs::create_note(&vault_path, &file_path)
}

#[tauri::command]
fn delete_note(vault_path: String, file_path: String) -> Result<(), String> {
    httui_notes::fs::delete_note(&vault_path, &file_path)
}

#[tauri::command]
fn rename_note(
    vault_path: String,
    old_path: String,
    new_path: String,
) -> Result<(), String> {
    httui_notes::fs::rename_note(&vault_path, &old_path, &new_path)
}

#[tauri::command]
fn create_folder(vault_path: String, folder_path: String) -> Result<(), String> {
    httui_notes::fs::create_folder(&vault_path, &folder_path)
}

#[tauri::command]
fn start_watching(
    vault_path: String,
    app_handle: tauri::AppHandle,
    ignore_paths: tauri::State<'_, Arc<Mutex<Vec<String>>>>,
    watcher_state: tauri::State<'_, Mutex<Option<httui_notes::fs::watcher::VaultWatcher>>>,
) -> Result<(), String> {
    let watcher =
        httui_notes::fs::watcher::watch_vault(&vault_path, app_handle, ignore_paths.inner().clone())?;
    let mut state = watcher_state.lock().unwrap();
    *state = Some(watcher);
    Ok(())
}

#[tauri::command]
fn search_files(
    vault_path: String,
    query: String,
) -> Result<Vec<httui_notes::search::SearchResult>, String> {
    httui_notes::search::search_files(&vault_path, &query)
}

#[tauri::command]
async fn rebuild_search_index(
    vault_path: String,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<(), String> {
    httui_notes::search::rebuild_search_index(&pool, &vault_path).await
}

#[tauri::command]
async fn search_content(
    query: String,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Vec<httui_notes::search::ContentSearchResult>, String> {
    httui_notes::search::search_content(&pool, &query).await
}

#[tauri::command]
async fn update_search_entry(
    file_path: String,
    content: String,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<(), String> {
    httui_notes::search::update_search_entry(&pool, &file_path, &content).await
}

#[tauri::command]
fn stop_watching(
    watcher_state: tauri::State<'_, Mutex<Option<httui_notes::fs::watcher::VaultWatcher>>>,
) -> Result<(), String> {
    let mut state = watcher_state.lock().unwrap();
    *state = None;
    Ok(())
}

// --- Connection commands ---

#[tauri::command]
async fn list_connections(
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Vec<connections::Connection>, String> {
    connections::list_connections(&pool).await
}

#[tauri::command]
async fn create_connection(
    pool: tauri::State<'_, SqlitePool>,
    input: connections::CreateConnection,
) -> Result<connections::Connection, String> {
    connections::create_connection(&pool, input).await
}

#[tauri::command]
async fn update_connection(
    pool: tauri::State<'_, SqlitePool>,
    conn_manager: tauri::State<'_, Arc<PoolManager>>,
    id: String,
    input: connections::UpdateConnection,
) -> Result<connections::Connection, String> {
    let result = connections::update_connection(&pool, &id, input).await?;
    conn_manager.invalidate(&id).await;
    Ok(result)
}

#[tauri::command]
async fn delete_connection(
    pool: tauri::State<'_, SqlitePool>,
    conn_manager: tauri::State<'_, Arc<PoolManager>>,
    id: String,
) -> Result<(), String> {
    conn_manager.invalidate(&id).await;
    connections::delete_connection(&pool, &id).await
}

#[tauri::command]
async fn test_connection(
    conn_manager: tauri::State<'_, Arc<PoolManager>>,
    id: String,
) -> Result<(), String> {
    conn_manager.test_connection(&id).await
}

// --- Environment commands ---

#[tauri::command]
async fn list_environments(
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Vec<httui_notes::db::environments::Environment>, String> {
    httui_notes::db::environments::list_environments(&pool).await
}

#[tauri::command]
async fn create_environment(
    pool: tauri::State<'_, SqlitePool>,
    name: String,
) -> Result<httui_notes::db::environments::Environment, String> {
    httui_notes::db::environments::create_environment(&pool, name).await
}

#[tauri::command]
async fn delete_environment(
    pool: tauri::State<'_, SqlitePool>,
    id: String,
) -> Result<(), String> {
    httui_notes::db::environments::delete_environment(&pool, &id).await
}

#[tauri::command]
async fn duplicate_environment(
    pool: tauri::State<'_, SqlitePool>,
    source_id: String,
    new_name: String,
) -> Result<httui_notes::db::environments::Environment, String> {
    httui_notes::db::environments::duplicate_environment(&pool, &source_id, new_name).await
}

#[tauri::command]
async fn set_active_environment(
    pool: tauri::State<'_, SqlitePool>,
    id: Option<String>,
) -> Result<(), String> {
    httui_notes::db::environments::set_active_environment(&pool, id.as_deref()).await
}

#[tauri::command]
async fn list_env_variables(
    pool: tauri::State<'_, SqlitePool>,
    environment_id: String,
) -> Result<Vec<httui_notes::db::environments::EnvVariable>, String> {
    httui_notes::db::environments::list_env_variables(&pool, &environment_id).await
}

#[tauri::command]
async fn set_env_variable(
    pool: tauri::State<'_, SqlitePool>,
    environment_id: String,
    key: String,
    value: String,
) -> Result<httui_notes::db::environments::EnvVariable, String> {
    httui_notes::db::environments::set_env_variable(&pool, &environment_id, key, value).await
}

#[tauri::command]
async fn delete_env_variable(
    pool: tauri::State<'_, SqlitePool>,
    id: String,
) -> Result<(), String> {
    httui_notes::db::environments::delete_env_variable(&pool, &id).await
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
    pane_layout: Option<String>,
    active_pane_id: Option<String>,
    active_file: Option<String>,
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

#[tauri::command]
async fn restore_session(
    pool: tauri::State<'_, SqlitePool>,
) -> Result<SessionState, String> {
    // Batch all config reads concurrently
    let (vaults_raw, vim_raw, active_vault, pane_layout, active_pane_id, active_file) = tokio::join!(
        httui_notes::config::get_config(&pool, "vaults"),
        httui_notes::config::get_config(&pool, "vim_enabled"),
        httui_notes::config::get_config(&pool, "active_vault"),
        httui_notes::config::get_config(&pool, "pane_layout"),
        httui_notes::config::get_config(&pool, "active_pane_id"),
        httui_notes::config::get_config(&pool, "active_file"),
    );

    let vaults: Vec<String> = vaults_raw
        .ok()
        .flatten()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();

    let vim_enabled = vim_raw.ok().flatten().as_deref() == Some("true");
    let active_vault = active_vault.ok().flatten();
    let pane_layout = pane_layout.ok().flatten();
    let active_pane_id = active_pane_id.ok().flatten();
    let active_file = active_file.ok().flatten();

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
        pane_layout,
        active_pane_id,
        active_file,
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
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");

            let pool = tauri::async_runtime::block_on(async {
                httui_notes::db::init_db(&app_data_dir)
                    .await
                    .expect("failed to initialize database")
            });

            app.manage(pool.clone());

            // Connection pool manager
            let conn_manager = Arc::new(PoolManager::new(pool));
            app.manage(conn_manager.clone());

            // TTL cleanup task
            let cm = conn_manager.clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(Duration::from_secs(60));
                loop {
                    interval.tick().await;
                    cm.cleanup_expired().await;
                }
            });

            // Executor registry
            let mut executor_registry = httui_notes::executor::ExecutorRegistry::new();
            executor_registry.register(Box::new(
                httui_notes::executor::http::HttpExecutor::new(),
            ));
            executor_registry.register(Box::new(
                httui_notes::executor::db::DbExecutor::new(conn_manager),
            ));
            app.manage(executor_registry);

            app.manage(Arc::new(Mutex::new(Vec::<String>::new()))); // ignore_paths
            app.manage(Mutex::new(
                None::<httui_notes::fs::watcher::VaultWatcher>,
            ));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            execute_block,
            get_block_result,
            save_block_result,
            get_config,
            set_config,
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
            list_environments,
            create_environment,
            delete_environment,
            duplicate_environment,
            set_active_environment,
            list_env_variables,
            set_env_variable,
            delete_env_variable,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
