//! `.` repeat machinery. Tracks the last edit-producing command so the
//! dispatcher can replay it on demand.
//!
//! Insert sessions are captured as a literal string of typed chars
//! (newlines included). Backspaces during the session pop chars from
//! the buffer; backspaces past the start are not recorded — `.` after
//! `i<text><BS><BS>foo<Esc>` replays only the net inserted text.
//!
//! What lives here vs. in [`super::parser::Action`]: `Action` is the
//! immediate translation of a keystroke. `ChangeRecord` is the
//! aggregated, replay-friendly description of an entire change unit.

use crate::vim::parser::{InsertPos, Motion, Operator, PastePos, TextObject};

/// One replayable edit. Constructed when a change command finishes
/// (operator returns, paste applies, or insert mode exits) and stashed
/// on [`super::state::VimState::last_change`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ChangeRecord {
    /// `dw`, `c$` (without insert), `y` are not recorded — yank doesn't
    /// modify. Delete-only operators land here.
    OperatorMotion(Operator, Motion, usize),
    OperatorLinewise(Operator, usize),
    OperatorTextObject(Operator, TextObject, usize),
    Paste(PastePos, usize),
    /// Plain insert session: `i…<Esc>`, `a…<Esc>`, `o…<Esc>`, etc.
    Insert { pos: InsertPos, typed: String },
    /// Change-then-insert: `cw…<Esc>`, `ci"…<Esc>`, `S…<Esc>`. Replays
    /// by re-applying the operator (which puts us in insert mode) and
    /// then re-typing the captured text.
    ChangeMotion {
        motion: Motion,
        op_count: usize,
        typed: String,
    },
    ChangeLinewise { op_count: usize, typed: String },
    ChangeTextObject {
        textobj: TextObject,
        op_count: usize,
        typed: String,
    },
}

/// Live capture of the current insert session. The dispatcher pushes
/// chars / pops on backspace as the user types; on `<Esc>` the result
/// becomes part of the new [`ChangeRecord`].
#[derive(Debug, Clone, Default)]
pub struct InsertSession {
    pub pos: Option<InsertPos>,
    /// `Some` when the insert was triggered by a change operator;
    /// determines which `ChangeRecord` variant to emit on exit.
    pub origin_op: Option<ChangeOrigin>,
    pub typed: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ChangeOrigin {
    Motion { motion: Motion, op_count: usize },
    Linewise { op_count: usize },
    TextObject { textobj: TextObject, op_count: usize },
}

impl InsertSession {
    pub fn start_plain(&mut self, pos: InsertPos) {
        self.pos = Some(pos);
        self.origin_op = None;
        self.typed.clear();
    }

    pub fn start_change(&mut self, origin: ChangeOrigin) {
        self.pos = None;
        self.origin_op = Some(origin);
        self.typed.clear();
    }

    pub fn push_char(&mut self, c: char) {
        self.typed.push(c);
    }

    pub fn push_newline(&mut self) {
        self.typed.push('\n');
    }

    pub fn pop_char(&mut self) {
        self.typed.pop();
    }

    pub fn finish(&mut self) -> Option<ChangeRecord> {
        let typed = std::mem::take(&mut self.typed);
        if let Some(origin) = self.origin_op.take() {
            self.pos = None;
            return Some(match origin {
                ChangeOrigin::Motion { motion, op_count } => ChangeRecord::ChangeMotion {
                    motion,
                    op_count,
                    typed,
                },
                ChangeOrigin::Linewise { op_count } => {
                    ChangeRecord::ChangeLinewise { op_count, typed }
                }
                ChangeOrigin::TextObject { textobj, op_count } => ChangeRecord::ChangeTextObject {
                    textobj,
                    op_count,
                    typed,
                },
            });
        }
        let pos = self.pos.take()?;
        Some(ChangeRecord::Insert { pos, typed })
    }
}
