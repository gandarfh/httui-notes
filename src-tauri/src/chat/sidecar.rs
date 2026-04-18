use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tokio::sync::{mpsc, Mutex, Notify};
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};

use super::protocol::{IncomingMessage, OutgoingMessage};

const HEALTH_CHECK_INTERVAL: Duration = Duration::from_secs(30);
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
        // Use bun to run the sidecar TypeScript directly (avoids compiled binary signing issues on macOS)
        let cwd = std::env::current_dir()
            .map_err(|e| format!("Failed to get cwd: {e}"))?;
        let sidecar_script = cwd.join("../sidecar/src/index.ts");
        eprintln!("[sidecar] cwd={}, script={}", cwd.display(), sidecar_script.display());

        let sidecar_cmd = app
            .shell()
            .command("bun")
            .args(["run", &sidecar_script.to_string_lossy()])
            .env("ANTHROPIC_API_KEY", "")
            .env("ANTHROPIC_AUTH_TOKEN", "");

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
