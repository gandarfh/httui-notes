//! Top tab bar. Renders one row showing every open tab; the active
//! one stands out via reversed colors.
//!
//! Layout note: the bar is only drawn when more than one tab is open;
//! a single-tab session keeps the editor full-height.

use ratatui::{
    layout::Rect,
    style::{Color, Modifier, Style},
    symbols,
    text::Line,
    widgets::Tabs,
    Frame,
};

use crate::app::TabBar;

pub fn render(frame: &mut Frame, area: Rect, tabs: &TabBar) {
    let titles: Vec<Line<'static>> = tabs
        .focused_paths()
        .iter()
        .enumerate()
        .map(|(i, path)| {
            let name = path
                .as_ref()
                .map(|p| {
                    p.file_name()
                        .map(|s| s.to_string_lossy().into_owned())
                        .unwrap_or_else(|| p.display().to_string())
                })
                .unwrap_or_else(|| "(no name)".into());
            Line::from(format!(" {} {} ", i + 1, name))
        })
        .collect();

    let widget = Tabs::new(titles)
        .select(tabs.active())
        .style(Style::default().fg(Color::DarkGray))
        .highlight_style(
            Style::default()
                .fg(Color::Black)
                .bg(Color::LightCyan)
                .add_modifier(Modifier::BOLD),
        )
        .divider(symbols::line::VERTICAL);
    frame.render_widget(widget, area);
}
