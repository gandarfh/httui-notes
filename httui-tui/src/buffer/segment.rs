use ropey::Rope;

use crate::buffer::block::BlockNode;

/// A typed span in the document: either free-form prose (markdown text)
/// or a parsed executable block.
///
/// The segmented representation is the whole point of the TUI buffer
/// model — it avoids the class of bugs caused by widgets living inside
/// a single `contentEditable` rope (see `docs/tui-design.md` §1).
#[derive(Debug, Clone)]
pub enum Segment {
    Prose(Rope),
    Block(BlockNode),
}

impl Segment {
    pub fn is_prose(&self) -> bool {
        matches!(self, Segment::Prose(_))
    }

    pub fn is_block(&self) -> bool {
        matches!(self, Segment::Block(_))
    }

    pub fn as_prose(&self) -> Option<&Rope> {
        if let Segment::Prose(r) = self {
            Some(r)
        } else {
            None
        }
    }

    pub fn as_block(&self) -> Option<&BlockNode> {
        if let Segment::Block(b) = self {
            Some(b)
        } else {
            None
        }
    }
}
