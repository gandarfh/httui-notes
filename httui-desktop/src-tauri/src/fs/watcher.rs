use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind")]
pub enum FileEvent {
    Created { path: String },
    Modified { path: String },
    Removed { path: String },
}

/// Emitted when an externally modified .md file is read back from disk.
#[derive(Debug, Clone, Serialize)]
pub struct FileReloaded {
    pub path: String,
    pub markdown: String,
}

pub struct VaultWatcher {
    _watcher: RecommendedWatcher,
}

pub fn watch_vault(
    vault_path: &str,
    app_handle: AppHandle,
    ignore_paths: Arc<Mutex<Vec<String>>>,
) -> Result<VaultWatcher, String> {
    let vault = vault_path.to_string();
    let (tx, rx) = mpsc::channel();

    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            let _ = tx.send(event);
        }
    })
    .map_err(|e| e.to_string())?;

    watcher
        .watch(Path::new(vault_path), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    let handle = app_handle.clone();
    let vault_for_thread = vault.clone();
    std::thread::spawn(move || {
        let debounce = Duration::from_millis(500);
        // Per-file debounce tracking
        let mut last_emit_per_file: HashMap<String, Instant> = HashMap::new();

        for event in rx {
            let paths: Vec<String> = event
                .paths
                .iter()
                .filter(|p| {
                    let s = p.to_string_lossy().to_string();
                    (s.ends_with(".md") || p.is_dir()) && !s.contains("/.") && !s.contains("\\.")
                })
                .map(|p| {
                    p.strip_prefix(&vault_for_thread)
                        .unwrap_or(p)
                        .to_string_lossy()
                        .trim_start_matches('/')
                        .to_string()
                })
                .collect();

            if paths.is_empty() {
                continue;
            }

            // Check if path is in ignore list (self-triggered saves)
            {
                let ignored = ignore_paths.lock().unwrap();
                if paths.iter().any(|p| ignored.contains(p)) {
                    continue;
                }
            }

            for path in paths {
                // Per-file debounce
                if let Some(last) = last_emit_per_file.get(&path) {
                    if last.elapsed() < debounce {
                        continue;
                    }
                }
                last_emit_per_file.insert(path.clone(), Instant::now());

                match event.kind {
                    EventKind::Modify(_) => {
                        // Read file content and emit file-reloaded with markdown
                        match crate::fs::read_note(&vault_for_thread, &path) {
                            Ok(markdown) => {
                                let _ = handle.emit(
                                    "file-reloaded",
                                    FileReloaded {
                                        path: path.clone(),
                                        markdown,
                                    },
                                );
                            }
                            Err(_) => {
                                // File might be mid-write, emit plain event
                                let _ = handle.emit("fs-event", FileEvent::Modified { path });
                            }
                        }
                    }
                    EventKind::Create(_) => {
                        let _ = handle.emit("fs-event", FileEvent::Created { path });
                    }
                    EventKind::Remove(_) => {
                        let _ = handle.emit("fs-event", FileEvent::Removed { path });
                    }
                    _ => {}
                }
            }
        }
    });

    Ok(VaultWatcher { _watcher: watcher })
}
