//! Floating popup that lists SQL completion candidates inside a DB
//! block body. Lives independently of `Mode::Insert` (the user keeps
//! typing to filter) so the dispatcher hijacks a small set of keys
//! (`Tab`/`Enter`/`Esc`/`Ctrl-n`/`Ctrl-p`) and routes them here while
//! the popup is open.
//!
//! Anchored below the focused block — if there isn't enough room
//! below, fall back above. Same precedence as `connection_picker`,
//! but we keep the popup short (≤8 rows) so it doesn't dwarf the
//! editor while the user is typing a single keyword.
use ratatui::{
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, ListState},
    Frame,
};

use crate::app::CompletionPopupState;
use crate::ui::BlockAnchor;

/// At most this many rows in the popup body. Larger result sets
/// scroll via `ListState`'s selection-aware offset — the user
/// typically refines by typing more characters before scrolling.
const MAX_VISIBLE_ROWS: usize = 8;
/// Max popup width in cells. Long labels truncate visually; the
/// `detail` chip on the right shrinks first.
const POPUP_WIDTH: u16 = 36;

pub fn render(
    frame: &mut Frame,
    editor_area: Rect,
    state: &CompletionPopupState,
    anchor: Option<BlockAnchor>,
) {
    let popup = compute_popup_rect(editor_area, state, anchor);
    let bg_style = Style::default().bg(Color::Black).fg(Color::White);

    // Hard-fill so editor content doesn't bleed through. Same trick
    // as `connection_picker`/`quickopen` — `Clear` widget on the area
    // would also work but we already paint background style anyway.
    {
        let buf = frame.buffer_mut();
        for y in popup.y..popup.y.saturating_add(popup.height) {
            for x in popup.x..popup.x.saturating_add(popup.width) {
                if let Some(cell) = buf.cell_mut((x, y)) {
                    cell.set_symbol(" ");
                    cell.set_style(bg_style);
                }
            }
        }
    }

    let title = if state.prefix.is_empty() {
        " complete ".to_string()
    } else {
        format!(" complete · {} ", state.prefix)
    };
    let outer = Block::default()
        .borders(Borders::ALL)
        .title(title)
        .style(bg_style)
        .border_style(Style::default().fg(Color::LightCyan).bg(Color::Black));
    let inner = outer.inner(popup);
    frame.render_widget(outer, popup);

    let kind_style = Style::default().bg(Color::Black).fg(Color::DarkGray);
    let label_style = Style::default().bg(Color::Black).fg(Color::White);
    let items: Vec<ListItem> = state
        .items
        .iter()
        .map(|item| {
            ListItem::new(Line::from(vec![
                Span::styled(item.label.clone(), label_style),
                Span::styled(format!("  {}", item.kind.label()), kind_style),
            ]))
        })
        .collect();
    let list = List::new(items).style(bg_style).highlight_style(
        Style::default()
            .bg(Color::Rgb(60, 70, 110))
            .fg(Color::White)
            .add_modifier(Modifier::BOLD),
    );
    let mut list_state = ListState::default();
    list_state.select(Some(
        state.selected.min(state.items.len().saturating_sub(1)),
    ));
    frame.render_stateful_widget(list, inner, &mut list_state);
}

/// Compute the popup rect: prefer below the anchored block, fall
/// back above when there's no headroom. Centered fallback when the
/// block is off-screen (anchor is `None`). Width clamps to
/// `POPUP_WIDTH` or the editor area, whichever is smaller.
fn compute_popup_rect(
    editor_area: Rect,
    state: &CompletionPopupState,
    anchor: Option<BlockAnchor>,
) -> Rect {
    // Body rows = items capped at MAX, plus 2 for the borders.
    let body_rows =
        state.items.len().clamp(1, MAX_VISIBLE_ROWS) as u16;
    let popup_height = body_rows.saturating_add(2);
    let width = POPUP_WIDTH.min(editor_area.width.saturating_sub(2)).max(20);
    let x = editor_area
        .x
        .saturating_add((editor_area.width.saturating_sub(width)) / 2);

    if let Some(anchor) = anchor {
        let block_bottom = anchor
            .screen_top
            .saturating_add(anchor.height);
        let editor_bottom = editor_area.y.saturating_add(editor_area.height);
        // Try below first.
        if block_bottom.saturating_add(popup_height) <= editor_bottom {
            return Rect {
                x,
                y: block_bottom,
                width,
                height: popup_height,
            };
        }
        // Fallback above.
        if anchor.screen_top >= editor_area.y.saturating_add(popup_height) {
            return Rect {
                x,
                y: anchor.screen_top.saturating_sub(popup_height),
                width,
                height: popup_height,
            };
        }
    }

    // No anchor or no room above/below — center on the editor area.
    let y = editor_area
        .y
        .saturating_add((editor_area.height.saturating_sub(popup_height)) / 2);
    Rect {
        x,
        y,
        width,
        height: popup_height,
    }
}
