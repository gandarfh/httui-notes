// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use sqlx::sqlite::SqlitePool;
use tauri::Manager;

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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_config, set_config])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
