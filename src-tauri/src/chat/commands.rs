use std::sync::Arc;
use serde::Deserialize;
use sqlx::sqlite::SqlitePool;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;
use uuid::Uuid;

pub type SidecarState = Arc<Mutex<Option<SidecarManager>>>;

use httui_core::db::chat::{self, Message, Session};

use super::protocol::*;
use super::sidecar::SidecarManager;

#[derive(Debug, Deserialize)]
pub struct AttachmentInput {
    pub media_type: String,
    pub path: String,
}

#[tauri::command]
pub async fn create_chat_session(
    pool: tauri::State<'_, SqlitePool>,
    cwd: Option<String>,
) -> Result<Session, String> {
    chat::create_session(&pool, cwd).await
}

#[tauri::command]
pub async fn list_chat_sessions(
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Vec<Session>, String> {
    chat::list_sessions(&pool).await
}

#[tauri::command]
pub async fn get_chat_session(
    pool: tauri::State<'_, SqlitePool>,
    session_id: i64,
) -> Result<Session, String> {
    chat::get_session(&pool, session_id).await
}

#[tauri::command]
pub async fn archive_chat_session(
    pool: tauri::State<'_, SqlitePool>,
    session_id: i64,
) -> Result<(), String> {
    chat::archive_session(&pool, session_id).await
}

#[tauri::command]
pub async fn list_chat_messages(
    pool: tauri::State<'_, SqlitePool>,
    session_id: i64,
) -> Result<Vec<Message>, String> {
    chat::list_messages(&pool, session_id).await
}

#[tauri::command]
pub async fn send_chat_message(
    app: AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    sidecar: tauri::State<'_, SidecarState>,
    session_id: i64,
    text: String,
    attachments: Vec<AttachmentInput>,
) -> Result<String, String> {
    eprintln!("[chat cmd] send_chat_message session_id={session_id} text={text:?}");

    // 1. Persist user message
    // 2. Build content blocks for DB (paths) and sidecar (base64) separately
    let mut db_blocks: Vec<serde_json::Value> = vec![
        serde_json::json!({"type": "text", "text": text}),
    ];
    let mut sidecar_blocks: Vec<serde_json::Value> = vec![
        serde_json::json!({"type": "text", "text": text}),
    ];

    for att in &attachments {
        let bytes = tokio::fs::read(&att.path)
            .await
            .map_err(|e| format!("Failed to read attachment {}: {e}", att.path))?;

        // Normalize: resize if > 2048px, re-encode as JPEG Q85
        let (normalized, norm_media_type) = normalize_image(&bytes, &att.media_type)
            .unwrap_or_else(|_| (bytes.clone(), att.media_type.clone()));
        let b64 = base64_encode(&normalized);

        // DB stores path (for UI display)
        db_blocks.push(serde_json::json!({
            "type": "image",
            "path": att.path,
            "media_type": att.media_type,
        }));

        // Sidecar gets normalized base64 (for API)
        sidecar_blocks.push(serde_json::json!({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": norm_media_type,
                "data": b64,
            }
        }));
    }

    let content_json = serde_json::to_string(&db_blocks)
        .map_err(|e| format!("Failed to serialize content: {e}"))?;

    chat::insert_message(&pool, session_id, "user", &content_json, None, None, false)
        .await?;

    // Auto-title: if session still has default title, set it from the first user message
    let session_for_title = chat::get_session(&pool, session_id).await?;
    if session_for_title.title == "Nova conversa" {
        let title: String = text.chars().take(50).collect();
        let title = title.split('\n').next().unwrap_or(&title).trim().to_string();
        if !title.is_empty() {
            let _ = chat::update_session_title(&pool, session_id, &title).await;
            let _ = app.emit("chat:session-updated", session_id);
        }
    }

    // 3. Get session for claude_session_id + resolve cwd
    let session = chat::get_session(&pool, session_id).await?;

    // Use session cwd, or fall back to active vault path
    let effective_cwd = if session.cwd.is_some() {
        session.cwd.clone()
    } else {
        // Read active vault from app_config
        let row: Option<(String,)> = sqlx::query_as(
            "SELECT value FROM app_config WHERE key = 'active_vault'"
        )
        .fetch_optional(pool.inner())
        .await
        .ok()
        .flatten();
        row.map(|r| r.0)
    };

    // 4. Send to sidecar (lazy spawn on first use)
    let request_id = Uuid::new_v4().to_string();
    eprintln!("[chat cmd] request_id={request_id}");
    {
        let mut guard = sidecar.lock().await;
        if guard.is_none() {
            eprintln!("[chat cmd] Spawning sidecar...");
            let mgr = SidecarManager::spawn(&app).await
                .map_err(|e| format!("Failed to spawn sidecar: {e}"))?;
            eprintln!("[chat cmd] Sidecar spawned OK");
            *guard = Some(mgr);
        }
    }
    let mut rx = {
        let sidecar_guard = sidecar.lock().await;
        let mgr = sidecar_guard.as_ref().unwrap();
        let rx = mgr.register_request(&request_id).await;

        eprintln!("[chat cmd] Sending Chat message to sidecar...");
        mgr.send(OutgoingMessage::Chat {
            request_id: request_id.clone(),
            claude_session_id: session.claude_session_id,
            cwd: effective_cwd,
            allowed_tools: vec![
                "Read".to_string(),
                "Glob".to_string(),
                "Grep".to_string(),
                "Bash".to_string(),
                "Edit".to_string(),
                "Write".to_string(),
            ],
            content: sidecar_blocks,
        })
        .await?;
        eprintln!("[chat cmd] Chat message sent to sidecar, waiting for events...");
        rx
    }; // sidecar_guard dropped here

    // 5. Spawn task to process incoming events
    let pool_clone = pool.inner().clone();
    let request_id_clone = request_id.clone();
    let sidecar_clone = sidecar.inner().clone();

    tauri::async_runtime::spawn(async move {
        let mut accumulated_text = String::new();
        let mut assistant_msg_id: Option<i64> = None;

        while let Some(msg) = rx.recv().await {
            match msg {
                IncomingMessage::Session {
                    claude_session_id, ..
                } => {
                    let _ = chat::update_session_claude_id(
                        &pool_clone,
                        session_id,
                        &claude_session_id,
                    )
                    .await;
                }
                IncomingMessage::TextDelta { text, .. } => {
                    accumulated_text.push_str(&text);
                    let _ = app.emit(
                        "chat:delta",
                        ChatDeltaEvent {
                            session_id,
                            text,
                        },
                    );
                }
                IncomingMessage::ToolUse {
                    tool_use_id,
                    name,
                    input,
                    ..
                } => {
                    // Persist partial assistant message if not yet created
                    if assistant_msg_id.is_none() {
                        let content = serde_json::json!([{"type": "text", "text": accumulated_text}]);
                        if let Ok(msg) = chat::insert_message(
                            &pool_clone, session_id, "assistant",
                            &content.to_string(), None, None, true,
                        ).await {
                            assistant_msg_id = Some(msg.id);
                        }
                    }
                    // Persist tool call
                    if let Some(msg_id) = assistant_msg_id {
                        let input_str = serde_json::to_string(&input).unwrap_or_default();
                        let _ = chat::insert_tool_call(
                            &pool_clone, msg_id, &tool_use_id, &name, &input_str,
                        ).await;
                    }
                    let _ = app.emit(
                        "chat:tool_use",
                        ChatToolUseEvent {
                            session_id,
                            tool_use_id,
                            name,
                            input,
                        },
                    );
                }
                IncomingMessage::ToolResult {
                    tool_use_id,
                    content,
                    is_error,
                    ..
                } => {
                    // Persist tool result
                    let result_str = serde_json::to_string(&content).unwrap_or_default();
                    let _ = chat::update_tool_call_result(
                        &pool_clone, &tool_use_id, &result_str, is_error,
                    ).await;
                    let _ = app.emit(
                        "chat:tool_result",
                        ChatToolResultEvent {
                            session_id,
                            tool_use_id,
                            content,
                            is_error,
                        },
                    );
                }
                IncomingMessage::PermissionRequest {
                    permission_id,
                    tool_name,
                    tool_input,
                    ..
                } => {
                    let _ = app.emit(
                        "chat:permission_request",
                        ChatPermissionRequestEvent {
                            session_id,
                            permission_id,
                            tool_name,
                            tool_input,
                        },
                    );
                }
                IncomingMessage::Done { usage, stop_reason, .. } => {
                    // Persist or update assistant message
                    let content = serde_json::json!([
                        {"type": "text", "text": accumulated_text}
                    ]);
                    let tokens_in = usage.as_ref().map(|u| u.input_tokens as i64);
                    let tokens_out = usage.as_ref().map(|u| u.output_tokens as i64);

                    if let Some(msg_id) = assistant_msg_id {
                        // Update partial message to final
                        let _ = sqlx::query(
                            "UPDATE messages SET content_json = ?, tokens_in = ?, tokens_out = ?, is_partial = 0 WHERE id = ?"
                        )
                        .bind(content.to_string())
                        .bind(tokens_in)
                        .bind(tokens_out)
                        .bind(msg_id)
                        .execute(&pool_clone)
                        .await;
                    } else {
                        let _ = chat::insert_message(
                            &pool_clone,
                            session_id,
                            "assistant",
                            &content.to_string(),
                            tokens_in,
                            tokens_out,
                            false,
                        )
                        .await;
                    }

                    let _ = app.emit(
                        "chat:done",
                        ChatDoneEvent {
                            session_id,
                            usage,
                            stop_reason,
                        },
                    );
                    break;
                }
                IncomingMessage::Error {
                    category, message, ..
                } => {
                    // Persist partial message if we have accumulated text
                    if !accumulated_text.is_empty() {
                        let content = serde_json::json!([
                            {"type": "text", "text": accumulated_text}
                        ]);
                        let _ = chat::insert_message(
                            &pool_clone,
                            session_id,
                            "assistant",
                            &content.to_string(),
                            None,
                            None,
                            true,
                        )
                        .await;
                    }

                    let _ = app.emit(
                        "chat:error",
                        ChatErrorEvent {
                            session_id,
                            category,
                            message,
                        },
                    );
                    break;
                }
                IncomingMessage::Pong => {}
            }
        }

        // Cleanup
        if let Some(mgr) = sidecar_clone.lock().await.as_ref() {
            mgr.unregister_request(&request_id_clone).await;
        }
    });

    Ok(request_id)
}

#[tauri::command]
pub async fn abort_chat(
    sidecar: tauri::State<'_, SidecarState>,
    request_id: String,
) -> Result<(), String> {
    let guard = sidecar.lock().await;
    let mgr = guard.as_ref().ok_or("Sidecar not initialized")?;
    mgr.send(OutgoingMessage::Abort { request_id }).await
}

#[tauri::command]
pub async fn respond_chat_permission(
    sidecar: tauri::State<'_, SidecarState>,
    permission_id: String,
    behavior: String,
    message: Option<String>,
) -> Result<(), String> {
    let decision_behavior = match behavior.as_str() {
        "allow" => PermissionBehavior::Allow,
        "deny" => PermissionBehavior::Deny,
        _ => return Err(format!("Invalid behavior: {behavior}")),
    };

    let guard = sidecar.lock().await;
    let mgr = guard.as_ref().ok_or("Sidecar not initialized")?;
    mgr.send(OutgoingMessage::PermissionResponse {
        permission_id,
        decision: PermissionDecision {
            behavior: decision_behavior,
            message,
        },
    })
    .await
}

#[tauri::command]
pub async fn save_attachment_tmp(
    app: AppHandle,
    bytes: Vec<u8>,
    media_type: String,
) -> Result<String, String> {
    let ext = match media_type.as_str() {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "bin",
    };

    let tmp_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?
        .join("tmp");

    tokio::fs::create_dir_all(&tmp_dir)
        .await
        .map_err(|e| format!("Failed to create tmp dir: {e}"))?;

    let filename = format!("{}.{}", Uuid::new_v4(), ext);
    let path = tmp_dir.join(&filename);

    tokio::fs::write(&path, &bytes)
        .await
        .map_err(|e| format!("Failed to write tmp file: {e}"))?;

    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn delete_messages_after(
    pool: tauri::State<'_, SqlitePool>,
    session_id: i64,
    turn_index: i64,
) -> Result<(), String> {
    sqlx::query("DELETE FROM messages WHERE session_id = ? AND turn_index >= ?")
        .bind(session_id)
        .bind(turn_index)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to delete messages: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn update_chat_session_cwd(
    pool: tauri::State<'_, SqlitePool>,
    session_id: i64,
    cwd: Option<String>,
) -> Result<(), String> {
    sqlx::query("UPDATE sessions SET cwd = ?, updated_at = unixepoch() WHERE id = ?")
        .bind(&cwd)
        .bind(session_id)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to update session cwd: {e}"))?;
    Ok(())
}

fn base64_encode(bytes: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

const MAX_IMAGE_DIMENSION: u32 = 2048;

/// Normalize an image: resize if either side > 2048px, re-encode as JPEG Q85.
/// Returns (normalized_bytes, media_type). Passes through unchanged if already small enough and JPEG.
fn normalize_image(bytes: &[u8], media_type: &str) -> Result<(Vec<u8>, String), String> {
    let img = image::load_from_memory(bytes)
        .map_err(|e| format!("Failed to decode image: {e}"))?;

    let (w, h) = (img.width(), img.height());
    let needs_resize = w > MAX_IMAGE_DIMENSION || h > MAX_IMAGE_DIMENSION;
    let is_jpeg = media_type == "image/jpeg";

    // Skip if already small enough and JPEG
    if !needs_resize && is_jpeg {
        return Ok((bytes.to_vec(), media_type.to_string()));
    }

    let img = if needs_resize {
        img.resize(
            MAX_IMAGE_DIMENSION,
            MAX_IMAGE_DIMENSION,
            image::imageops::FilterType::Lanczos3,
        )
    } else {
        img
    };

    let mut buf = Vec::new();
    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 85);
    img.to_rgb8()
        .write_with_encoder(encoder)
        .map_err(|e| format!("Failed to encode JPEG: {e}"))?;

    Ok((buf, "image/jpeg".to_string()))
}
