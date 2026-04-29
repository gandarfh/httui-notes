//! SQL syntax highlighting via tree-sitter.
//!
//! Parses the SQL body once per render, walks the AST, and emits a
//! flat list of `(byte_start, byte_end, Style)` spans. The renderer
//! slices these per visual line so each `Line` in the `Paragraph` gets
//! its own correctly-styled spans.
//!
//! The same `tree-sitter` parse will back the future autocomplete /
//! goto-definition features — we keep the parser cached on a thread
//! local because `Parser` is not `Sync`.

use std::cell::RefCell;

use ratatui::{
    style::{Color, Modifier, Style},
    text::Span,
};
use tree_sitter::{Language, Node, Parser};

thread_local! {
    /// Lazily-initialized parser. Keeping it per-thread sidesteps the
    /// `!Sync` constraint without forcing every caller through a Mutex.
    static SQL_PARSER: RefCell<Option<Parser>> = const { RefCell::new(None) };
}

fn with_parser<R>(f: impl FnOnce(&mut Parser) -> R) -> Option<R> {
    SQL_PARSER.with(|cell| {
        let mut slot = cell.borrow_mut();
        if slot.is_none() {
            let mut p = Parser::new();
            // The sequel grammar is the most actively maintained
            // SQL fork on crates.io; covers PostgreSQL/MySQL/SQLite
            // common syntax.
            let lang: Language = tree_sitter_sequel::LANGUAGE.into();
            p.set_language(&lang).ok()?;
            *slot = Some(p);
        }
        Some(f(slot.as_mut().expect(
            "slot was set to Some on the line above (or already Some on entry)",
        )))
    })
}

/// Highlight an entire SQL document. Returns one `Vec<Span>` per
/// source line, in the same order as `query.lines()`. Empty / blank
/// queries yield a single empty line so the renderer still has
/// something to draw.
pub fn highlight(query: &str) -> Vec<Vec<Span<'static>>> {
    let bytes = query.as_bytes();
    let line_starts = compute_line_starts(query);

    // Tree-sitter is wired up but currently used only to keep the
    // parse cached for upcoming autocomplete; the grammar's node-kind
    // → style mapping is brittle, so highlighting itself goes through
    // a flat byte-level lexer for now. Parse output stays around for
    // future consumers (autocomplete, goto-definition).
    let _ = with_parser(|p| p.parse(query, None));
    let mut spans: Vec<StyledSpan> = manual_lex(query);
    // Sort by start, then end, so we can do a single forward pass per line.
    spans.sort_by_key(|s| (s.start, s.end));

    // Slice spans into one Vec<Span> per source line.
    let mut out: Vec<Vec<Span<'static>>> = Vec::new();
    let line_count = line_starts.len().max(1);
    for line_idx in 0..line_count {
        let line_start = line_starts[line_idx];
        let line_end = line_starts
            .get(line_idx + 1)
            .copied()
            .unwrap_or(bytes.len());
        // Trim trailing newline from the slice so the span doesn't
        // emit an extra blank cell at end-of-line.
        let content_end = if line_end > line_start && bytes.get(line_end - 1) == Some(&b'\n') {
            line_end - 1
        } else {
            line_end
        };
        out.push(line_spans(bytes, line_start, content_end, &spans));
    }
    if out.is_empty() {
        out.push(vec![Span::raw("")]);
    }
    out
}

#[derive(Debug, Clone, Copy)]
struct StyledSpan {
    start: usize,
    end: usize,
    style: Style,
}

/// Walk the AST and emit a styled span for each leaf node we want to
/// colorize. Tree-sitter SQL grammars classify keywords / strings /
/// numbers / comments at the leaf level — we hook into `node.kind()`
/// for the well-known cases.
// Kept for the future autocomplete path; the highlight pass
// currently uses `manual_lex` while we refine grammar mappings.
#[allow(dead_code)]
fn collect_spans(node: Node, bytes: &[u8], out: &mut Vec<StyledSpan>) {
    let kind = node.kind();
    let mut style = style_for_kind(kind);
    // Leaf node: also try to classify by raw text. This catches
    // grammars where keywords are anonymous tokens whose `kind()`
    // is the literal source — and where number / string nodes use
    // names we don't recognize.
    if style.is_none() && node.child_count() == 0 {
        let start = node.start_byte();
        let end = node.end_byte();
        if let Ok(text) = std::str::from_utf8(&bytes[start..end]) {
            style = classify_by_text(text);
        }
    }
    if let Some(style) = style {
        out.push(StyledSpan {
            start: node.start_byte(),
            end: node.end_byte(),
            style,
        });
        return;
    }
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        collect_spans(child, bytes, out);
    }
}

/// Flat byte-level lexer used when tree-sitter doesn't produce
/// useful spans. Mirrors the previous hand-rolled tokenizer:
/// keywords / strings / numbers / `--` comments. Stateless across
/// lines (multi-line strings / `/* */` not tracked).
fn manual_lex(query: &str) -> Vec<StyledSpan> {
    let kw = Style::default()
        .fg(Color::Cyan)
        .add_modifier(Modifier::BOLD);
    let string = Style::default().fg(Color::Yellow);
    let number = Style::default().fg(Color::LightBlue);
    let comment = Style::default()
        .fg(Color::DarkGray)
        .add_modifier(Modifier::ITALIC);
    let bytes = query.as_bytes();
    let mut out: Vec<StyledSpan> = Vec::new();
    let mut i = 0usize;
    while i < bytes.len() {
        let b = bytes[i];
        // Line comment.
        if b == b'-' && bytes.get(i + 1) == Some(&b'-') {
            let start = i;
            while i < bytes.len() && bytes[i] != b'\n' {
                i += 1;
            }
            out.push(StyledSpan {
                start,
                end: i,
                style: comment,
            });
            continue;
        }
        // Strings.
        if b == b'\'' || b == b'"' {
            let quote = b;
            let start = i;
            i += 1;
            while i < bytes.len() {
                if bytes[i] == quote {
                    if bytes.get(i + 1) == Some(&quote) {
                        i += 2;
                        continue;
                    }
                    i += 1;
                    break;
                }
                if bytes[i] == b'\n' {
                    break;
                }
                i += 1;
            }
            out.push(StyledSpan {
                start,
                end: i,
                style: string,
            });
            continue;
        }
        // Numbers.
        if b.is_ascii_digit() {
            let start = i;
            while i < bytes.len() && (bytes[i].is_ascii_digit() || bytes[i] == b'.') {
                i += 1;
            }
            out.push(StyledSpan {
                start,
                end: i,
                style: number,
            });
            continue;
        }
        // Identifiers — match against keyword list.
        if b.is_ascii_alphabetic() || b == b'_' {
            let start = i;
            while i < bytes.len() && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_') {
                i += 1;
            }
            if let Ok(word) = std::str::from_utf8(&bytes[start..i]) {
                if is_anonymous_keyword(word) {
                    out.push(StyledSpan {
                        start,
                        end: i,
                        style: kw,
                    });
                }
            }
            continue;
        }
        i += 1;
    }
    out
}

/// Last-resort classification from the raw token text. Fires for
/// leaf nodes whose `kind()` we couldn't recognize — most common
/// case is anonymous keyword tokens in tree-sitter SQL grammars.
#[allow(dead_code)]
fn classify_by_text(text: &str) -> Option<Style> {
    let kw = Style::default()
        .fg(Color::Cyan)
        .add_modifier(Modifier::BOLD);
    let string = Style::default().fg(Color::Yellow);
    let number = Style::default().fg(Color::LightBlue);
    let comment = Style::default()
        .fg(Color::DarkGray)
        .add_modifier(Modifier::ITALIC);
    if text.is_empty() {
        return None;
    }
    if text.starts_with("--") {
        return Some(comment);
    }
    if (text.starts_with('\'') && text.ends_with('\'') && text.len() >= 2)
        || (text.starts_with('"') && text.ends_with('"') && text.len() >= 2)
    {
        return Some(string);
    }
    let first = text
        .chars()
        .next()
        .expect("text is_empty checked at function entry");
    if first.is_ascii_digit() && text.chars().all(|c| c.is_ascii_digit() || c == '.') {
        return Some(number);
    }
    if is_anonymous_keyword(text) {
        return Some(kw);
    }
    None
}

#[allow(dead_code)]
fn style_for_kind(kind: &str) -> Option<Style> {
    let kw = Style::default()
        .fg(Color::Cyan)
        .add_modifier(Modifier::BOLD);
    let string = Style::default().fg(Color::Yellow);
    let number = Style::default().fg(Color::LightBlue);
    let comment = Style::default()
        .fg(Color::DarkGray)
        .add_modifier(Modifier::ITALIC);
    let func = Style::default().fg(Color::LightMagenta);
    // Tree-sitter SQL grammars expose two kinds of nodes for keywords:
    // some emit named nodes (`keyword_select`), others emit anonymous
    // tokens whose `kind()` is the literal source text (`SELECT`,
    // `select`). We accept both.
    match kind {
        // Strings — literal forms first, then named-rule variants.
        "literal_string" | "string" | "string_literal" => Some(string),
        // Numbers.
        "literal_number" | "number" | "int" | "integer" | "float" => Some(number),
        // Comments.
        "comment" | "marginalia" => Some(comment),
        // Built-in functions.
        "function" | "function_name" | "function_call" | "invocation" => Some(func),
        // Named keyword nodes (`keyword_select`, `select_keyword`, …).
        k if k.starts_with("keyword_") || k.ends_with("_keyword") => Some(kw),
        // Anonymous keyword tokens — the grammar emits them as the
        // raw source text. Match by uppercasing and checking against
        // a known list.
        k if is_anonymous_keyword(k) => Some(kw),
        _ => None,
    }
}

/// Treat any short alphabetic node-kind string as a keyword if it
/// uppercases to a known SQL reserved word. Tree-sitter anonymous
/// tokens have `kind()` return the literal source — `"SELECT"` or
/// `"select"` depending on case in input — so we normalize.
fn is_anonymous_keyword(kind: &str) -> bool {
    if kind.is_empty() || kind.len() > 16 {
        return false;
    }
    if !kind.chars().all(|c| c.is_ascii_alphabetic()) {
        return false;
    }
    let upper = kind.to_ascii_uppercase();
    matches!(
        upper.as_str(),
        "SELECT"
            | "FROM"
            | "WHERE"
            | "JOIN"
            | "INNER"
            | "OUTER"
            | "LEFT"
            | "RIGHT"
            | "FULL"
            | "CROSS"
            | "ON"
            | "USING"
            | "AND"
            | "OR"
            | "NOT"
            | "IN"
            | "BETWEEN"
            | "LIKE"
            | "ILIKE"
            | "IS"
            | "NULL"
            | "AS"
            | "ORDER"
            | "BY"
            | "GROUP"
            | "HAVING"
            | "LIMIT"
            | "OFFSET"
            | "INSERT"
            | "INTO"
            | "VALUES"
            | "UPDATE"
            | "SET"
            | "DELETE"
            | "CREATE"
            | "TABLE"
            | "INDEX"
            | "VIEW"
            | "DROP"
            | "ALTER"
            | "ADD"
            | "COLUMN"
            | "PRIMARY"
            | "KEY"
            | "FOREIGN"
            | "REFERENCES"
            | "CONSTRAINT"
            | "UNIQUE"
            | "CHECK"
            | "DEFAULT"
            | "BEGIN"
            | "COMMIT"
            | "ROLLBACK"
            | "TRANSACTION"
            | "IF"
            | "EXISTS"
            | "CASE"
            | "WHEN"
            | "THEN"
            | "ELSE"
            | "END"
            | "UNION"
            | "ALL"
            | "DISTINCT"
            | "WITH"
            | "RETURNING"
            | "RECURSIVE"
            | "EXCEPT"
            | "INTERSECT"
            | "ASC"
            | "DESC"
            | "TRUE"
            | "FALSE"
            | "EXPLAIN"
            | "ANALYZE"
            | "VACUUM"
            | "PRAGMA"
            | "TEMP"
            | "TEMPORARY"
            | "BOOLEAN"
            | "INTEGER"
            | "BIGINT"
            | "SMALLINT"
            | "DECIMAL"
            | "NUMERIC"
            | "VARCHAR"
            | "CHAR"
            | "TEXT"
            | "DATE"
            | "TIME"
            | "TIMESTAMP"
            | "INTERVAL"
            | "AUTOINCREMENT"
            | "SERIAL"
    )
}

/// Byte index of the first char of each line in `s`. Index 0 is
/// always present (start of doc); indices after match the byte
/// following each `\n`.
fn compute_line_starts(s: &str) -> Vec<usize> {
    let mut out = vec![0usize];
    for (i, b) in s.bytes().enumerate() {
        if b == b'\n' {
            out.push(i + 1);
        }
    }
    out
}

/// Build the spans for one source line by intersecting it with the
/// pre-computed AST styled ranges. Bytes outside any styled range
/// fall through to a default span.
fn line_spans(
    bytes: &[u8],
    line_start: usize,
    line_end: usize,
    spans: &[StyledSpan],
) -> Vec<Span<'static>> {
    let mut out: Vec<Span<'static>> = Vec::new();
    let mut cursor = line_start;
    for sp in spans {
        // Skip spans that end before the cursor or start after the line.
        if sp.end <= cursor {
            continue;
        }
        if sp.start >= line_end {
            break;
        }
        // Plain text gap before the styled span.
        let s_start = sp.start.max(cursor);
        let s_end = sp.end.min(line_end);
        if s_start > cursor {
            push_plain(bytes, cursor, s_start, &mut out);
        }
        push_styled(bytes, s_start, s_end, sp.style, &mut out);
        cursor = s_end;
    }
    if cursor < line_end {
        push_plain(bytes, cursor, line_end, &mut out);
    }
    if out.is_empty() {
        out.push(Span::raw(""));
    }
    out
}

fn push_plain(bytes: &[u8], start: usize, end: usize, out: &mut Vec<Span<'static>>) {
    if let Ok(s) = std::str::from_utf8(&bytes[start..end]) {
        out.push(Span::raw(s.to_string()));
    }
}

fn push_styled(bytes: &[u8], start: usize, end: usize, style: Style, out: &mut Vec<Span<'static>>) {
    if let Ok(s) = std::str::from_utf8(&bytes[start..end]) {
        out.push(Span::styled(s.to_string(), style));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn select_keyword_is_highlighted() {
        let lines = highlight("SELECT 1");
        assert_eq!(lines.len(), 1);
        // Some span should carry just `SELECT` styled as a keyword.
        let has_select_keyword = lines[0].iter().any(|s| {
            s.content == "SELECT"
                && s.style.fg == Some(Color::Cyan)
                && s.style.add_modifier.contains(Modifier::BOLD)
        });
        assert!(
            has_select_keyword,
            "expected a SELECT keyword span, got: {:?}",
            lines[0]
                .iter()
                .map(|s| s.content.as_ref())
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn empty_query_yields_one_empty_line() {
        let lines = highlight("");
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0][0].content, "");
    }

    #[test]
    fn multiline_query_splits_by_lines() {
        let lines = highlight("SELECT *\nFROM users");
        assert_eq!(lines.len(), 2);
    }
}
