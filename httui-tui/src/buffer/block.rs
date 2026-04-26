use serde_json::Value;

/// Document-scoped identifier for a block node.
///
/// Stable across mutations for the lifetime of the [`Document`][doc] that
/// minted it. Not persisted on disk — blocks are identified on-disk by
/// their hashed content (see `httui_core::block_results`).
///
/// [doc]: crate::buffer::Document
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct BlockId(pub u64);

/// Runtime execution state of a block.
///
/// Drives UI affordances (color, spinner, error banner) and gates ops
/// like re-run / cancel. Transitions:
/// - `Idle` → `Running` (user hits run)
/// - `Cached` → `Running` (explicit re-run ignores cache)
/// - `Running` → `Success | Error(_)` (executor returns)
#[derive(Debug, Clone, PartialEq)]
pub enum ExecutionState {
    Idle,
    Cached,
    Running,
    Success,
    Error(String),
}

/// A parsed executable block, stored inline inside a [`Segment::Block`].
///
/// Mirrors `httui_core::blocks::ParsedBlock` plus TUI-only fields
/// ([`id`](Self::id), [`state`](Self::state), [`cached_result`](Self::cached_result)).
/// `block_type` is a free-form string so new types (`graphql`, `grpc`, …)
/// plug in via `BlockTypeRegistry` without editing this struct.
#[derive(Debug, Clone)]
pub struct BlockNode {
    pub id: BlockId,
    pub block_type: String,
    pub alias: Option<String>,
    pub display_mode: Option<String>,
    pub params: Value,
    pub state: ExecutionState,
    pub cached_result: Option<Value>,
}

impl BlockNode {
    pub fn is_db(&self) -> bool {
        self.block_type == "db" || self.block_type.starts_with("db-")
    }

    pub fn is_http(&self) -> bool {
        self.block_type == "http"
    }

    pub fn is_e2e(&self) -> bool {
        self.block_type == "e2e"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn block(ty: &str) -> BlockNode {
        BlockNode {
            id: BlockId(0),
            block_type: ty.into(),
            alias: None,
            display_mode: None,
            params: json!({}),
            state: ExecutionState::Idle,
            cached_result: None,
        }
    }

    #[test]
    fn category_helpers_match_canonical_types() {
        assert!(block("http").is_http());
        assert!(block("e2e").is_e2e());
        assert!(block("db").is_db());
        assert!(block("db-postgres").is_db());
        assert!(block("db-mysql").is_db());
        assert!(block("db-sqlite").is_db());
    }

    #[test]
    fn category_helpers_reject_unrelated_types() {
        let g = block("graphql");
        assert!(!g.is_http());
        assert!(!g.is_e2e());
        assert!(!g.is_db());
    }
}
