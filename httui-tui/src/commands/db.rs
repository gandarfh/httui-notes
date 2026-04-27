//! DB block domain commands and helpers.
//!
//! Pulled out of `vim::dispatch` so the vim layer stops growing
//! database-specific logic. Today this module owns:
//! - SQL query classification helpers (`is_cacheable_query`,
//!   `is_writing_query`, `is_unscoped_destructive`)
//! - Cache key derivation (`compute_db_cache_hash`) and async save
//! - The on-screen status formatter for cached results
//!   (`db_summary_from_value`)
//! - Connection slug → UUID resolver (`resolve_connection_id_sync`)
//! - The `:explain` entry point (`run_explain`)
//!
//! What's *not* yet here: the main `apply_run_block` flow + the
//! event-loop result handler. Those touch a lot of vim state and
//! are interleaved with the dispatch's other apply_* fns; they'll
//! migrate in a follow-up. New code should still prefer this
//! module — adding more DB stuff to dispatch makes the eventual
//! migration noisier.

use crate::app::{App, StatusKind};
use crate::buffer::{Cursor, Segment};

/// Strip leading whitespace + line / block comments so query
/// classifiers see the first *real* statement word. Shared between
/// `is_cacheable_query`, `is_writing_query`, and `is_unscoped_destructive`.
pub fn strip_leading_sql_comments(query: &str) -> &str {
    let mut s = query.trim_start();
    loop {
        if let Some(rest) = s.strip_prefix("--") {
            s = match rest.find('\n') {
                Some(idx) => rest[idx + 1..].trim_start(),
                None => "",
            };
        } else if let Some(rest) = s.strip_prefix("/*") {
            s = match rest.find("*/") {
                Some(idx) => rest[idx + 2..].trim_start(),
                None => "",
            };
        } else {
            break;
        }
    }
    s
}

/// Decide whether a query is safe to serve from cache. Read-only
/// statements (SELECT/EXPLAIN/WITH/SHOW/PRAGMA/DESC) cache; anything
/// else (UPDATE/DELETE/INSERT/DDL) bypasses the cache and always
/// re-executes — matching desktop semantics.
pub fn is_cacheable_query(query: &str) -> bool {
    let s = strip_leading_sql_comments(query);
    let first_word: String =
        s.chars().take_while(|c| c.is_ascii_alphabetic()).collect();
    matches!(
        first_word.to_ascii_uppercase().as_str(),
        "SELECT" | "WITH" | "EXPLAIN" | "SHOW" | "PRAGMA" | "DESC" | "DESCRIBE"
    )
}

/// Whether the query writes to the database. The read-only gate
/// uses this to decide if a query against an `is_readonly`
/// connection should be blocked. Strict list — anything not
/// recognized as a write counts as a read (safer default for the
/// gate: we'd rather let a weird read through than block one).
pub fn is_writing_query(query: &str) -> bool {
    let s = strip_leading_sql_comments(query);
    let first_word: String =
        s.chars().take_while(|c| c.is_ascii_alphabetic()).collect();
    matches!(
        first_word.to_ascii_uppercase().as_str(),
        "UPDATE"
            | "DELETE"
            | "INSERT"
            | "REPLACE"
            | "MERGE"
            | "CREATE"
            | "DROP"
            | "ALTER"
            | "TRUNCATE"
            | "GRANT"
            | "REVOKE"
            | "VACUUM"
    )
}

/// Whether the query is an `UPDATE` or `DELETE` *without* a `WHERE`
/// clause — the kind of slip that nukes an entire table. Used by
/// the confirm gate.
pub fn is_unscoped_destructive(query: &str) -> bool {
    let s = strip_leading_sql_comments(query);
    let first_word: String =
        s.chars().take_while(|c| c.is_ascii_alphabetic()).collect();
    let kind = first_word.to_ascii_uppercase();
    if kind != "UPDATE" && kind != "DELETE" {
        return false;
    }
    let stmt_end = s.find(';').unwrap_or(s.len());
    let stmt = &s[..stmt_end];
    let upper = stmt.to_ascii_uppercase();
    let mut start = 0;
    while let Some(pos) = upper[start..].find("WHERE") {
        let abs = start + pos;
        let before_ok = abs == 0
            || !upper.as_bytes()[abs - 1].is_ascii_alphanumeric()
                && upper.as_bytes()[abs - 1] != b'_';
        let after = abs + 5;
        let after_ok = after >= upper.len()
            || (!upper.as_bytes()[after].is_ascii_alphanumeric()
                && upper.as_bytes()[after] != b'_');
        if before_ok && after_ok {
            return false;
        }
        start = abs + 5;
    }
    true
}

/// Build the cache hash for a DB block run. Mirrors desktop's
/// `computeDbCacheHash`: hash text is the raw SQL body plus, when
/// any env vars are referenced via `{{KEY}}`, a sorted `KEY=VALUE`
/// snapshot of just those vars. Connection id goes in as a separate
/// hash input so the same query against two connections can't
/// collide. Stays in lockstep with the desktop so both apps' caches
/// share entries when querying the same vault.
pub fn compute_db_cache_hash(
    body: &str,
    conn_id: Option<&str>,
    env_vars: &std::collections::HashMap<String, String>,
) -> String {
    let mut used: Vec<(&String, &String)> = env_vars
        .iter()
        .filter(|(k, _)| body.contains(&format!("{{{{{k}}}}}")))
        .collect();
    used.sort_by(|a, b| a.0.cmp(b.0));
    let env_block: String = used
        .iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("\n");
    let keyed = if env_block.is_empty() {
        body.to_string()
    } else {
        format!("{body}\n__ENV__\n{env_block}")
    };
    httui_core::block_results::compute_block_hash(&keyed, None, conn_id)
}

/// Format the same one-liner `db_summary` produces in the renderer
/// — but driven by an arbitrary `Value` (the deserialized cache
/// row) rather than a `BlockNode`. Used to paint the `⛁ cached · …`
/// status when a cache hit short-circuits the run. Errors with
/// position get an ` at L:C` suffix matching `summarize_db_response`.
pub fn db_summary_from_value(
    value: Option<&serde_json::Value>,
    elapsed: u64,
) -> String {
    let Some(v) = value else { return format!("ok · {elapsed}ms") };
    let results = v.get("results").and_then(|r| r.as_array());
    let extras = match results.map(|r| r.len()).unwrap_or(0) {
        0 | 1 => String::new(),
        n => format!(" (+{} more)", n - 1),
    };
    let first = results.and_then(|r| r.first());
    let kind = first.and_then(|f| f.get("kind")).and_then(|k| k.as_str());
    match kind {
        Some("select") => {
            let rows = first
                .and_then(|f| f.get("rows"))
                .and_then(|r| r.as_array())
                .map(|r| r.len())
                .unwrap_or(0);
            let has_more = first
                .and_then(|f| f.get("has_more"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let suffix = if has_more { "+" } else { "" };
            format!("{rows}{suffix} rows · {elapsed}ms{extras}")
        }
        Some("mutation") => {
            let affected = first
                .and_then(|f| f.get("rows_affected"))
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            format!("{affected} affected · {elapsed}ms{extras}")
        }
        Some("error") => first
            .and_then(|f| f.get("message"))
            .and_then(|v| v.as_str())
            .map(|m| {
                let pos = first
                    .and_then(|f| f.get("line"))
                    .and_then(|l| l.as_u64())
                    .map(|line| {
                        let col = first
                            .and_then(|f| f.get("column"))
                            .and_then(|c| c.as_u64())
                            .unwrap_or(1);
                        format!(" at {line}:{col}")
                    })
                    .unwrap_or_default();
                format!("error: {m}{pos}{extras}")
            })
            .unwrap_or_else(|| format!("error · {elapsed}ms")),
        _ => format!("ok · {elapsed}ms{extras}"),
    }
}

/// Fire-and-forget save to the on-disk cache. Spawned because the
/// SQLite write would otherwise block the dispatcher; failure is
/// logged but never surfaces to the user (cache writes are
/// best-effort, matching the desktop). Pulls `total_rows` from the
/// first SELECT result so the cached row matches desktop's shape.
pub fn save_db_cache_async(
    pool: sqlx::SqlitePool,
    file_path: String,
    hash: String,
    value: serde_json::Value,
    elapsed_ms: u64,
    results: &[httui_core::executor::db::types::DbResult],
) {
    use httui_core::executor::db::types::DbResult;
    let total_rows: Option<i64> = results.first().and_then(|r| match r {
        DbResult::Select { rows, .. } => Some(rows.len() as i64),
        _ => None,
    });
    let response_str = match serde_json::to_string(&value) {
        Ok(s) => s,
        Err(_) => return,
    };
    tokio::spawn(async move {
        let _ = httui_core::block_results::save_block_result(
            &pool,
            &file_path,
            &hash,
            "success",
            &response_str,
            elapsed_ms as i64,
            total_rows,
        )
        .await;
    });
}

/// Resolve a fence's `connection=` value (UUID or slug) to the
/// canonical UUID using the in-memory `connection_names` map. The
/// async `resolve_connection_id` (used by the executor) hits the
/// SQLite pool and we can't await on every keystroke; the names map
/// is loaded at startup and refreshed after CRUD, so a sync scan
/// is enough for popup-time lookups.
///
/// Returns the input verbatim when neither a key nor a value
/// matches — that way an unknown id still flows through and
/// `schema_cache.get(...)` simply yields `None`.
pub fn resolve_connection_id_sync(
    raw: &str,
    names: &std::collections::HashMap<String, String>,
) -> String {
    if names.contains_key(raw) {
        return raw.to_string();
    }
    for (id, name) in names {
        if name.eq_ignore_ascii_case(raw) {
            return id.clone();
        }
    }
    raw.to_string()
}

/// `:explain` — wrap the focused DB block's query in the dialect's
/// EXPLAIN keyword and run it. The block's own query text stays
/// untouched (override flows only to the executor); the explain
/// output lands in the block's `cached_result` like any other run.
/// The actual spawn lives in `vim::dispatch::run_db_block_inner`
/// for now (still tied to a lot of vim state); migrating that here
/// is the next refactor step.
pub fn run_explain(app: &mut App) {
    let Some(doc) = app.document() else { return };
    let segment_idx = match doc.cursor() {
        Cursor::InBlock { segment_idx, .. } => segment_idx,
        Cursor::InBlockResult { segment_idx, .. } => segment_idx,
        _ => {
            app.set_status(
                StatusKind::Info,
                "place the cursor on a DB block first",
            );
            return;
        }
    };
    let block = match doc.segments().get(segment_idx) {
        Some(Segment::Block(b)) => b.clone(),
        _ => return,
    };
    if !block.is_db() {
        app.set_status(StatusKind::Info, "not a DB block");
        return;
    }
    let raw = block
        .params
        .get("query")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let dialect = crate::sql_completion::Dialect::from_block(&block);
    let wrapped = crate::sql_completion::explain_wrap(raw, dialect);
    crate::vim::dispatch::run_db_block_inner_for_explain(
        app,
        segment_idx,
        wrapped,
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env_map(pairs: &[(&str, &str)]) -> std::collections::HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn cacheable_query_recognizes_select_family() {
        for q in &[
            "SELECT 1",
            "select 1",
            "  SELECT * FROM foo",
            "WITH x AS (...) SELECT 1",
            "EXPLAIN SELECT 1",
            "PRAGMA table_info('users')",
            "SHOW TABLES",
            "DESC users",
        ] {
            assert!(is_cacheable_query(q), "expected cacheable: {q}");
        }
    }

    #[test]
    fn cacheable_query_rejects_mutations() {
        for q in &[
            "UPDATE users SET x = 1",
            "DELETE FROM users",
            "INSERT INTO users VALUES (1)",
            "DROP TABLE x",
        ] {
            assert!(!is_cacheable_query(q), "expected mutation: {q}");
        }
    }

    #[test]
    fn writing_query_recognizes_mutations() {
        for q in &[
            "UPDATE users SET x=1",
            "DELETE FROM users",
            "INSERT INTO t VALUES (1)",
            "TRUNCATE TABLE x",
        ] {
            assert!(is_writing_query(q), "expected write: {q}");
        }
    }

    #[test]
    fn writing_query_rejects_reads() {
        for q in &["SELECT 1", "EXPLAIN SELECT 1", "SHOW TABLES"] {
            assert!(!is_writing_query(q), "should not be write: {q}");
        }
    }

    #[test]
    fn unscoped_destructive_flags_update_without_where() {
        assert!(is_unscoped_destructive("UPDATE users SET x = 1"));
        assert!(is_unscoped_destructive("DELETE FROM users"));
    }

    #[test]
    fn unscoped_destructive_passes_when_where_present() {
        assert!(!is_unscoped_destructive("UPDATE users SET x = 1 WHERE id = 7"));
        assert!(!is_unscoped_destructive("DELETE FROM users WHERE active = 0"));
    }

    #[test]
    fn unscoped_destructive_is_word_boundary_aware() {
        assert!(is_unscoped_destructive(
            "UPDATE users SET whereabouts = 'home'"
        ));
    }

    #[test]
    fn cache_hash_is_deterministic_for_same_inputs() {
        let env = env_map(&[("TOKEN", "abc")]);
        let h1 = compute_db_cache_hash(
            "SELECT 1 WHERE x = {{TOKEN}}",
            Some("conn-1"),
            &env,
        );
        let h2 = compute_db_cache_hash(
            "SELECT 1 WHERE x = {{TOKEN}}",
            Some("conn-1"),
            &env,
        );
        assert_eq!(h1, h2);
    }

    #[test]
    fn cache_hash_changes_when_referenced_env_value_changes() {
        let body = "SELECT 1 WHERE x = {{TOKEN}}";
        let h_old = compute_db_cache_hash(
            body,
            Some("conn-1"),
            &env_map(&[("TOKEN", "old")]),
        );
        let h_new = compute_db_cache_hash(
            body,
            Some("conn-1"),
            &env_map(&[("TOKEN", "new")]),
        );
        assert_ne!(h_old, h_new);
    }

    #[test]
    fn cache_hash_ignores_unreferenced_env_vars() {
        let body = "SELECT 1";
        let h1 = compute_db_cache_hash(body, Some("conn-1"), &env_map(&[]));
        let h2 = compute_db_cache_hash(
            body,
            Some("conn-1"),
            &env_map(&[("UNRELATED", "v")]),
        );
        assert_eq!(h1, h2);
    }

    #[test]
    fn db_summary_from_value_appends_line_column_for_error() {
        let value = serde_json::json!({
            "results": [
                {
                    "kind": "error",
                    "message": "syntax error",
                    "line": 2,
                    "column": 5
                }
            ],
            "stats": { "elapsed_ms": 4 }
        });
        let s = db_summary_from_value(Some(&value), 4);
        assert_eq!(s, "error: syntax error at 2:5");
    }
}
