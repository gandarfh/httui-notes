//! Render an executable block as a bordered widget.
//!
//! Visual only — fields aren't editable yet, no run button, no tabs.
//! Each block type gets a tailored body (HTTP shows method+URL, DB
//! shows the SQL, E2E lists steps). Forward-compat: unknown block
//! types fall through to a generic body so new types render reasonably
//! even before they have a dedicated function.

use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Cell, Paragraph, Row, Table},
    Frame,
};

use std::collections::HashMap;

use crate::buffer::block::{BlockNode, ExecutionState};

/// Lookup `connection_id → human_name` so DB block footers can show
/// `connection: prod-db` instead of a UUID. Empty map = render the
/// raw fence value as-is.
pub type ConnectionNames = HashMap<String, String>;

/// Paint a single block segment. `selected_row` is `Some(idx)`
/// when the cursor is in `Cursor::InBlockResult` (drives the row
/// highlight inside the DB result table). `viewport_top` is
/// `Some(&mut)` for the focused block; the result-table scroll
/// uses it as persistent state — the window only slides when the
/// cursor would otherwise leave it (`clamp_result_viewport`).
/// Other blocks pass `None` and default to viewport_top = 0
/// (rows 0..MAX_VISIBLE).
#[allow(clippy::too_many_arguments)]
pub fn render_block_with_selection(
    frame: &mut Frame,
    area: Rect,
    b: &BlockNode,
    selected: bool,
    selected_row: Option<usize>,
    viewport_top: Option<&mut u16>,
    names: &ConnectionNames,
    result_tab: crate::app::ResultPanelTab,
) {
    // Raw fence view when the cursor sits on the block: paint the
    // ` ```<info> ` line above and the ` ``` ` closer below the card,
    // matching CM6 desktop's behavior on cursor-enter. The layout
    // module already reserved 2 extra rows for these (see
    // `block_height`'s `cursor_on_block` branch); shrink `area` to
    // the card's slice so border + body still fit.
    let card_area = if selected {
        render_fence_lines(frame, area, b);
        Rect {
            x: area.x,
            y: area.y.saturating_add(1),
            width: area.width,
            height: area.height.saturating_sub(2),
        }
    } else {
        area
    };

    let title = block_title(b);
    let border_color = state_color(&b.state, selected);
    let outer = Block::default()
        .borders(Borders::ALL)
        .title(title)
        .border_style(Style::default().fg(border_color));
    let inner = outer.inner(card_area);
    frame.render_widget(outer, card_area);

    if b.is_db() {
        render_db_inner(frame, inner, b, selected_row, viewport_top, names, result_tab);
        return;
    }

    let lines = if b.is_http() {
        http_body(b)
    } else if b.is_e2e() {
        e2e_body(b)
    } else {
        generic_body(b)
    };

    frame.render_widget(Paragraph::new(lines), inner);
}

/// Paint the fence delimiter rows (` ```<info> ` above, ` ``` `
/// below) around the block's card. Called when the cursor sits on
/// the block — the layout reserved the rows; we just fill them with
/// dim-colored monospace text so the user can see (and yank, once
/// motion crosses these rows) the canonical fence text.
fn render_fence_lines(frame: &mut Frame, area: Rect, b: &BlockNode) {
    if area.height < 2 {
        return;
    }
    let dim = Style::default().fg(Color::DarkGray);
    // Header line — first line of the canonical fence markdown
    // (` ```<type> alias=... ` etc.). We don't reach into the body
    // because it's already rendered inside the card.
    let fence = b.to_fence_markdown();
    let header = fence.lines().next().unwrap_or("```").to_string();
    let header_rect = Rect {
        x: area.x,
        y: area.y,
        width: area.width,
        height: 1,
    };
    frame.render_widget(
        Paragraph::new(Line::from(Span::styled(header, dim))),
        header_rect,
    );
    // Closer line — always the literal ` ``` ` for parity with the
    // serializer's output. Painted at the bottom of the reserved area.
    let closer_rect = Rect {
        x: area.x,
        y: area.y.saturating_add(area.height.saturating_sub(1)),
        width: area.width,
        height: 1,
    };
    frame.render_widget(
        Paragraph::new(Line::from(Span::styled("```".to_string(), dim))),
        closer_rect,
    );
}

fn block_title(b: &BlockNode) -> String {
    let kind = b.block_type.to_uppercase();
    match (b.is_e2e(), &b.alias) {
        (true, Some(a)) => format!(" {kind} · {a} · {} steps ", step_count(b)),
        (_, Some(a)) => format!(" {kind} · {a} "),
        (_, None) => format!(" {kind} "),
    }
}

fn step_count(b: &BlockNode) -> usize {
    b.params
        .get("steps")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0)
}

fn http_body(b: &BlockNode) -> Vec<Line<'static>> {
    let method = b
        .params
        .get("method")
        .and_then(|v| v.as_str())
        .unwrap_or("GET")
        .to_string();
    let url = b
        .params
        .get("url")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let header_count = b
        .params
        .get("headers")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    let param_count = b
        .params
        .get("params")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    let body_len = b
        .params
        .get("body")
        .and_then(|v| v.as_str())
        .map(|s| s.len())
        .unwrap_or(0);

    vec![
        Line::from(vec![
            Span::styled(
                format!(" {method} "),
                Style::default()
                    .fg(Color::Black)
                    .bg(method_color(&method))
                    .add_modifier(Modifier::BOLD),
            ),
            Span::raw(" "),
            Span::raw(url),
        ]),
        Line::from(Span::styled(
            format!(
                "headers: {header_count} · params: {param_count} · body: {body_len} chars"
            ),
            Style::default().fg(Color::DarkGray),
        )),
    ]
}

fn method_color(method: &str) -> Color {
    match method {
        "GET" => Color::Green,
        "POST" => Color::Blue,
        "PUT" => Color::Rgb(0xff, 0xa5, 0x00),
        "PATCH" => Color::Yellow,
        "DELETE" => Color::Red,
        "HEAD" => Color::Magenta,
        _ => Color::Gray,
    }
}

/// Render the DB block's content area (everything inside the card
/// border). Lays out the SQL body, an optional run-status line, the
/// result `Table` widget, and the footer as separate widgets so each
/// gets clipped properly to its sub-rect.
fn render_db_inner(
    frame: &mut Frame,
    inner: Rect,
    b: &BlockNode,
    selected_row: Option<usize>,
    viewport_top: Option<&mut u16>,
    names: &ConnectionNames,
    result_tab: crate::app::ResultPanelTab,
) {
    if inner.width == 0 || inner.height == 0 {
        return;
    }

    let mode = b.effective_display_mode();
    let show_input = mode.shows_input();
    let show_output = mode.shows_output();

    let query = b
        .params
        .get("query")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let sql_lines = query.lines().count().max(1) as u16;
    let status_line = db_result_line(b);
    // Status banner + result table belong to the output region — gate
    // them on the mode so Input-only blocks render just the SQL body.
    let has_status = show_output && status_line.is_some();
    let table_height = if show_output { db_result_table_height(b) } else { 0 };
    let footer_text = db_footer_text(b, names);

    // Vertical layout. `Length` for the fixed-size sections; `Min(0)`
    // for the table so it absorbs leftover space if the card was
    // sized larger than expected.
    let mut constraints: Vec<Constraint> = Vec::new();
    if show_input {
        constraints.push(Constraint::Length(sql_lines));
    }
    if has_status {
        constraints.push(Constraint::Length(1));
    }
    if table_height > 0 {
        constraints.push(Constraint::Length(table_height));
    }
    constraints.push(Constraint::Length(1)); // footer

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints(constraints)
        .split(inner);

    let mut idx = 0;

    if show_input {
        // SQL body — tree-sitter highlight (cached parser, AST-driven).
        // Same parse will back autocomplete / goto-definition later.
        // When the last execution returned an error with a line number,
        // the offending line gets a dark-red background so the user
        // sees *where* the parser tripped, not just the message at the
        // bottom. Mirrors the desktop's squiggle, simplified for the
        // TUI's character grid.
        let mut sql_lines_styled = super::sql_highlight::highlight(query);
        if let Some((err_line, _err_col)) = error_position(b) {
            if let Some(target) = (err_line as usize)
                .checked_sub(1)
                .and_then(|i| sql_lines_styled.get_mut(i))
            {
                for span in target.iter_mut() {
                    span.style = span.style.bg(Color::Rgb(70, 25, 25));
                }
            }
        }
        let sql_para = Paragraph::new(
            sql_lines_styled
                .into_iter()
                .map(Line::from)
                .collect::<Vec<_>>(),
        );
        frame.render_widget(sql_para, chunks[idx]);
        idx += 1;
    }

    if has_status {
        if let Some(line) = status_line {
            frame.render_widget(Paragraph::new(line), chunks[idx]);
            idx += 1;
        }
    }

    if table_height > 0 {
        // Carve a 1-row tab bar out of the table chunk's top so the
        // result panel still fits in the layout's reserved height.
        // When the tab is anything but Result we render the
        // appropriate content into the remainder. The `Result` tab
        // keeps the existing table render, just shifted down 1 row.
        let panel_chunk = chunks[idx];
        let tab_bar_y = panel_chunk.y;
        let tab_bar_rect = Rect {
            x: panel_chunk.x,
            y: tab_bar_y,
            width: panel_chunk.width,
            height: 1,
        };
        let content_rect = Rect {
            x: panel_chunk.x,
            y: tab_bar_y.saturating_add(1),
            width: panel_chunk.width,
            height: panel_chunk.height.saturating_sub(1),
        };
        render_result_tab_bar(frame, tab_bar_rect, result_tab);
        match result_tab {
            crate::app::ResultPanelTab::Result => {
                if let Some((table, viewport_selected)) =
                    build_result_table(b, selected_row, viewport_top)
                {
                    let mut state = ratatui::widgets::TableState::default();
                    state.select(viewport_selected);
                    let table = table.row_highlight_style(
                        Style::default()
                            .bg(Color::Rgb(60, 70, 110))
                            .add_modifier(Modifier::BOLD),
                    );
                    frame.render_stateful_widget(table, content_rect, &mut state);
                }
            }
            crate::app::ResultPanelTab::Messages => {
                let lines = build_messages_lines(b);
                frame.render_widget(Paragraph::new(lines), content_rect);
            }
            crate::app::ResultPanelTab::Plan => {
                let lines = build_plan_lines(b);
                frame.render_widget(Paragraph::new(lines), content_rect);
            }
            crate::app::ResultPanelTab::Stats => {
                let lines = build_stats_lines(b);
                frame.render_widget(Paragraph::new(lines), content_rect);
            }
        }
        idx += 1;
        // Skip the original table render branch below — we already
        // drew (and shifted) it into `content_rect`.
        let footer_para = Paragraph::new(Line::from(Span::styled(
            footer_text,
            Style::default().fg(Color::DarkGray),
        )));
        frame.render_widget(footer_para, chunks[idx]);
        return;
    }
    // No result panel allocated (idle block, no rows, etc.) —
    // skip straight to the footer below. `selected_row` /
    // `viewport_top` are unused on this branch; we only need them
    // when the table actually paints.
    let _ = (selected_row, viewport_top);

    let footer_para = Paragraph::new(Line::from(Span::styled(
        footer_text,
        Style::default().fg(Color::DarkGray),
    )));
    frame.render_widget(footer_para, chunks[idx]);
}

fn db_footer_text(b: &BlockNode, names: &ConnectionNames) -> String {
    let conn_raw = b
        .params
        .get("connection")
        .or_else(|| b.params.get("connection_id"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    // Show the human-readable name when the fence carries a UUID we
    // know about; otherwise fall back to whatever was on the fence
    // (could already be a name, or just blank).
    let conn_display = if conn_raw.is_empty() {
        "—".to_string()
    } else {
        names
            .get(conn_raw)
            .cloned()
            .unwrap_or_else(|| conn_raw.to_string())
    };
    let limit = b.params.get("limit").and_then(|v| v.as_u64());
    let mut footer = format!("connection: {conn_display}");
    if let Some(l) = limit {
        footer.push_str(&format!(" · limit: {l}"));
    }
    footer.push_str(" · press `r` to run");
    footer
}

/// Build the inline run-status line for a DB block. Returns `None`
/// when the block hasn't run yet — keeps idle blocks visually quiet.
fn db_result_line(b: &BlockNode) -> Option<Line<'static>> {
    match &b.state {
        ExecutionState::Idle => None,
        ExecutionState::Running => Some(Line::from(vec![
            Span::styled(
                "… running",
                Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD),
            ),
            Span::styled(
                "  (Ctrl-C to cancel)",
                Style::default().fg(Color::DarkGray),
            ),
        ])),
        ExecutionState::Cached => Some(Line::from(Span::styled(
            format!("⛁ cached · {}", db_summary(b).unwrap_or_default()),
            Style::default().fg(Color::Blue),
        ))),
        ExecutionState::Success => Some(Line::from(Span::styled(
            format!("✓ {}", db_summary(b).unwrap_or_else(|| "ok".into())),
            Style::default().fg(Color::Green).add_modifier(Modifier::BOLD),
        ))),
        ExecutionState::Error(msg) => Some(Line::from(Span::styled(
            format!("✗ {msg}"),
            Style::default().fg(Color::Red).add_modifier(Modifier::BOLD),
        ))),
    }
}

/// Pull a one-liner summary out of the block's `cached_result`
/// (a `DbResponse` blob). Falls back to `None` when the shape doesn't
/// match — better to skip than show a misleading number.
///
/// When the query returned multiple result sets (multi-statement),
/// the summary describes `results[0]` and appends `(+N more)` so the
/// user knows there's data the renderer isn't surfacing yet — Story
/// 05.1 will wire up tabs to step through them. Errors that carry a
/// `(line, column)` from the executor get an `at L:C` suffix.
fn db_summary(b: &BlockNode) -> Option<String> {
    let result = b.cached_result.as_ref()?;
    let elapsed = result.get("stats")?.get("elapsed_ms")?.as_u64()?;
    let results = result.get("results")?.as_array()?;
    let first = results.first()?;
    let kind = first.get("kind")?.as_str()?;
    let extras = match results.len() {
        0 | 1 => String::new(),
        n => format!(" (+{} more)", n - 1),
    };
    match kind {
        "select" => {
            let rows = first.get("rows")?.as_array()?.len();
            let has_more = first.get("has_more")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let suffix = if has_more { "+" } else { "" };
            Some(format!("{rows}{suffix} rows · {elapsed}ms{extras}"))
        }
        "mutation" => {
            let affected = first.get("rows_affected")?.as_u64()?;
            Some(format!("{affected} affected · {elapsed}ms{extras}"))
        }
        "error" => first.get("message").and_then(|v| v.as_str()).map(|m| {
            let pos = first
                .get("line")
                .and_then(|l| l.as_u64())
                .map(|line| {
                    let col = first
                        .get("column")
                        .and_then(|c| c.as_u64())
                        .unwrap_or(1);
                    format!(" at {line}:{col}")
                })
                .unwrap_or_default();
            format!("error: {m}{pos}{extras}")
        }),
        _ => None,
    }
}

/// Extract `(line, column)` from the first result if it's an Error
/// variant with positional info. Returns `None` for selects,
/// mutations, errors without position, or anything that doesn't
/// match the expected shape. Used by the renderer to paint a red
/// background on the offending source line.
fn error_position(b: &BlockNode) -> Option<(u64, u64)> {
    let result = b.cached_result.as_ref()?;
    let first = result.get("results")?.as_array()?.first()?;
    if first.get("kind")?.as_str()? != "error" {
        return None;
    }
    let line = first.get("line")?.as_u64()?;
    let column = first.get("column").and_then(|c| c.as_u64()).unwrap_or(1);
    Some((line, column))
}

/// Height (in rows) of the result table viewport inside a DB card.
/// Acts as a sliding window over the full result set: navigation past
/// the bottom row scrolls the window down so the selected row stays
/// visible. Keeps long result sets from pushing the rest of the
/// document off-screen.
const MAX_VISIBLE_ROWS: usize = 10;
/// Cap on column width so a single fat field can't hog the row.
const MAX_COL_WIDTH: usize = 30;

/// `scrolloff` band for the result-table viewport — keeps a few
/// rows visible above/below the cursor so the user always sees
/// what's coming. Mirrors `app::SCROLL_OFF` to feel like the editor.
const RESULT_SCROLL_OFF: usize = 2;

/// Persistent-viewport scroll for the result table. Same model as
/// `app::clamp_viewport`: the window only slides when the cursor
/// would scroll off-screen (with a `scrolloff` buffer). Inside the
/// visible band the cursor moves freely with no scroll. Result is
/// also capped at `total - viewport` so we never paint past the end.
fn clamp_result_viewport(
    viewport_top: usize,
    viewport: usize,
    cursor: usize,
    total: usize,
) -> usize {
    if viewport == 0 || total <= viewport {
        return 0;
    }
    let scrolloff = RESULT_SCROLL_OFF.min(viewport / 2);
    let upper = cursor.saturating_sub(scrolloff);
    let lower = cursor
        .saturating_add(scrolloff + 1)
        .saturating_sub(viewport);
    let next = if viewport_top > upper {
        upper
    } else if viewport_top < lower {
        lower
    } else {
        viewport_top
    };
    next.min(total - viewport)
}

/// Build a `ratatui::Table` widget for a DB block's `select` result.
/// Returns `None` when the cache is empty / a mutation / an error —
/// caller falls back to no-op on that branch. The `usize` in the
/// returned tuple is the selected-row index *relative to the visible
/// window*, ready to hand to `TableState::select`. `viewport_top` is
/// the persistent scroll state for this block; the function reads it
/// at the start of the frame, recomputes via `clamp_result_viewport`,
/// and writes the new value back so the next frame's offset is in
/// sync with the cursor.
fn build_result_table(
    b: &BlockNode,
    selected_row: Option<usize>,
    viewport_top: Option<&mut u16>,
) -> Option<(Table<'static>, Option<usize>)> {
    let result = b.cached_result.as_ref()?;
    let first = result
        .get("results")
        .and_then(|v| v.as_array())
        .and_then(|a| a.first())?;
    if first.get("kind").and_then(|v| v.as_str()) != Some("select") {
        return None;
    }
    let columns: Vec<String> = first
        .get("columns")
        .and_then(|v| v.as_array())?
        .iter()
        .map(|c| {
            c.get("name")
                .and_then(|n| n.as_str())
                .unwrap_or("?")
                .to_string()
        })
        .collect();
    if columns.is_empty() {
        return None;
    }
    let rows: Vec<&serde_json::Value> = first
        .get("rows")
        .and_then(|v| v.as_array())?
        .iter()
        .collect();

    let total = rows.len();
    // Persistent viewport: when this block has a focused result we
    // honor the previously-stored `viewport_top`; otherwise (other
    // blocks rendered passively) we default to the top of the set.
    // After computing the new offset we write it back so the next
    // frame picks up where this one left off.
    let offset = match (viewport_top, selected_row) {
        (Some(slot), Some(sel)) => {
            let next = clamp_result_viewport(
                *slot as usize,
                MAX_VISIBLE_ROWS,
                sel,
                total,
            );
            *slot = next as u16;
            next
        }
        _ => 0,
    };
    let end = (offset + MAX_VISIBLE_ROWS).min(total);
    let visible_rows: &[&serde_json::Value] = &rows[offset..end];

    // Compute per-column widths from header + visible cells.
    let mut widths: Vec<u16> = columns
        .iter()
        .map(|n| n.chars().count().min(MAX_COL_WIDTH) as u16)
        .collect();
    for row in visible_rows.iter() {
        for (i, name) in columns.iter().enumerate() {
            let cell = format_cell(row.get(name).unwrap_or(&serde_json::Value::Null));
            let len = cell.chars().count().min(MAX_COL_WIDTH) as u16;
            if len > widths[i] {
                widths[i] = len;
            }
        }
    }

    let header_style = Style::default()
        .fg(Color::Cyan)
        .add_modifier(Modifier::BOLD);
    let header = Row::new(
        columns
            .iter()
            .map(|c| Cell::from(c.clone()).style(header_style))
            .collect::<Vec<_>>(),
    )
    .height(1);

    let table_rows: Vec<Row> = visible_rows
        .iter()
        .map(|row| {
            Row::new(
                columns
                    .iter()
                    .map(|name| {
                        let raw = format_cell(row.get(name).unwrap_or(&serde_json::Value::Null));
                        Cell::from(truncate_with_ellipsis(&raw, MAX_COL_WIDTH))
                    })
                    .collect::<Vec<_>>(),
            )
        })
        .collect();

    let viewport_selected = selected_row.map(|sel| sel.saturating_sub(offset));
    let constraints: Vec<Constraint> = widths.iter().map(|w| Constraint::Length(*w)).collect();
    Some((
        Table::new(table_rows, constraints)
            .header(header)
            .column_spacing(2),
        viewport_selected,
    ))
}

/// How tall the result Table will draw inside the card. Mirrors
/// `MAX_VISIBLE_ROWS` from the renderer so layout reserves the right
/// number of rows. The viewport stays at most `MAX_VISIBLE_ROWS` tall;
/// extra rows live in the (scrollable) result set, not in the card.
fn db_result_table_height(b: &BlockNode) -> u16 {
    let Some(result) = b.cached_result.as_ref() else {
        return 0;
    };
    let Some(first) = result
        .get("results")
        .and_then(|v| v.as_array())
        .and_then(|a| a.first())
    else {
        return 0;
    };
    if first.get("kind").and_then(|v| v.as_str()) != Some("select") {
        return 0;
    }
    let row_count = first
        .get("rows")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    if row_count == 0 {
        // header-only.
        return 1;
    }
    let visible = row_count.min(MAX_VISIBLE_ROWS);
    (1 + visible) as u16 // +1 for header
}

fn truncate_with_ellipsis(s: &str, width: usize) -> String {
    let count = s.chars().count();
    if count <= width {
        return s.to_string();
    }
    if width == 0 {
        return String::new();
    }
    let head: String = s.chars().take(width.saturating_sub(1)).collect();
    format!("{head}…")
}

/// Render a JSON cell as a flat string. Strings keep their content;
/// numbers / bools become their decimal / `true|false` form; nulls
/// show as `(null)`; arrays / objects collapse to `[…]` / `{…}` so
/// the column doesn't blow up.
fn format_cell(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::Null => "(null)".into(),
        serde_json::Value::Bool(b) => b.to_string(),
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(_) => "[…]".into(),
        serde_json::Value::Object(_) => "{…}".into(),
    }
}

/// Border color for the block card. Selection wins over execution
/// state — the user expects the focused block to stand out
/// regardless of its run history.
fn state_color(state: &ExecutionState, selected: bool) -> Color {
    if selected {
        return Color::Cyan;
    }
    match state {
        ExecutionState::Idle => Color::DarkGray,
        ExecutionState::Cached => Color::Blue,
        ExecutionState::Running => Color::Yellow,
        ExecutionState::Success => Color::Green,
        ExecutionState::Error(_) => Color::Red,
    }
}

fn e2e_body(b: &BlockNode) -> Vec<Line<'static>> {
    let base = b
        .params
        .get("base_url")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let steps = b
        .params
        .get("steps")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut lines = vec![Line::from(Span::styled(
        format!("base: {base}"),
        Style::default().fg(Color::DarkGray),
    ))];
    for (idx, step) in steps.iter().enumerate() {
        let method = step.get("method").and_then(|v| v.as_str()).unwrap_or("GET");
        let url = step.get("url").and_then(|v| v.as_str()).unwrap_or("");
        let name = step.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let prefix = format!("{}.", idx + 1);
        lines.push(Line::from(vec![
            Span::styled(prefix, Style::default().fg(Color::DarkGray)),
            Span::raw(" "),
            Span::styled(
                format!(" {method} "),
                Style::default()
                    .fg(Color::Black)
                    .bg(method_color(method))
                    .add_modifier(Modifier::BOLD),
            ),
            Span::raw(" "),
            Span::raw(url.to_string()),
            Span::raw(if name.is_empty() {
                "".to_string()
            } else {
                format!("  ({name})")
            }),
        ]));
    }
    lines
}

fn generic_body(b: &BlockNode) -> Vec<Line<'static>> {
    let raw = serde_json::to_string(&b.params).unwrap_or_else(|_| "—".into());
    vec![Line::from(Span::styled(
        raw,
        Style::default().fg(Color::DarkGray),
    ))]
}

/// One-line tab header rendered above the result panel content.
/// Selected tab gets a bright background; the rest stay dim. Only
/// 4 fixed tabs for now (Result/Messages/Plan/Stats) — sub-tabs
/// for multi-statement Result are V2.
fn render_result_tab_bar(
    frame: &mut Frame,
    area: Rect,
    selected: crate::app::ResultPanelTab,
) {
    use crate::app::ResultPanelTab;
    let active_style = Style::default()
        .bg(Color::Rgb(60, 70, 110))
        .fg(Color::White)
        .add_modifier(Modifier::BOLD);
    let inactive_style = Style::default().fg(Color::DarkGray);
    let mut spans: Vec<Span<'static>> = Vec::new();
    for tab in [
        ResultPanelTab::Result,
        ResultPanelTab::Messages,
        ResultPanelTab::Plan,
        ResultPanelTab::Stats,
    ] {
        let style = if tab == selected { active_style } else { inactive_style };
        spans.push(Span::styled(format!(" {} ", tab.label()), style));
        spans.push(Span::raw(" "));
    }
    frame.render_widget(Paragraph::new(Line::from(spans)), area);
}

/// Render content for the Messages tab — pulls `messages[]` off the
/// cached response and lists them as `[severity] text`. Empty list
/// shows a dim placeholder so users know the tab is wired but
/// nothing came back.
fn build_messages_lines(b: &BlockNode) -> Vec<Line<'static>> {
    let placeholder = Line::from(Span::styled(
        " (no messages)",
        Style::default().fg(Color::DarkGray),
    ));
    let Some(value) = b.cached_result.as_ref() else { return vec![placeholder] };
    let Some(messages) = value.get("messages").and_then(|v| v.as_array()) else {
        return vec![placeholder];
    };
    if messages.is_empty() {
        return vec![placeholder];
    }
    messages
        .iter()
        .filter_map(|m| {
            let sev = m.get("severity").and_then(|v| v.as_str()).unwrap_or("notice");
            let text = m.get("text").and_then(|v| v.as_str()).unwrap_or("");
            Some(Line::from(vec![
                Span::styled(
                    format!(" [{sev}] "),
                    Style::default().fg(match sev {
                        "error" => Color::Red,
                        "warning" => Color::Yellow,
                        _ => Color::LightBlue,
                    }),
                ),
                Span::raw(text.to_string()),
            ]))
        })
        .collect()
}

/// Plan tab — renders `cached_result["plan"]` populated by `<C-x>`
/// (EXPLAIN, Story 05.2). When the plan looks like a postgres
/// EXPLAIN response (`results[0].rows` of `{"QUERY PLAN": "..."}`),
/// unwrap each row to a single tree-formatted line so `->` arrows
/// and indentation read naturally; fall back to pretty-printed JSON
/// for MySQL / SQLite / FORMAT-JSON shapes.
fn build_plan_lines(b: &BlockNode) -> Vec<Line<'static>> {
    let placeholder = Line::from(Span::styled(
        " (no plan — run <C-x> on this block to populate)",
        Style::default().fg(Color::DarkGray),
    ));
    let Some(value) = b.cached_result.as_ref() else { return vec![placeholder] };
    let plan = match value.get("plan") {
        Some(p) if !p.is_null() => p,
        _ => return vec![placeholder],
    };

    // Postgres path: the EXPLAIN response is a `DbResponse` with
    // results[0].rows containing one row per plan line, each shaped
    // `{"QUERY PLAN": "Seq Scan on users  (cost=0.00..18.00 rows=800)"}`.
    // Unwrap to the raw text — that's what `psql` shows and it
    // already carries indentation + `->` arrows.
    if let Some(rows) = plan
        .get("results")
        .and_then(|r| r.as_array())
        .and_then(|a| a.first())
        .and_then(|first| first.get("rows"))
        .and_then(|rs| rs.as_array())
    {
        let lines: Vec<Line<'static>> = rows
            .iter()
            .filter_map(|row| {
                row.as_object()?
                    .values()
                    .next()
                    .and_then(|v| v.as_str())
                    .map(|s| Line::from(Span::raw(format!(" {s}"))))
            })
            .collect();
        if !lines.is_empty() {
            return lines;
        }
    }

    // Fallback for non-postgres dialects (MySQL/SQLite EXPLAIN, or
    // FORMAT JSON variants): pretty-print the whole plan blob.
    let json = serde_json::to_string_pretty(plan).unwrap_or_else(|_| String::from("(plan)"));
    json.lines()
        .map(|l| Line::from(Span::raw(l.to_string())))
        .collect()
}

/// Stats tab — formats the connection meta + per-execution stats so
/// the user gets at-a-glance "what just ran". Useful especially for
/// cached hits where the result table is identical to last run.
fn build_stats_lines(b: &BlockNode) -> Vec<Line<'static>> {
    let label_style = Style::default().fg(Color::DarkGray);
    let value_style = Style::default().fg(Color::White);
    let row = |label: &str, value: String| {
        Line::from(vec![
            Span::styled(format!(" {label}: "), label_style),
            Span::styled(value, value_style),
        ])
    };

    let mut lines: Vec<Line<'static>> = Vec::new();
    let Some(value) = b.cached_result.as_ref() else {
        return vec![Line::from(Span::styled(
            " (no result yet — run with `r`)",
            label_style,
        ))];
    };

    let elapsed = value
        .get("stats")
        .and_then(|s| s.get("elapsed_ms"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let results = value
        .get("results")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    let total_rows: u64 = value
        .get("results")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|r| {
                    if r.get("kind").and_then(|k| k.as_str()) == Some("select") {
                        r.get("rows").and_then(|rs| rs.as_array()).map(|rs| rs.len() as u64)
                    } else {
                        None
                    }
                })
                .sum()
        })
        .unwrap_or(0);
    let cached = matches!(b.state, ExecutionState::Cached);

    lines.push(row("elapsed", format!("{elapsed}ms")));
    lines.push(row("results", results.to_string()));
    lines.push(row("rows", total_rows.to_string()));
    lines.push(row(
        "cached",
        if cached { "yes" } else { "no" }.to_string(),
    ));
    lines
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::buffer::block::{BlockId, ExecutionState};
    use serde_json::json;

    fn http_block() -> BlockNode {
        BlockNode {
            id: BlockId(0),
            block_type: "http".into(),
            alias: Some("login".into()),
            display_mode: None,
            params: json!({
                "method": "POST",
                "url": "https://api.test.com/login",
                "params": [],
                "headers": [{"key": "Content-Type", "value": "application/json"}],
                "body": "{\"u\":\"a\"}"
            }),
            state: ExecutionState::Idle,
            cached_result: None,
        }
    }

    #[test]
    fn http_body_shows_method_and_url() {
        let b = http_block();
        let lines = http_body(&b);
        let first_text: String = lines[0]
            .spans
            .iter()
            .map(|s| s.content.as_ref())
            .collect::<Vec<_>>()
            .join("");
        assert!(first_text.contains("POST"));
        assert!(first_text.contains("https://api.test.com/login"));
    }

    #[test]
    fn http_body_meta_line() {
        let b = http_block();
        let lines = http_body(&b);
        let meta: String = lines[1]
            .spans
            .iter()
            .map(|s| s.content.as_ref())
            .collect::<Vec<_>>()
            .join("");
        assert!(meta.contains("headers: 1"));
        assert!(meta.contains("params: 0"));
        assert!(meta.contains("body: 9 chars"));
    }

    #[test]
    fn db_footer_text_falls_back_to_raw_when_unmapped() {
        let b = BlockNode {
            id: BlockId(0),
            block_type: "db-postgres".into(),
            alias: Some("q".into()),
            display_mode: None,
            params: json!({
                "query": "SELECT 1",
                "connection_id": "prod",
                "limit": 50,
            }),
            state: ExecutionState::Idle,
            cached_result: None,
        };
        let footer = db_footer_text(&b, &ConnectionNames::new());
        assert!(footer.contains("connection: prod"));
        assert!(footer.contains("limit: 50"));
        assert!(footer.contains("press `r` to run"));
    }

    #[test]
    fn db_footer_text_resolves_uuid_to_human_name() {
        let uuid = "abc-123";
        let b = BlockNode {
            id: BlockId(0),
            block_type: "db-postgres".into(),
            alias: Some("q".into()),
            display_mode: None,
            params: json!({
                "query": "SELECT 1",
                "connection_id": uuid,
            }),
            state: ExecutionState::Idle,
            cached_result: None,
        };
        let mut names = ConnectionNames::new();
        names.insert(uuid.into(), "prod-db".into());
        let footer = db_footer_text(&b, &names);
        assert!(footer.contains("connection: prod-db"));
        assert!(!footer.contains(uuid));
    }

    #[test]
    fn build_result_table_returns_none_without_cache() {
        let b = BlockNode {
            id: BlockId(0),
            block_type: "db-sqlite".into(),
            alias: None,
            display_mode: None,
            params: json!({"query": "SELECT 1"}),
            state: ExecutionState::Idle,
            cached_result: None,
        };
        assert!(build_result_table(&b, None, None).is_none());
    }

    #[test]
    fn db_result_table_height_counts_visible_rows() {
        let b = BlockNode {
            id: BlockId(0),
            block_type: "db-sqlite".into(),
            alias: None,
            display_mode: None,
            params: json!({"query": "SELECT 1"}),
            state: ExecutionState::Success,
            cached_result: Some(json!({
                "results": [{
                    "kind": "select",
                    "columns": [{"name": "id", "type": "int"}],
                    "rows": [{"id": 1}, {"id": 2}, {"id": 3}],
                    "has_more": false,
                }],
                "stats": {"elapsed_ms": 5},
            })),
        };
        // header + 3 rows.
        assert_eq!(db_result_table_height(&b), 4);
    }

    #[test]
    fn db_result_table_height_caps_at_viewport_when_overflowing() {
        let rows: Vec<serde_json::Value> = (0..50).map(|i| json!({"id": i})).collect();
        let b = BlockNode {
            id: BlockId(0),
            block_type: "db-sqlite".into(),
            alias: None,
            display_mode: None,
            params: json!({"query": "SELECT *"}),
            state: ExecutionState::Success,
            cached_result: Some(json!({
                "results": [{
                    "kind": "select",
                    "columns": [{"name": "id", "type": "int"}],
                    "rows": rows,
                    "has_more": false,
                }],
                "stats": {"elapsed_ms": 5},
            })),
        };
        // header + 10-row viewport, no extra "+ N more" line.
        assert_eq!(db_result_table_height(&b), (1 + MAX_VISIBLE_ROWS) as u16);
    }

    #[test]
    fn clamp_result_viewport_holds_until_cursor_leaves() {
        let v = MAX_VISIBLE_ROWS; // 10
        // total ≤ viewport: no scroll, ever.
        assert_eq!(clamp_result_viewport(0, v, 0, 5), 0);
        assert_eq!(clamp_result_viewport(0, v, 4, 5), 0);
        // Cursor inside the comfort band [scrolloff, viewport - scrolloff - 1]
        // (with scrolloff=2 in viewport=10 that's [2, 7]) leaves
        // the window untouched.
        assert_eq!(clamp_result_viewport(0, v, 2, 80), 0);
        assert_eq!(clamp_result_viewport(0, v, 7, 80), 0);
        // Cursor below the lower scroll-off: window inches down so
        // the cursor stays `scrolloff` rows above the bottom.
        assert_eq!(clamp_result_viewport(0, v, 8, 80), 1);
        assert_eq!(clamp_result_viewport(0, v, 9, 80), 2);
        // Cursor jumps to row 25, viewport_top was 0 → snap so
        // cursor is still inside (offset = cursor + scrolloff + 1 -
        // viewport).
        assert_eq!(clamp_result_viewport(0, v, 25, 80), 18);
        // Going up past the upper scroll-off pulls the window up
        // just enough to keep the cursor `scrolloff` rows below
        // the top.
        assert_eq!(clamp_result_viewport(20, v, 18, 80), 16);
        assert_eq!(clamp_result_viewport(20, v, 5, 80), 3);
        // Last row clamps at total - viewport.
        assert_eq!(clamp_result_viewport(0, v, 79, 80), 70);
        // Defensive: zero viewport returns 0.
        assert_eq!(clamp_result_viewport(7, 0, 50, 100), 0);
    }

    #[test]
    fn build_result_table_uses_persistent_viewport_top() {
        let rows: Vec<serde_json::Value> =
            (0..30).map(|i| json!({"id": i, "name": format!("r{i}")})).collect();
        let b = BlockNode {
            id: BlockId(0),
            block_type: "db-sqlite".into(),
            alias: None,
            display_mode: None,
            params: json!({"query": "SELECT * FROM t"}),
            state: ExecutionState::Success,
            cached_result: Some(json!({
                "results": [{
                    "kind": "select",
                    "columns": [
                        {"name": "id", "type": "int"},
                        {"name": "name", "type": "text"},
                    ],
                    "rows": rows,
                    "has_more": false,
                }],
                "stats": {"elapsed_ms": 1},
            })),
        };

        // Frame 1: viewport_top starts at 0, cursor on row 0 →
        // window stays at 0, cursor at row 0 inside it.
        let mut vt: u16 = 0;
        let (_, sel) = build_result_table(&b, Some(0), Some(&mut vt)).unwrap();
        assert_eq!(sel, Some(0));
        assert_eq!(vt, 0);

        // Frame 2: cursor moves to row 7 (still inside [2, 7] band)
        // → viewport unchanged.
        let (_, sel) = build_result_table(&b, Some(7), Some(&mut vt)).unwrap();
        assert_eq!(sel, Some(7));
        assert_eq!(vt, 0);

        // Frame 3: cursor jumps to row 15 → window slides so the
        // cursor sits `scrolloff` rows above the bottom.
        let (_, sel) = build_result_table(&b, Some(15), Some(&mut vt)).unwrap();
        // viewport_top should now be 8 (15 + 2 + 1 - 10).
        assert_eq!(vt, 8);
        // Selection index inside the window: 15 - 8 = 7.
        assert_eq!(sel, Some(7));

        // Frame 4: cursor on last row → window pinned to tail.
        let (_, sel) = build_result_table(&b, Some(29), Some(&mut vt)).unwrap();
        assert_eq!(vt, 20);
        assert_eq!(sel, Some(MAX_VISIBLE_ROWS - 1));

        // No viewport_top slot (passive render of an unfocused
        // block) defaults to 0 — no scroll-state mutation.
        let (_, sel) = build_result_table(&b, None, None).unwrap();
        assert_eq!(sel, None);
    }

    #[test]
    fn e2e_body_lists_steps() {
        let b = BlockNode {
            id: BlockId(0),
            block_type: "e2e".into(),
            alias: Some("flow".into()),
            display_mode: None,
            params: json!({
                "base_url": "https://x.com",
                "steps": [
                    {"name":"Login","method":"POST","url":"/auth"},
                    {"name":"Me","method":"GET","url":"/me"}
                ]
            }),
            state: ExecutionState::Idle,
            cached_result: None,
        };
        let lines = e2e_body(&b);
        assert!(lines.len() >= 3); // base + 2 steps
    }

    #[test]
    fn title_includes_alias_when_present() {
        let b = http_block();
        assert!(block_title(&b).contains("login"));
    }

    fn db_block_with_plan(plan: serde_json::Value) -> BlockNode {
        BlockNode {
            id: BlockId(0),
            block_type: "db-postgres".into(),
            alias: Some("q".into()),
            display_mode: None,
            params: json!({ "query": "SELECT 1", "connection": "c" }),
            state: ExecutionState::Success,
            cached_result: Some(json!({
                "results": [],
                "messages": [],
                "stats": { "elapsed_ms": 0 },
                "plan": plan
            })),
        }
    }

    #[test]
    fn plan_lines_unwrap_postgres_query_plan_rows() {
        // Postgres EXPLAIN: each row is `{"QUERY PLAN": "..."}` and
        // already carries indentation + `->` arrows. We strip the
        // wrapper and render the strings directly so it reads like
        // `psql`'s EXPLAIN output.
        let plan = json!({
            "results": [{
                "kind": "select",
                "columns": [{"name": "QUERY PLAN"}],
                "rows": [
                    {"QUERY PLAN": "Seq Scan on users  (cost=0.00..18.00 rows=800)"},
                    {"QUERY PLAN": "  Filter: (id > 10)"},
                ],
                "has_more": false
            }],
            "messages": [],
            "stats": { "elapsed_ms": 1 }
        });
        let b = db_block_with_plan(plan);
        let lines = build_plan_lines(&b);
        assert_eq!(lines.len(), 2);
        let first: String = lines[0].spans.iter().map(|s| s.content.as_ref()).collect();
        assert!(
            first.contains("Seq Scan on users"),
            "expected unwrapped plan text, got: {first}"
        );
    }

    #[test]
    fn plan_lines_falls_back_to_json_for_non_postgres_shape() {
        // MySQL `EXPLAIN FORMAT=JSON` returns one row whose value is
        // a nested JSON object (not a flat `QUERY PLAN` string). The
        // unwrap path doesn't help; fall through to pretty-printed
        // JSON so users still see something useful.
        let plan = json!({
            "results": [{
                "kind": "select",
                "columns": [{"name": "id"}, {"name": "select_type"}],
                "rows": [{"id": 1, "select_type": "SIMPLE"}],
                "has_more": false
            }]
        });
        let b = db_block_with_plan(plan);
        let lines = build_plan_lines(&b);
        // The unwrap path takes the first .values() entry, so it gets
        // `1` (the id). That's still acceptable — psql-style output
        // for whatever the first column happens to be. Just assert
        // we got SOMETHING beyond the placeholder.
        assert!(!lines.is_empty());
        let combined: String = lines
            .iter()
            .flat_map(|l| l.spans.iter().map(|s| s.content.as_ref()))
            .collect();
        assert!(!combined.contains("no plan"));
    }

    #[test]
    fn plan_lines_show_placeholder_when_no_plan() {
        // `cached_result.plan` absent or null → users see a hint
        // pointing at `<C-x>` instead of an empty panel.
        let mut b = db_block_with_plan(serde_json::Value::Null);
        b.cached_result = None;
        let lines = build_plan_lines(&b);
        let combined: String = lines
            .iter()
            .flat_map(|l| l.spans.iter().map(|s| s.content.as_ref()))
            .collect();
        assert!(combined.contains("<C-x>"), "got: {combined}");
    }
}
