use crossterm::event::{Event as CtEvent, KeyEvent};
use futures::StreamExt;
use httui_core::executor::db::types::DbResponse;
use std::time::Duration;
use tokio::sync::mpsc;

use crate::error::TuiResult;

/// All events the main loop reacts to.
///
/// Future variants for streaming block execution and file watcher events
/// land here without changing the dispatcher shape — Epic 21 / 22.
#[derive(Debug)]
#[allow(dead_code)] // Resize / Quit are wired but not yet consumed by the scaffold.
pub enum AppEvent {
    Key(KeyEvent),
    Resize(u16, u16),
    Tick,
    Quit,
    /// A backgrounded DB query (kicked off by `apply_run_block` /
    /// `load_more_db_block`) finished. The main loop folds the
    /// outcome back into the block at `segment_idx` and clears the
    /// app's `running_query` slot. `kind` distinguishes a fresh
    /// run from a paginated load-more so the merge logic picks the
    /// right strategy.
    DbBlockResult {
        segment_idx: usize,
        kind: DbBlockResultKind,
        outcome: Result<DbResponse, String>,
    },
}

/// Why this DB result was produced — used by the main loop to pick
/// between "replace the cached_result" (fresh run) and "append the
/// new page's rows" (load-more).
#[derive(Debug)]
pub enum DbBlockResultKind {
    Run,
    LoadMore,
}

/// Spawns a background task that drains `crossterm`'s event stream and
/// emits a periodic `Tick` for animation/polling. The receiver is owned
/// by the main loop.
pub struct EventLoop {
    rx: mpsc::UnboundedReceiver<AppEvent>,
    tx: mpsc::UnboundedSender<AppEvent>,
    _handle: tokio::task::JoinHandle<()>,
}

impl EventLoop {
    pub fn start(tick_rate: Duration) -> TuiResult<Self> {
        let (tx, rx) = mpsc::unbounded_channel();
        let tx_clone = tx.clone();
        let handle = tokio::spawn(async move {
            let mut stream = crossterm::event::EventStream::new();
            let mut tick = tokio::time::interval(tick_rate);
            tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            loop {
                tokio::select! {
                    biased;
                    _ = tick.tick() => {
                        if tx_clone.send(AppEvent::Tick).is_err() {
                            break;
                        }
                    }
                    Some(Ok(ev)) = stream.next() => {
                        let mapped = match ev {
                            CtEvent::Key(k) => AppEvent::Key(k),
                            CtEvent::Resize(c, r) => AppEvent::Resize(c, r),
                            _ => continue,
                        };
                        if tx_clone.send(mapped).is_err() {
                            break;
                        }
                    }
                }
            }
        });
        Ok(Self { rx, tx, _handle: handle })
    }

    pub async fn next(&mut self) -> Option<AppEvent> {
        self.rx.recv().await
    }

    /// Hand a cloneable sender to dispatch handlers that need to
    /// inject events from spawned tasks (currently the async DB
    /// executor). The receiver continues to flow through `next()`.
    pub fn sender(&self) -> mpsc::UnboundedSender<AppEvent> {
        self.tx.clone()
    }
}
