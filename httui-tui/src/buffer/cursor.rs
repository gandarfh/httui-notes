/// Logical cursor position inside a [`Document`](crate::buffer::Document).
///
/// - `InProse` — cursor lives inside a prose run at a given char offset.
/// - `InBlock` — cursor lives inside a block's editable body (the SQL
///   of `db-*` blocks). `(line, offset)` indexes that body.
/// - `InBlockResult` — cursor is parked on a row of a DB block's
///   result table. Read-only: motions navigate rows but no operator
///   / insert action is allowed there.
// All three variants share the `In*` prefix — semantic, not stuttering.
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
}

impl Cursor {
    /// The segment index this cursor currently addresses.
    pub fn segment_idx(&self) -> usize {
        match self {
            Cursor::InProse { segment_idx, .. } => *segment_idx,
            Cursor::InBlock { segment_idx, .. } => *segment_idx,
            Cursor::InBlockResult { segment_idx, .. } => *segment_idx,
        }
    }
}
