// Re-export shared core modules
pub use httui_core::block_history;
pub use httui_core::block_results;
pub use httui_core::config;
pub use httui_core::db;
pub use httui_core::executor;
pub use httui_core::search;

// fs re-exports core + local watcher
pub mod fs {
    pub use httui_core::fs::*;
    pub mod watcher;
}

// Chat sidecar integration
pub mod chat;

// Cancel-aware DB execution plumbing (stage 3 of db block redesign)
pub mod executions;
