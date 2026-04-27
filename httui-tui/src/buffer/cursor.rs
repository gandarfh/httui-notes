/// Logical cursor position inside a [`Document`](crate::buffer::Document).
///
/// - `InProse` — cursor lives inside a prose run at a given char offset.
/// - `InBlock` — cursor lives inside a block's editable body (the SQL
///   of `db-*` blocks). `(line, offset)` indexes that body.
/// - `InBlockResult` — cursor is parked on a row of a DB block's
///   result table. Read-only: motions navigate rows but no operator
///   / insert action is allowed there.
/// - `InBlockFence` — cursor sits on the block's fence delimiter row
///   (` ```<info> ` header above the body, or ` ``` ` closer below).
///   Visible-only in the renderer's raw view (cursor on block); used
///   for transitioning into / out of the block via `j`/`k` and as the
///   landing spot for line-wise ops on the block as a whole.
// All four variants share the `In*` prefix — semantic, not stuttering.
#[allow(clippy::enum_variant_names)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Cursor {
    InProse {
        segment_idx: usize,
        offset: usize,
    },
    InBlock {
        segment_idx: usize,
        line: usize,
        offset: usize,
    },
    InBlockResult {
        segment_idx: usize,
        row: usize,
    },
    InBlockFence {
        segment_idx: usize,
        position: FencePosition,
    },
}

/// Which fence row the cursor is on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FencePosition {
    /// The ` ```<info> ` line above the block body.
    Header,
    /// The ` ``` ` line below the block body.
    Closer,
}

impl Cursor {
    /// The segment index this cursor currently addresses.
    pub fn segment_idx(&self) -> usize {
        match self {
            Cursor::InProse { segment_idx, .. } => *segment_idx,
            Cursor::InBlock { segment_idx, .. } => *segment_idx,
            Cursor::InBlockResult { segment_idx, .. } => *segment_idx,
            Cursor::InBlockFence { segment_idx, .. } => *segment_idx,
        }
    }
}
