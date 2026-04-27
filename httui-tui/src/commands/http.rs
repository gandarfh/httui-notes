//! HTTP block execution. Mirrors the DB module's flow:
//! `apply_run_http_block` → resolve refs → spawn task → AppEvent →
//! `handle_http_block_result` folds the response into the block.

use std::time::Instant;
use tokio_util::sync::CancellationToken;

use crate::app::{App, RunningKind, RunningQuery, StatusKind};
use crate::buffer::block::ExecutionState;
use crate::buffer::Segment;
use crate::commands::db::{load_active_env_vars, resolve_one_ref};
use httui_core::executor::http::types::HttpResponse;
use httui_core::executor::http::HttpExecutor;

pub fn apply_run_http_block(app: &mut App, segment_idx: usize) {
    let Some(doc) = app.document() else { return };
    let block = match doc.segments().get(segment_idx) {
        Some(Segment::Block(b)) => b.clone(),
        _ => return,
    };
    if !block.is_http() {
        app.set_status(StatusKind::Info, "not an HTTP block");
        return;
    }

    // Pre-flight: env vars + ref resolution. Fast (in-memory + a
    // couple of SQLite reads), so we keep them on the dispatch
    // thread.
    let env_vars = tokio::task::block_in_place(|| {
        tokio::runtime::Handle::current()
            .block_on(load_active_env_vars(app.pool_manager.app_pool()))
    })
    .unwrap_or_default();

    let segments_snapshot: Vec<Segment> = doc.segments().to_vec();
    let mut resolved = block.params.clone();
    if let Err(msg) = resolve_in_http_params(
        &mut resolved,
        &segments_snapshot,
        segment_idx,
        &env_vars,
    ) {
        if let Some(doc) = app.tabs.active_document_mut() {
            if let Some(b) = doc.block_at_mut(segment_idx) {
                b.state = ExecutionState::Error(msg.clone());
                b.cached_result = None;
            }
        }
        app.set_status(StatusKind::Error, msg);
        return;
    }

    // Validate URL is non-empty after resolution.
    let url_ok = resolved
        .get("url")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    if !url_ok {
        let msg = "empty URL".to_string();
        if let Some(doc) = app.tabs.active_document_mut() {
            if let Some(b) = doc.block_at_mut(segment_idx) {
                b.state = ExecutionState::Error(msg.clone());
                b.cached_result = None;
            }
        }
        app.set_status(StatusKind::Error, msg);
        return;
    }

    // Mark Running on the block + record running query slot for
    // Ctrl-C cancel.
    if let Some(doc) = app.tabs.active_document_mut() {
        if let Some(b) = doc.block_at_mut(segment_idx) {
            b.state = ExecutionState::Running;
        }
    }

    let token = CancellationToken::new();
    let Some(sender) = app.event_sender.clone() else {
        app.set_status(
            StatusKind::Error,
            "internal: no event sender wired (spawn aborted)",
        );
        return;
    };
    let token_for_task = token.clone();
    let segment_idx_for_task = segment_idx;
    tokio::spawn(async move {
        let executor = HttpExecutor::new();
        let outcome = executor
            .execute_with_cancel(resolved, token_for_task)
            .await
            .map_err(|e| format!("{e}"));
        let _ = sender.send(crate::event::AppEvent::HttpBlockResult {
            segment_idx: segment_idx_for_task,
            outcome,
        });
    });

    app.running_query = Some(RunningQuery {
        segment_idx,
        cancel: token,
        started_at: Instant::now(),
        kind: RunningKind::Run,
        cache_key: None,
    });
}

pub fn handle_http_block_result(
    app: &mut App,
    segment_idx: usize,
    outcome: Result<HttpResponse, String>,
) {
    app.running_query = None;
    let Some(doc) = app.tabs.active_document_mut() else {
        return;
    };
    let Some(b) = doc.block_at_mut(segment_idx) else {
        return;
    };
    match outcome {
        Ok(response) => {
            b.cached_result = Some(http_response_to_json(&response));
            b.state = ExecutionState::Success;
            app.set_status(
                StatusKind::Info,
                format!(
                    "{} {} · {}ms",
                    response.status_code, response.status_text, response.elapsed_ms
                ),
            );
        }
        Err(msg) => {
            b.state = ExecutionState::Error(msg.clone());
            b.cached_result = None;
            app.set_status(StatusKind::Error, msg);
        }
    }
}

/// Convert the executor's `HttpResponse` to the JSON shape the
/// renderer expects: headers as `[{key, value}]` array (vs the
/// executor's `HashMap`), `status` field aliased from `status_code`,
/// `timing.total_ms` derived from `elapsed_ms`.
fn http_response_to_json(r: &HttpResponse) -> serde_json::Value {
    let headers: Vec<serde_json::Value> = r
        .headers
        .iter()
        .map(|(k, v)| {
            serde_json::json!({ "key": k, "value": v })
        })
        .collect();
    let cookies: Vec<serde_json::Value> = r
        .cookies
        .iter()
        .map(|c| {
            serde_json::json!({
                "name": c.name,
                "value": c.value,
                "domain": c.domain,
                "path": c.path,
            })
        })
        .collect();
    serde_json::json!({
        "status": r.status_code,
        "status_text": r.status_text,
        "headers": headers,
        "cookies": cookies,
        "body": r.body,
        "size_bytes": r.size_bytes,
        "timing": {
            "total_ms": r.elapsed_ms,
            "ttfb_ms": r.timing.ttfb_ms,
        },
    })
}

/// Walk the HTTP block's params object and replace every
/// `{{...}}` placeholder in URL / headers / params / body with its
/// resolved text value. Block refs come from `resolve_one_ref`
/// (same source the SQL path uses); env vars resolve as plain
/// strings.
fn resolve_in_http_params(
    params: &mut serde_json::Value,
    segments: &[Segment],
    current_segment: usize,
    env_vars: &std::collections::HashMap<String, String>,
) -> Result<(), String> {
    if let Some(s) = params.get("url").and_then(|v| v.as_str()).map(String::from) {
        let resolved = resolve_text_refs(&s, segments, current_segment, env_vars)?;
        if let Some(slot) = params.get_mut("url") {
            *slot = serde_json::Value::String(resolved);
        }
    }
    if let Some(arr) = params.get_mut("headers").and_then(|v| v.as_array_mut()) {
        for h in arr.iter_mut() {
            resolve_kv_in_place(h, segments, current_segment, env_vars)?;
        }
    }
    if let Some(arr) = params.get_mut("params").and_then(|v| v.as_array_mut()) {
        for p in arr.iter_mut() {
            resolve_kv_in_place(p, segments, current_segment, env_vars)?;
        }
    }
    if let Some(s) = params.get("body").and_then(|v| v.as_str()).map(String::from) {
        let resolved = resolve_text_refs(&s, segments, current_segment, env_vars)?;
        if let Some(slot) = params.get_mut("body") {
            *slot = serde_json::Value::String(resolved);
        }
    }
    Ok(())
}

fn resolve_kv_in_place(
    obj: &mut serde_json::Value,
    segments: &[Segment],
    current_segment: usize,
    env_vars: &std::collections::HashMap<String, String>,
) -> Result<(), String> {
    for field in ["key", "value"] {
        if let Some(s) = obj.get(field).and_then(|v| v.as_str()).map(String::from) {
            let resolved = resolve_text_refs(&s, segments, current_segment, env_vars)?;
            if let Some(slot) = obj.get_mut(field) {
                *slot = serde_json::Value::String(resolved);
            }
        }
    }
    Ok(())
}

/// Substitute `{{ref}}` placeholders in `text` with their resolved
/// value as plain text. Strings unquote; other JSON values use
/// their JSON form. Used by HTTP for URL / header / param / body
/// substitution (DB uses `?`-bind placeholders instead).
pub(crate) fn resolve_text_refs(
    text: &str,
    segments: &[Segment],
    current_segment: usize,
    env_vars: &std::collections::HashMap<String, String>,
) -> Result<String, String> {
    let mut out = String::with_capacity(text.len());
    let bytes = text.as_bytes();
    let mut i = 0usize;
    while i < bytes.len() {
        if i + 1 < bytes.len() && bytes[i] == b'{' && bytes[i + 1] == b'{' {
            let close = match find_close(&bytes[i + 2..]) {
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
            let s = match value {
                serde_json::Value::String(s) => s,
                other => other.to_string(),
            };
            out.push_str(&s);
            i = close + 2;
        } else {
            out.push(bytes[i] as char);
            i += 1;
        }
    }
    Ok(out)
}

fn find_close(bytes: &[u8]) -> Option<usize> {
    for i in 0..bytes.len().saturating_sub(1) {
        if bytes[i] == b'}' && bytes[i + 1] == b'}' {
            return Some(i);
        }
    }
    None
}
