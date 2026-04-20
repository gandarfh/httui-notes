use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tokio::sync::{mpsc, Mutex, Notify};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};

use super::protocol::{IncomingMessage, OutgoingMessage};

const HEALTH_CHECK_INTERVAL: Duration = Duration::from_secs(30);

/// Find the `node` binary, checking common macOS install locations
/// since GUI apps don't inherit the user's shell PATH.
fn find_node() -> Option<String> {
    use std::path::{Path, PathBuf};

    // Try PATH first (works in dev / terminal launches)
    if let Ok(output) = std::process::Command::new("which").arg("node").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() && Path::new(&path).exists() {
                return Some(path);
            }
        }
    }

    // nvm: scan installed versions and pick the latest
    if let Ok(home) = std::env::var("HOME") {
        let nvm_versions = PathBuf::from(&home).join(".nvm/versions/node");
        if let Ok(entries) = std::fs::read_dir(&nvm_versions) {
            let mut nodes: Vec<PathBuf> = entries
                .flatten()
                .map(|e| e.path().join("bin/node"))
                .filter(|p| p.exists())
                .collect();
            nodes.sort();
            if let Some(latest) = nodes.last() {
                return Some(latest.to_string_lossy().to_string());
            }
        }
    }

    // Common macOS install locations
    let candidates = [
        "/opt/homebrew/bin/node",
        "/usr/local/bin/node",
        "/usr/bin/node",
    ];
    for candidate in &candidates {
        if Path::new(candidate).exists() {
            return Some(candidate.to_string());
        }
    }

    None
}

/// Find the `claude` CLI binary, checking the same bin directory as node.
fn find_claude(node_path: &str) -> Option<String> {
    use std::path::Path;

    // Same directory as node (e.g. ~/.nvm/versions/node/v22/bin/claude)
    if let Some(bin_dir) = Path::new(node_path).parent() {
        let claude = bin_dir.join("claude");
        if claude.exists() {
            return Some(claude.to_string_lossy().to_string());
        }
    }

    // Try which
    if let Ok(output) = std::process::Command::new("which").arg("claude").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() && Path::new(&path).exists() {
                return Some(path);
            }
        }
    }

    let candidates = [
        "/opt/homebrew/bin/claude",
        "/usr/local/bin/claude",
    ];
    for candidate in &candidates {
        if Path::new(candidate).exists() {
            return Some(candidate.to_string());
        }
    }

    None
}

const HEALTH_CHECK_TIMEOUT: Duration = Duration::from_secs(5);
const BACKOFF_DELAYS: &[Duration] = &[
    Duration::from_secs(1),
    Duration::from_secs(2),
    Duration::from_secs(4),
    Duration::from_secs(8),
    Duration::from_secs(30),
];

/// Manages the sidecar process lifecycle, message multiplexing, and supervision.
pub struct SidecarManager {
    child: Arc<Mutex<Option<CommandChild>>>,
    /// Maps request_id → sender for incoming messages from sidecar
    requests: Arc<Mutex<HashMap<String, mpsc::UnboundedSender<IncomingMessage>>>>,
    /// Notified when a pong is received (health check response)
    pong_notify: Arc<Notify>,
    /// Flag to stop background tasks on shutdown
    shutdown: Arc<AtomicBool>,
    app_handle: AppHandle,
}

impl SidecarManager {
    /// Spawn the sidecar process and start reading stdout/stderr.
    pub async fn spawn(app: &AppHandle) -> Result<Self, String> {
        let requests: Arc<Mutex<HashMap<String, mpsc::UnboundedSender<IncomingMessage>>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let child = Arc::new(Mutex::new(None::<CommandChild>));
        let pong_notify = Arc::new(Notify::new());
        let shutdown = Arc::new(AtomicBool::new(false));

        let manager = Self {
            child: child.clone(),
            requests: requests.clone(),
            pong_notify: pong_notify.clone(),
            shutdown: shutdown.clone(),
            app_handle: app.clone(),
        };

        // Initial spawn
        Self::spawn_process(app, &child, &requests, &pong_notify).await?;

        // Supervisor task: respawn on termination with backoff
        let app_respawn = app.clone();
        let child_respawn = child.clone();
        let requests_respawn = requests.clone();
        let pong_respawn = pong_notify.clone();
        let shutdown_respawn = shutdown.clone();
        tauri::async_runtime::spawn(async move {
            let mut attempt = 0usize;
            loop {
                // Wait for sidecar to die
                loop {
                    tokio::time::sleep(Duration::from_secs(1)).await;
                    if shutdown_respawn.load(Ordering::Relaxed) {
                        return;
                    }
                    if child_respawn.lock().await.is_none() {
                        break; // Process died, attempt respawn
                    }
                }

                let delay = BACKOFF_DELAYS[attempt.min(BACKOFF_DELAYS.len() - 1)];
                eprintln!("[sidecar] Respawning in {:?} (attempt {})...", delay, attempt + 1);
                tokio::time::sleep(delay).await;

                if shutdown_respawn.load(Ordering::Relaxed) {
                    return;
                }

                match Self::spawn_process(
                    &app_respawn,
                    &child_respawn,
                    &requests_respawn,
                    &pong_respawn,
                ).await {
                    Ok(_) => {
                        eprintln!("[sidecar] Respawned successfully");
                        let _ = app_respawn.emit("chat:sidecar-status", "connected");
                        attempt = 0;
                    }
                    Err(e) => {
                        eprintln!("[sidecar] Respawn failed: {e}");
                        attempt += 1;
                    }
                }
            }
        });

        // Health check task
        let child_health = child.clone();
        let pong_health = pong_notify.clone();
        let shutdown_health = shutdown.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(HEALTH_CHECK_INTERVAL).await;
                if shutdown_health.load(Ordering::Relaxed) {
                    return;
                }

                let mut guard = child_health.lock().await;
                if let Some(child) = guard.as_mut() {
                    let ping = OutgoingMessage::Ping;
                    if let Ok(line) = ping.to_ndjson() {
                        if child.write((line + "\n").as_bytes()).is_err() {
                            continue;
                        }
                    }
                    drop(guard); // Release lock before waiting

                    // Wait for pong with timeout
                    let pong_result = tokio::time::timeout(
                        HEALTH_CHECK_TIMEOUT,
                        pong_health.notified(),
                    )
                    .await;

                    if pong_result.is_err() {
                        eprintln!("[sidecar] Health check timeout — killing process");
                        let mut guard = child_health.lock().await;
                        if let Some(dead_child) = guard.take() {
                            let _ = dead_child.kill();
                        }
                        // Supervisor task will handle respawn
                    }
                }
            }
        });

        Ok(manager)
    }

    /// Internal: spawn the sidecar process and wire up the event reader.
    async fn spawn_process(
        app: &AppHandle,
        child: &Arc<Mutex<Option<CommandChild>>>,
        requests: &Arc<Mutex<HashMap<String, mpsc::UnboundedSender<IncomingMessage>>>>,
        pong_notify: &Arc<Notify>,
    ) -> Result<(), String> {
        let script_path = app
            .path()
            .resolve("resources/claude-sidecar.mjs", tauri::path::BaseDirectory::Resource)
            .map_err(|e| format!("Failed to resolve sidecar resource path: {e}"))?;

        let node_path = find_node().ok_or("Node.js not found. Install Node.js to use the chat feature.")?;

        // Resolve claude CLI path — same bin directory as node, or via which
        let claude_path = find_claude(&node_path).unwrap_or_default();
        eprintln!("[sidecar] node={}, claude={}, script={}", node_path, claude_path, script_path.display());

        // Build PATH that includes the node/claude bin directory so that
        // subprocesses spawned by the Agent SDK (which use #!/usr/bin/env node) work.
        let node_bin_dir = std::path::Path::new(&node_path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let system_path = std::env::var("PATH").unwrap_or_default();
        let enriched_path = if node_bin_dir.is_empty() {
            system_path
        } else {
            format!("{node_bin_dir}:{system_path}")
        };

        let sidecar_cmd = app
            .shell()
            .command(&node_path)
            .args([script_path.to_string_lossy().as_ref()])
            .env("ANTHROPIC_API_KEY", "")
            .env("ANTHROPIC_AUTH_TOKEN", "")
            .env("CLAUDE_CLI_PATH", &claude_path)
            .env("PATH", &enriched_path);

        let (rx, new_child) = sidecar_cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn sidecar: {e}"))?;

        *child.lock().await = Some(new_child);

        // Spawn reader task
        let requests_clone = requests.clone();
        let app_clone = app.clone();
        let child_clone = child.clone();
        let pong_clone = pong_notify.clone();
        tauri::async_runtime::spawn(async move {
            Self::read_events(rx, requests_clone, app_clone, child_clone, pong_clone).await;
        });

        Ok(())
    }

    /// Send a message to the sidecar process via stdin.
    pub async fn send(&self, msg: OutgoingMessage) -> Result<(), String> {
        let line = msg.to_ndjson().map_err(|e| format!("Serialization error: {e}"))?;
        let mut guard = self.child.lock().await;
        let child = guard.as_mut().ok_or("Sidecar not running")?;
        child
            .write((line + "\n").as_bytes())
            .map_err(|e| format!("Failed to write to sidecar stdin: {e}"))?;
        Ok(())
    }

    /// Register a request and get a receiver for incoming messages.
    pub async fn register_request(
        &self,
        request_id: &str,
    ) -> mpsc::UnboundedReceiver<IncomingMessage> {
        let (tx, rx) = mpsc::unbounded_channel();
        self.requests
            .lock()
            .await
            .insert(request_id.to_string(), tx);
        rx
    }

    /// Unregister a request (cleanup).
    pub async fn unregister_request(&self, request_id: &str) {
        self.requests.lock().await.remove(request_id);
    }

    /// Graceful shutdown: abort active requests, kill sidecar, stop background tasks.
    pub async fn shutdown(&self) {
        self.shutdown.store(true, Ordering::Relaxed);

        // Send abort to sidecar for any active requests
        let request_ids: Vec<String> = {
            let guard = self.requests.lock().await;
            guard.keys().cloned().collect()
        };

        for request_id in &request_ids {
            let _ = self
                .send(OutgoingMessage::Abort {
                    request_id: request_id.clone(),
                })
                .await;
        }

        // Wait briefly for sidecar to process aborts
        tokio::time::sleep(Duration::from_secs(2)).await;

        // Kill the process
        let mut guard = self.child.lock().await;
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
        }
    }

    /// Read events from the sidecar stdout and dispatch to registered requests.
    async fn read_events(
        mut rx: tauri::async_runtime::Receiver<CommandEvent>,
        requests: Arc<Mutex<HashMap<String, mpsc::UnboundedSender<IncomingMessage>>>>,
        app: AppHandle,
        child: Arc<Mutex<Option<CommandChild>>>,
        pong_notify: Arc<Notify>,
    ) {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes);
                    let line = line.trim();
                    if line.is_empty() {
                        continue;
                    }

                    match IncomingMessage::from_ndjson(line) {
                        Ok(IncomingMessage::Pong) => {
                            pong_notify.notify_one();
                        }
                        Ok(msg) => {
                            if let Some(request_id) = msg.request_id() {
                                let guard = requests.lock().await;
                                if let Some(tx) = guard.get(request_id) {
                                    let _ = tx.send(msg);
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("[sidecar] Failed to parse NDJSON: {e} — line: {line}");
                        }
                    }
                }
                CommandEvent::Stderr(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes);
                    eprintln!("[sidecar stderr] {}", line.trim());
                }
                CommandEvent::Terminated(status) => {
                    eprintln!("[sidecar] Process terminated: {status:?}");

                    // Mark child as dead so supervisor can respawn
                    *child.lock().await = None;

                    // Notify all pending requests of failure
                    let guard = requests.lock().await;
                    for (_, tx) in guard.iter() {
                        let _ = tx.send(IncomingMessage::Error {
                            request_id: String::new(),
                            category: "internal".to_string(),
                            message: "Sidecar process terminated unexpectedly".to_string(),
                        });
                    }

                    let _ = app.emit("chat:sidecar-status", "terminated");
                    break;
                }
                _ => {}
            }
        }
    }
}
