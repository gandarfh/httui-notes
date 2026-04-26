//! File-tree sidebar renderer. Two-column layout: indent guides per
//! depth + entry name. Folders are prefixed with `▾`/`▸` (expanded /
//! collapsed); files with two spaces.
//!
//! When `focused`, the title bar uses a brighter color and the
//! selected row is highlighted boldly so the user can see which pane
//! has keyboard focus.

use ratatui::{
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, ListState},
    Frame,
};

use crate::tree::FileTree;

const SIDEBAR_WIDTH: u16 = 30;

pub fn width() -> u16 {
    SIDEBAR_WIDTH
}

pub fn render(frame: &mut Frame, area: Rect, tree: &FileTree, focused: bool) {
    let (border_color, title_style) = if focused {
        (Color::LightYellow, Style::default().fg(Color::LightYellow).add_modifier(Modifier::BOLD))
    } else {
        (Color::DarkGray, Style::default().fg(Color::Gray))
    };
    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(border_color))
        .title(Span::styled(" Files ", title_style));
    let inner = block.inner(area);
    frame.render_widget(block, area);

    let items: Vec<ListItem> = tree
        .entries
        .iter()
        .map(|node| {
            let indent = "  ".repeat(node.depth);
            let icon = if node.is_dir {
                if tree.expanded.contains(&node.path) {
                    "▾ "
                } else {
                    "▸ "
                }
            } else {
                "  "
            };
            let name_style = if node.is_dir {
                Style::default().fg(Color::LightCyan)
            } else {
                Style::default()
            };
            let line = Line::from(vec![
                Span::raw(indent),
                Span::styled(icon, Style::default().fg(Color::DarkGray)),
                Span::styled(node.name.clone(), name_style),
            ]);
            ListItem::new(line)
        })
        .collect();

    let highlight_style = if focused {
        Style::default()
            .bg(Color::Yellow)
            .fg(Color::Black)
            .add_modifier(Modifier::BOLD)
    } else {
        Style::default().bg(Color::DarkGray).fg(Color::White)
    };

    let list = List::new(items)
        .highlight_style(highlight_style)
        .highlight_symbol("");
    let mut state = ListState::default();
    if !tree.entries.is_empty() {
        state.select(Some(tree.selected.min(tree.entries.len() - 1)));
    }
    frame.render_stateful_widget(list, inner, &mut state);
}
