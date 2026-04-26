//! Snapshot-based undo / redo. The whole document state goes onto the
//! past stack before each undoable command; `u` pops it, `<C-r>` puts
//! the future back.
//!
//! Cost: each snapshot clones `Vec<Segment>`. Ropes share data via
//! Ropey's CoW tree, and blocks are small structs — duplicates of an
//! unmodified document are cheap. The capacity (`DEFAULT_CAPACITY`)
//! caps the past at 100 commands so memory is bounded even for long
//! editing sessions.

use std::collections::VecDeque;

use crate::buffer::{Cursor, Segment};

const DEFAULT_CAPACITY: usize = 100;

#[derive(Debug, Clone)]
pub struct Snapshot {
    pub segments: Vec<Segment>,
    pub cursor: Cursor,
    pub next_block_id: u64,
}

#[derive(Debug)]
pub struct UndoStack {
    past: VecDeque<Snapshot>,
    future: Vec<Snapshot>,
    capacity: usize,
}

impl UndoStack {
    pub fn new() -> Self {
        Self {
            past: VecDeque::new(),
            future: Vec::new(),
            capacity: DEFAULT_CAPACITY,
        }
    }

    /// Record a snapshot of the current state. Drops the oldest entry
    /// when we hit the capacity ceiling. Pushing invalidates the redo
    /// stack — branching history would surprise users.
    pub fn push(&mut self, snap: Snapshot) {
        if self.past.len() == self.capacity {
            self.past.pop_front();
        }
        self.past.push_back(snap);
        self.future.clear();
    }

    /// Pop the most recent past snapshot and return it. Caller is
    /// responsible for handing the *current* state back via `push_redo`
    /// so the user can `<C-r>`.
    pub fn pop_undo(&mut self) -> Option<Snapshot> {
        self.past.pop_back()
    }

    pub fn push_redo(&mut self, snap: Snapshot) {
        self.future.push(snap);
    }

    pub fn pop_redo(&mut self) -> Option<Snapshot> {
        self.future.pop()
    }

    /// Caller side of the ledger: when a redo step replays, the now-old
    /// state goes back onto the past stack. Doesn't touch `future` —
    /// that's still a valid forward branch.
    pub fn push_past(&mut self, snap: Snapshot) {
        if self.past.len() == self.capacity {
            self.past.pop_front();
        }
        self.past.push_back(snap);
    }

    pub fn can_undo(&self) -> bool {
        !self.past.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.future.is_empty()
    }
}

impl Default for UndoStack {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ropey::Rope;

    fn snap(text: &str) -> Snapshot {
        Snapshot {
            segments: vec![Segment::Prose(Rope::from_str(text))],
            cursor: Cursor::InProse {
                segment_idx: 0,
                offset: 0,
            },
            next_block_id: 0,
        }
    }

    #[test]
    fn push_then_undo_returns_snapshot() {
        let mut s = UndoStack::new();
        s.push(snap("a"));
        let popped = s.pop_undo().unwrap();
        assert_eq!(popped.segments[0].as_prose().unwrap().to_string(), "a");
    }

    #[test]
    fn push_clears_future() {
        let mut s = UndoStack::new();
        s.push(snap("a"));
        s.push_redo(snap("b"));
        assert!(s.can_redo());
        s.push(snap("c"));
        assert!(!s.can_redo());
    }

    #[test]
    fn capacity_drops_oldest() {
        let mut s = UndoStack::new();
        s.capacity = 3;
        s.push(snap("a"));
        s.push(snap("b"));
        s.push(snap("c"));
        s.push(snap("d"));
        assert_eq!(s.past.len(), 3);
        // oldest is gone
        assert_eq!(
            s.pop_undo().unwrap().segments[0]
                .as_prose()
                .unwrap()
                .to_string(),
            "d"
        );
    }
}
