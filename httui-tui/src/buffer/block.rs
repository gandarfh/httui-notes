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

    /// Resolve the block's *effective* display mode for the renderer.
    /// Honors the explicit `display_mode` token from the fence when
    /// present; otherwise falls back to "input" while idle (no result
    /// to show) and "split" once the block has produced one. Mirrors
    /// desktop's behavior so the same vault opens the same way in
    /// both apps.
    pub fn effective_display_mode(&self) -> DisplayMode {
        if let Some(m) = self
            .display_mode
            .as_deref()
            .and_then(DisplayMode::parse)
        {
            return m;
        }
        if self.cached_result.is_some() {
            DisplayMode::Split
        } else {
            DisplayMode::Input
        }
    }
}

/// Which sections of a block render inside its card.
///
/// - `Input` — only the editable body (SQL for DB, request line for HTTP).
/// - `Output` — only the result panel (status + table / messages / plan).
/// - `Split` — both, stacked.
///
/// Persisted as a fence token (`display=input|output|split`) by
/// `httui_core::blocks::serializer`. `BlockNode::display_mode` stays an
/// `Option<String>` to keep the parser/serializer roundtrip lossless;
/// this enum is the typed view callers actually want.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DisplayMode {
    Input,
    Output,
    Split,
}

impl DisplayMode {
    /// Wire format — same string the fence carries and that
    /// `httui_core::blocks::parser` reads back.
    pub fn as_str(self) -> &'static str {
        match self {
            DisplayMode::Input => "input",
            DisplayMode::Output => "output",
            DisplayMode::Split => "split",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "input" => Some(Self::Input),
            "output" => Some(Self::Output),
            "split" => Some(Self::Split),
            _ => None,
        }
    }

    /// Cycle order used by the `gd` keymap: Input → Split → Output → Input.
    /// Split sits in the middle so the most-useful modes (Input alone and
    /// Output alone) are always one keystroke apart through Split.
    pub fn next(self) -> Self {
        match self {
            DisplayMode::Input => DisplayMode::Split,
            DisplayMode::Split => DisplayMode::Output,
            DisplayMode::Output => DisplayMode::Input,
        }
    }

    pub fn shows_input(self) -> bool {
        matches!(self, DisplayMode::Input | DisplayMode::Split)
    }

    pub fn shows_output(self) -> bool {
        matches!(self, DisplayMode::Output | DisplayMode::Split)
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

    #[test]
    fn display_mode_roundtrip_through_wire_format() {
        for m in [DisplayMode::Input, DisplayMode::Output, DisplayMode::Split] {
            assert_eq!(DisplayMode::parse(m.as_str()), Some(m));
        }
        assert_eq!(DisplayMode::parse("anything-else"), None);
    }

    #[test]
    fn display_mode_cycle_visits_each_then_repeats() {
        // Input → Split → Output → Input. Three presses of `gd` from
        // any starting point land back where you began.
        let mut m = DisplayMode::Input;
        let visited: Vec<DisplayMode> = std::iter::from_fn(|| {
            m = m.next();
            Some(m)
        })
        .take(3)
        .collect();
        assert_eq!(
            visited,
            vec![DisplayMode::Split, DisplayMode::Output, DisplayMode::Input]
        );
    }

    #[test]
    fn effective_mode_defaults_to_input_when_idle() {
        // No explicit `display=` and no cached result yet — render
        // should hide the (empty) result panel and show only the
        // editable body. Same as desktop's default.
        let mut b = block("db-postgres");
        assert_eq!(b.effective_display_mode(), DisplayMode::Input);
        b.cached_result = Some(json!({ "results": [] }));
        // Producing a result flips the default to Split so the user
        // can see what they ran *and* what came back.
        assert_eq!(b.effective_display_mode(), DisplayMode::Split);
    }

    #[test]
    fn effective_mode_honors_explicit_token() {
        // An explicit `display=output` wins over the contextual
        // default — that's the whole point of persisting the choice.
        let mut b = block("db-postgres");
        b.display_mode = Some("output".into());
        assert_eq!(b.effective_display_mode(), DisplayMode::Output);
        b.display_mode = Some("garbage".into());
        // Unknown token → fall through to the contextual default,
        // not panic.
        assert_eq!(b.effective_display_mode(), DisplayMode::Input);
    }
}
