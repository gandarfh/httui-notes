use ratatui::{
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::Paragraph,
    Frame,
};

use crate::app::{App, StatusKind};
use crate::buffer::{Cursor, Document, Segment};
use crate::tree::TreePromptKind;
use crate::vim::mode::Mode;

pub fn render_status_bar(frame: &mut Frame, area: Rect, app: &App) {
    // Priority: command-line prompt > tree prompt > search prompt > status > info.
    if app.vim.mode == Mode::CommandLine {
        let line = Line::from(vec![Span::raw(format!(":{}", app.vim.cmdline.as_str()))]);
        frame.render_widget(Paragraph::new(line), area);
        return;
    }

    if app.vim.mode == Mode::TreePrompt {
        if let Some(prompt) = app.tree.prompt.as_ref() {
            let label = match &prompt.kind {
                TreePromptKind::Create { dir } => {
                    if dir.is_empty() {
                        "new file: ".to_string()
                    } else {
                        format!("new file in {dir}/: ")
                    }
                }
                TreePromptKind::Rename { from } => format!("rename {from} → "),
                TreePromptKind::Delete { target } => {
                    format!("delete {target}? (y/N) ")
                }
            };
            let line = Line::from(vec![
                Span::styled(label, Style::default().fg(Color::LightYellow)),
                Span::raw(prompt.buffer().to_string()),
            ]);
            frame.render_widget(Paragraph::new(line), area);
        }
        return;
    }

    if app.vim.mode == Mode::Search {
        let prompt = if app.vim.search_forward { '/' } else { '?' };
        let line = Line::from(vec![Span::raw(format!("{prompt}{}", app.vim.search_buf.as_str()))]);
        frame.render_widget(Paragraph::new(line), area);
        return;
    }

    // Mode::FenceEdit renders as a popup over the block (see
    // `ui::fence_edit`), not in the status bar. We deliberately don't
    // handle that mode here — falling through paints the normal
    // file/vault status line so the user keeps a visible reference
    // to which file the popup is editing.

    if let Some(msg) = app.status_message.as_ref() {
        let style = match msg.kind {
            StatusKind::Info => Style::default(),
            StatusKind::Error => Style::default()
                .fg(Color::White)
                .bg(Color::Red)
                .add_modifier(Modifier::BOLD),
        };
        let line = Line::from(vec![Span::styled(format!(" {}", msg.text), style)]);
        frame.render_widget(Paragraph::new(line), area);
        return;
    }

    let vault = app.vault_path.to_string_lossy().into_owned();
    let dirty_marker = if app.document().is_some_and(|d| d.is_dirty()) {
        " ·●"
    } else {
        ""
    };
    let file = app
        .document_path()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| "(no file)".into());

    let block_count = app
        .document()
        .map(count_blocks)
        .unwrap_or(0);

    let cursor_label = app
        .document()
        .map(describe_cursor)
        .unwrap_or_else(|| "—".into());

    let mode = app.vim.mode;
    // Active environment chip — only emits when an env is set as
    // active; otherwise we skip the section entirely so the status
    // bar stays compact for vaults that don't use envs.
    let env_chip: Vec<Span<'static>> = match app.active_env_name.as_deref() {
        Some(name) => vec![
            Span::raw(" "),
            Span::styled(
                format!(" env: {name} "),
                Style::default()
                    .fg(Color::Black)
                    .bg(Color::LightMagenta)
                    .add_modifier(Modifier::BOLD),
            ),
        ],
        None => Vec::new(),
    };
    let mut spans = vec![Span::styled(
        format!(" {} ", mode.label()),
        Style::default()
            .fg(Color::Black)
            .bg(mode.bg())
            .add_modifier(Modifier::BOLD),
    )];
    spans.extend(env_chip);
    spans.push(Span::raw(format!(
        " {file}{dirty_marker} · {block_count} blocks · {cursor_label} · vault: {vault} · theme: {}",
        app.config.theme
    )));
    let line = Line::from(spans);
    frame.render_widget(Paragraph::new(line), area);
}

fn count_blocks(doc: &Document) -> usize {
    doc.segments()
        .iter()
        .filter(|s| matches!(s, Segment::Block(_)))
        .count()
}

fn describe_cursor(doc: &Document) -> String {
    match doc.cursor() {
        Cursor::InProse {
            segment_idx,
            offset,
        } => {
            if let Some(Segment::Prose(rope)) = doc.segments().get(segment_idx) {
                let off = offset.min(rope.len_chars());
                let line = rope.char_to_line(off) + 1;
                let col = off - rope.line_to_char(line - 1) + 1;
                format!("Ln {line} Col {col}")
            } else {
                "Ln ? Col ?".into()
            }
        }
        Cursor::InBlock {
            segment_idx,
            offset,
        } => {
            use crate::buffer::block::{raw_section_at, RawSection};
            let block_idx = doc
                .segments()
                .iter()
                .take(segment_idx + 1)
                .filter(|s| matches!(s, Segment::Block(_)))
                .count();
            let raw = match doc.segments().get(segment_idx) {
                Some(Segment::Block(b)) => &b.raw,
                _ => return format!("Block #{block_idx} · ?"),
            };
            match raw_section_at(raw, offset) {
                RawSection::Header => format!("Block #{block_idx} · fence ```"),
                RawSection::Closer => format!("Block #{block_idx} · fence ```"),
                RawSection::Body { line, col } => {
                    format!("Block #{block_idx} · Ln {} Col {}", line + 1, col + 1)
                }
            }
        }
        Cursor::InBlockResult { segment_idx, row } => {
            let block_idx = doc
                .segments()
                .iter()
                .take(segment_idx + 1)
                .filter(|s| matches!(s, Segment::Block(_)))
                .count();
            format!("Block #{block_idx} · Result row {}", row + 1)
        }
    }
}
