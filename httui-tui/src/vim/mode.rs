use ratatui::style::Color;

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    #[default]
    Normal,
    Insert,
    CommandLine,
    /// `/` (forward) or `?` (backward) prompt. Direction is stored on
    /// [`super::state::VimState::search_forward`].
    Search,
    /// `Ctrl+P` quick-open modal. Buffer + filtered results live on
    /// [`super::state::VimState::quickopen`].
    QuickOpen,
    /// File-tree sidebar focused. Editor stays painted but isn't
    /// receiving keys. Toggle with `Ctrl+E`; switch focus with Tab.
    Tree,
    /// Tree-driven prompt for `a`/`r`/`d` (create / rename / delete).
    /// The input UI lives in the status bar but the action it runs is
    /// a feature, not an ex command.
    TreePrompt,
    /// `v` — character-wise visual selection. Anchor lives on
    /// [`super::state::VimState::visual_anchor`]; the moving end is
    /// the document cursor. Motions extend, `d`/`c`/`y`/`x` operate.
    Visual,
    /// `V` — line-wise visual selection. Selects entire lines from
    /// the anchor's line to the cursor's line.
    VisualLine,
    /// `<CR>` on a DB result row opens a centered modal with the
    /// row's columns spelled out in full (JSON pretty-printed). All
    /// keys flow into the modal until it's dismissed; the editor
    /// underneath is frozen but kept painted.
    DbRowDetail,
    /// `:conn` on a DB block opens a small popup anchored to the
    /// block to swap its connection without leaving the editor.
    /// Up/Down (or `j`/`k`) navigate, Enter picks, Esc/Ctrl-C
    /// dismiss. Renders independently of mode (popup is painted
    /// while `App.connection_picker` is `Some`).
    ConnectionPicker,
}

impl Mode {
    pub fn label(&self) -> &'static str {
        match self {
            Mode::Normal => "NOR",
            Mode::Insert => "INS",
            Mode::CommandLine => "CMD",
            Mode::Search => "SEA",
            Mode::QuickOpen => "OPEN",
            Mode::Tree => "TREE",
            Mode::TreePrompt => "TREE",
            Mode::Visual => "VIS",
            Mode::VisualLine => "V-L",
            Mode::DbRowDetail => "ROW",
            Mode::ConnectionPicker => "CONN",
        }
    }

    pub fn bg(&self) -> Color {
        match self {
            Mode::Normal => Color::LightCyan,
            Mode::Insert => Color::LightYellow,
            Mode::CommandLine => Color::LightMagenta,
            Mode::Search => Color::LightGreen,
            Mode::QuickOpen => Color::LightBlue,
            Mode::Tree | Mode::TreePrompt => Color::Yellow,
            Mode::Visual | Mode::VisualLine => Color::LightRed,
            Mode::DbRowDetail => Color::LightBlue,
            Mode::ConnectionPicker => Color::LightBlue,
        }
    }

}

