//! Filesystem watcher for the active document. When an external
//! tool (`git checkout`, formatter, MCP `update_note`) modifies the
//! open file, we want the buffer to reflect the change without the
//! user having to re-`:e`. This mirrors the desktop's
//! `ConflictBanner` flow.
//!
//! Strategy: watch the parent directory non-recursively (atomic
//! renames replace the inode, so watching the file path itself
//! drops the new inode); filter events down to our specific path
//! at receive-time. The `notify::recommended_watcher` callback runs
//! on a background thread; we forward each relevant event as
//! `AppEvent::FileChangedExternally` so the main loop reloads on
//! its own schedule.
//!
//! "Was this our own write?" is decided in the main loop's reload
//! handler by comparing disk content with the buffer's serialized
//! markdown. If equal, ignore. If different + clean, swap silently.
//! If different + dirty, surface a status warning instead of
//! clobbering unsaved work.

use std::path::{Path, PathBuf};

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tokio::sync::mpsc::UnboundedSender;

use crate::event::AppEvent;

pub struct FileWatcher {
    /// `notify`'s watcher handle. Dropping it stops the background
    /// thread; `Option` so `unwatch` can drop without ownership of
    /// `self`.
    inner: Option<RecommendedWatcher>,
    /// Path currently being watched. `watch(same_path)` is a no-op
    /// when this matches — saves churn on tab switches that resolve
    /// to the same file.
    current: Option<PathBuf>,
    sender: UnboundedSender<AppEvent>,
}

impl FileWatcher {
    pub fn new(sender: UnboundedSender<AppEvent>) -> Self {
        Self {
            inner: None,
            current: None,
            sender,
        }
    }

    /// Start (or replace) the watch on `path`. Returns `Err` when
    /// the OS notify backend rejects the path — caller surfaces it
    /// as a status hint; the editor keeps working without reload.
    pub fn watch(&mut self, path: &Path) -> Result<(), String> {
        if self.current.as_deref() == Some(path) {
            return Ok(());
        }
        // Drop the old watcher before constructing the new one so
        // we don't briefly hold two background threads. If the new
        // watcher fails to construct, the old one is gone — caller
        // gets a status hint and the editor is just unwatched. Fine.
        self.inner = None;
        self.current = None;

        let sender = self.sender.clone();
        let watch_path = path.to_path_buf();
        let watch_path_for_event = watch_path.clone();
        let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            if let Ok(event) = res {
                // Only modify/create are interesting. Access /
                // metadata noise (e.g. `cat` over the file)
                // shouldn't trigger a reload.
                if !matches!(event.kind, EventKind::Modify(_) | EventKind::Create(_)) {
                    return;
                }
                // notify watches the parent directory, so
                // events for siblings flow through too — drop
                // anything that doesn't touch our specific
                // path.
                if !event.paths.iter().any(|p| p == &watch_path_for_event) {
                    return;
                }
                let _ = sender.send(AppEvent::FileChangedExternally {
                    path: watch_path_for_event.clone(),
                });
            }
        })
        .map_err(|e| format!("notify init failed: {e}"))?;

        // Watch the parent dir non-recursively. Watching the file
        // path itself loses the new inode after an atomic rename
        // (which is how editors like vim save by default).
        let parent = path.parent().unwrap_or_else(|| Path::new("."));
        watcher
            .watch(parent, RecursiveMode::NonRecursive)
            .map_err(|e| format!("notify watch failed: {e}"))?;

        self.inner = Some(watcher);
        self.current = Some(watch_path);
        Ok(())
    }

    /// Stop the current watch. Cheap to call multiple times.
    pub fn unwatch(&mut self) {
        self.inner = None;
        self.current = None;
    }
}
