use serde_json::json;
use sqlx::sqlite::SqlitePool;

pub fn list_notes(vault_path: &str, subpath: Option<&str>) -> String {
    let target = if let Some(sub) = subpath {
        format!("{}/{}", vault_path.trim_end_matches('/'), sub)
    } else {
        vault_path.to_string()
    };

    match httui_core::fs::list_workspace(&target) {
        Ok(entries) => json!({"entries": entries}).to_string(),
        Err(e) => json!({"error": e}).to_string(),
    }
}

pub fn read_note(vault_path: &str, file_path: &str) -> String {
    match httui_core::fs::read_note(vault_path, file_path) {
        Ok(content) => json!({"content": content}).to_string(),
        Err(e) => json!({"error": e}).to_string(),
    }
}

pub fn create_note(vault_path: &str, file_path: &str, content: &str) -> String {
    if let Err(e) = httui_core::fs::create_note(vault_path, file_path) {
        return json!({"error": e}).to_string();
    }
    match httui_core::fs::write_note(vault_path, file_path, content) {
        Ok(()) => json!({"created": file_path}).to_string(),
        Err(e) => json!({"error": e}).to_string(),
    }
}

pub fn update_note(vault_path: &str, file_path: &str, content: &str) -> String {
    match httui_core::fs::write_note(vault_path, file_path, content) {
        Ok(()) => json!({"updated": file_path}).to_string(),
        Err(e) => json!({"error": e}).to_string(),
    }
}

pub async fn search_notes(pool: &SqlitePool, query: &str) -> String {
    match httui_core::search::search_content(pool, query).await {
        Ok(results) => json!({"results": results}).to_string(),
        Err(e) => json!({"error": e}).to_string(),
    }
}
