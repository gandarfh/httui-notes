// coverage:exclude file — Tauri command shells delegating to
// `httui_core::db::schema_cache`. Same shape and rationale as
// `commands/{connections,environments,files}.rs` (audit-016 / 018).
// Substantive logic + pure cache-eviction tests live in
// `httui_core::db::schema_cache`.

//! Schema introspection Tauri commands — wrap the cached
//! introspection helpers from `httui_core::db::schema_cache`. The
//! `introspect_schema` command also keeps a 5-second freshness
//! guard so the UI can call it idempotently without hammering the
//! target database (T24).

use std::sync::Arc;

use sqlx::sqlite::SqlitePool;
use tauri::State;

use httui_core::db::connections::PoolManager;
use httui_core::db::schema_cache::{self, SchemaEntry};

#[tauri::command]
pub async fn introspect_schema(
    pool: State<'_, SqlitePool>,
    conn_manager: State<'_, Arc<PoolManager>>,
    connection_id: String,
) -> Result<Vec<SchemaEntry>, String> {
    // T24: Debounce — return cached schema if fresh (< 5s) to
    // prevent hammering target DB on rapid UI calls.
    if let Ok(Some(cached)) = schema_cache::get_cached_schema(&pool, &connection_id, 5).await {
        return Ok(cached);
    }
    schema_cache::introspect_schema(&conn_manager, &pool, &connection_id).await
}

/// Read-only access to the cached schema for `connection_id`. Returns
/// `None` if no cache hit younger than `ttl_seconds` (default 300s).
#[tauri::command]
pub async fn get_cached_schema(
    pool: State<'_, SqlitePool>,
    connection_id: String,
    ttl_seconds: Option<i64>,
) -> Result<Option<Vec<SchemaEntry>>, String> {
    schema_cache::get_cached_schema(&pool, &connection_id, ttl_seconds.unwrap_or(300)).await
}
