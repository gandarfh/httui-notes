use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
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

    // Debounce thread
    let handle = app_handle.clone();
    std::thread::spawn(move || {
        let debounce = Duration::from_millis(300);
        let mut last_emit = Instant::now() - debounce;

        for event in rx {
            // Skip non-file events
            let paths: Vec<String> = event
                .paths
                .iter()
                .filter(|p| {
                    let s = p.to_string_lossy().to_string();
                    // Only .md files, skip hidden
                    (s.ends_with(".md") || p.is_dir())
                        && !s.contains("/.")
                        && !s.contains("\\.")
                })
                .map(|p| {
                    p.strip_prefix(&vault)
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

            // Debounce
            if last_emit.elapsed() < debounce {
                continue;
            }
            last_emit = Instant::now();

            for path in paths {
                let file_event = match event.kind {
                    EventKind::Create(_) => FileEvent::Created { path },
                    EventKind::Modify(_) => FileEvent::Modified { path },
                    EventKind::Remove(_) => FileEvent::Removed { path },
                    _ => continue,
                };

                let _ = handle.emit("fs-event", &file_event);
            }
        }
    });

    Ok(VaultWatcher {
        _watcher: watcher,
    })
}
