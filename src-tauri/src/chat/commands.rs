use std::sync::Arc;
use serde::Deserialize;
use sqlx::sqlite::SqlitePool;
use tauri::{AppHandle, Emitter};
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
) -> Result<(), String> {
    eprintln!("[chat cmd] send_chat_message session_id={session_id} text={text:?}");

    // 1. Persist user message
    let mut content_blocks: Vec<serde_json::Value> = vec![
        serde_json::json!({"type": "text", "text": text}),
    ];

    // 2. Process attachments (read files → base64)
    for att in &attachments {
        let bytes = tokio::fs::read(&att.path)
            .await
            .map_err(|e| format!("Failed to read attachment {}: {e}", att.path))?;
        let b64 = base64_encode(&bytes);
        content_blocks.push(serde_json::json!({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": att.media_type,
                "data": b64,
            }
        }));
    }

    let content_json = serde_json::to_string(&content_blocks)
        .map_err(|e| format!("Failed to serialize content: {e}"))?;

    chat::insert_message(&pool, session_id, "user", &content_json, None, None, false)
        .await?;

    // 3. Get session for claude_session_id
    let session = chat::get_session(&pool, session_id).await?;

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
            cwd: session.cwd,
            allowed_tools: vec![
                "Read".to_string(),
                "Glob".to_string(),
                "Grep".to_string(),
            ],
            content: content_blocks,
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
        eprintln!("[chat evt] Event loop started for request {request_id_clone}");

        while let Some(msg) = rx.recv().await {
            eprintln!("[chat evt] Received: {:?}", std::mem::discriminant(&msg));
            match msg {
                IncomingMessage::Session {
                    claude_session_id, ..
                } => {
                    eprintln!("[chat evt] Session: {claude_session_id}");
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
                    eprintln!("[chat evt] Done. accumulated_text={:?} ({} chars)", &accumulated_text[..accumulated_text.len().min(100)], accumulated_text.len());
                    // Persist assistant message
                    let content = serde_json::json!([
                        {"type": "text", "text": accumulated_text}
                    ]);
                    let tokens_in = usage.as_ref().map(|u| u.input_tokens as i64);
                    let tokens_out = usage.as_ref().map(|u| u.output_tokens as i64);
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

    Ok(())
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

fn base64_encode(bytes: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(bytes)
}
