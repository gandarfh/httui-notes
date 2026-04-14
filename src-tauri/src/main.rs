// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use sqlx::sqlite::SqlitePool;
use std::sync::{Arc, Mutex};
use tauri::Manager;

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

            app.manage(pool);
            app.manage(Arc::new(Mutex::new(Vec::<String>::new()))); // ignore_paths
            app.manage(Mutex::new(
                None::<httui_notes::fs::watcher::VaultWatcher>,
            ));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            set_config,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
