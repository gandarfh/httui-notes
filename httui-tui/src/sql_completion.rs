//! SQL completion engine for the TUI.
//!
//! Story 04.4a — the popup infra + the keyword/builtin sources that
//! work without any schema knowledge. Story 04.4b adds the schema
//! source (tables/columns) on top, and 04.7 adds the `{{refs}}`
//! source. All three plug into the same `CompletionItem` shape and
//! popup widget.
//!
//! Why do we hand-roll keyword lists when desktop reuses
//! `@codemirror/lang-sql`? The TUI doesn't have a SQL grammar with a
//! token table we can just expose. tree-sitter's SQL grammar exists
//! in the project (cached in `ui::sql_highlight`) but its node-kinds
//! don't match a stable keyword set. Hard-coding ~80 keywords plus
//! per-dialect builtins is small, fast, and easy to extend.
//!
//! Filter is case-insensitive prefix match — the popup re-runs on
//! every keystroke so we don't need fuzzy here. Items sort
//! alphabetically by label, with category as the tie-breaker.

use crate::buffer::block::BlockNode;
use crate::schema::SchemaTable;

/// One row in the completion popup. The same shape is returned by
/// every source (keywords, schema, refs) so the popup widget renders
/// uniformly.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompletionItem {
    /// What gets inserted when the user accepts.
    pub label: String,
    /// Category — drives the dim suffix in the popup.
    pub kind: CompletionKind,
    /// Optional secondary string. Story 04.4b sets this to the
    /// column type (e.g. `text`, `int4`); 04.7 to `cached`/`no-result`.
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompletionKind {
    Keyword,
    Function,
    Table,
    Column,
    /// Reserved for Story 04.7 — `{{ref}}` autocomplete.
    #[allow(dead_code)]
    Reference,
}

impl CompletionKind {
    pub fn label(self) -> &'static str {
        match self {
            CompletionKind::Keyword => "keyword",
            CompletionKind::Function => "function",
            CompletionKind::Table => "table",
            CompletionKind::Column => "column",
            CompletionKind::Reference => "ref",
        }
    }
}

/// SQL dialect — picked from `block.block_type` (`db-postgres`,
/// `db-mysql`, `db-sqlite`). Drives which builtin list is used.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Dialect {
    Postgres,
    MySql,
    Sqlite,
    /// Generic fallback — ANSI keywords only, no dialect builtins.
    Generic,
}

impl Dialect {
    pub fn from_block(block: &BlockNode) -> Self {
        match block.block_type.as_str() {
            "db-postgres" => Dialect::Postgres,
            "db-mysql" => Dialect::MySql,
            "db-sqlite" => Dialect::Sqlite,
            _ => Dialect::Generic,
        }
    }
}

/// ANSI-ish keyword set shared across dialects. Covers the 80% the
/// average note will type. Sorted, deduped, all-uppercase canonical
/// form — the popup match is case-insensitive so `select` still
/// matches `SELECT`.
const ANSI_KEYWORDS: &[&str] = &[
    "ADD", "ALL", "ALTER", "AND", "ANALYZE", "AS", "ASC", "BEGIN",
    "BETWEEN", "BY", "CASCADE", "CASE", "CAST", "CHECK", "COLUMN",
    "COMMIT", "CONSTRAINT", "CREATE", "CROSS", "DEFAULT", "DELETE",
    "DESC", "DISTINCT", "DROP", "ELSE", "END", "EXCEPT", "EXISTS",
    "EXPLAIN", "FALSE", "FOREIGN", "FROM", "FULL", "GROUP", "HAVING",
    "IF", "IN", "INDEX", "INNER", "INSERT", "INTERSECT", "INTO", "IS",
    "JOIN", "KEY", "LEFT", "LIKE", "LIMIT", "NOT", "NULL", "OFFSET",
    "ON", "OR", "ORDER", "OUTER", "PRIMARY", "REFERENCES", "RIGHT",
    "ROLLBACK", "SELECT", "SET", "TABLE", "THEN", "TRUE", "UNION",
    "UNIQUE", "UPDATE", "USING", "VALUES", "VIEW", "WHEN", "WHERE",
    "WITH",
];

/// Postgres-flavored extras — keywords + dialect-specific syntax
/// like `RETURNING` and `ILIKE` that aren't in pure ANSI but show up
/// constantly in real notes.
const POSTGRES_KEYWORDS: &[&str] =
    &["ILIKE", "MATERIALIZED", "RECURSIVE", "RETURNING"];

/// MySQL extras — `IGNORE`, `REPLACE`, etc. Conservative list; the
/// engine accepts anything but we keep the popup focused on what
/// users actually type.
const MYSQL_KEYWORDS: &[&str] = &["IGNORE", "REPLACE", "STRAIGHT_JOIN"];

/// SQLite extras — `PRAGMA` is the big one; the rest mirror common
/// dialect-specific syntax.
const SQLITE_KEYWORDS: &[&str] =
    &["AUTOINCREMENT", "GLOB", "PRAGMA", "VACUUM"];

/// Postgres function builtins. Curated, not exhaustive — covers
/// aggregates, string manipulation, JSON, and the date/time helpers
/// users reach for daily.
const POSTGRES_FUNCTIONS: &[&str] = &[
    "ABS", "AVG", "CASE", "COALESCE", "COUNT", "CURRENT_DATE",
    "CURRENT_TIMESTAMP", "DATE_PART", "DATE_TRUNC", "EXTRACT",
    "GENERATE_SERIES", "GREATEST", "INITCAP", "JSONB_BUILD_OBJECT",
    "JSONB_EACH", "JSONB_EXTRACT_PATH", "LEAST", "LENGTH", "LOWER",
    "MAX", "MIN", "NOW", "NULLIF", "POSITION", "REGEXP_REPLACE",
    "REPLACE", "ROUND", "ROW_NUMBER", "STRING_AGG", "SUBSTRING", "SUM",
    "TO_CHAR", "TO_DATE", "TO_TIMESTAMP", "TRIM", "UPPER",
];

/// MySQL function builtins.
const MYSQL_FUNCTIONS: &[&str] = &[
    "ABS", "AVG", "CONCAT", "CONCAT_WS", "COUNT", "CURDATE",
    "CURRENT_DATE", "CURRENT_TIMESTAMP", "DATE_ADD", "DATE_FORMAT",
    "DATE_SUB", "DAY", "EXTRACT", "GREATEST", "GROUP_CONCAT", "HOUR",
    "IF", "IFNULL", "JSON_EXTRACT", "JSON_OBJECT", "LEAST", "LENGTH",
    "LOWER", "MAX", "MIN", "MONTH", "NOW", "NULLIF", "REPLACE",
    "ROUND", "ROW_NUMBER", "SUBSTRING", "SUM", "TIMESTAMP", "TRIM",
    "UPPER", "YEAR",
];

/// SQLite function builtins. Smaller list — SQLite has fewer
/// builtins. Includes `JSON_EXTRACT` for the JSON1 extension which
/// is commonly enabled.
const SQLITE_FUNCTIONS: &[&str] = &[
    "ABS", "AVG", "CASE", "COALESCE", "COUNT", "DATE", "DATETIME",
    "GROUP_CONCAT", "IFNULL", "JSON_EXTRACT", "JULIANDAY", "LENGTH",
    "LIKELY", "LOWER", "MAX", "MIN", "NULLIF", "PRINTF", "RANDOM",
    "REPLACE", "ROUND", "STRFTIME", "SUBSTR", "SUM", "TIME", "TRIM",
    "TYPEOF", "UNLIKELY", "UPPER",
];

/// What the cursor's surrounding SQL is asking for. The dispatcher
/// computes this from the body left of the cursor; the engine uses
/// it to decide whether to surface schema items, and which kind.
///
/// V1 detector handles the explicit cases that hit ~80% of typing:
/// `FROM`/`JOIN`/`INTO`/`UPDATE` → table; `<word>.` → columns of
/// that word. Anything else (mid-`SELECT`, `WHERE`, etc.) falls
/// through to `Open` — keyword/function popup. Scope-aware column
/// completion (extracting tables in scope from a SELECT) is V2.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SqlContext {
    /// No structural hint — show keywords and builtins only.
    Open,
    /// User is naming a table next: `FROM ⌷`, `JOIN ⌷`, `INTO ⌷`,
    /// `UPDATE ⌷`. Schema source contributes table names; keywords
    /// + builtins still appear (a subquery start with `SELECT` is
    /// legal here too).
    Table,
    /// User is naming a column on a known table: `users.⌷`. Schema
    /// source contributes that table's columns; keywords/builtins
    /// don't make sense after `<table>.` so they're suppressed.
    ColumnOf(String),
}

/// Walk the SQL left of the cursor and decide what category of
/// completion to surface. `anchor_offset` is where the *prefix*
/// word starts (same as `prefix_at_cursor`'s first return); we look
/// at what comes *before* that. Multi-line walk only on the current
/// line for V1 — `FROM` on a previous line still works most of the
/// time because users tend to put `FROM` and the table name on the
/// same line.
pub fn detect_context(body: &str, line: usize, anchor_offset: usize) -> SqlContext {
    let line_text = match body.lines().nth(line) {
        Some(s) => s,
        None => return SqlContext::Open,
    };
    let chars: Vec<char> = line_text.chars().collect();
    let take = anchor_offset.min(chars.len());
    let head: String = chars[..take].iter().collect();

    // Trailing dot? `<word>.` → ColumnOf(<word>).
    if head.ends_with('.') {
        let body_no_dot = &head[..head.len() - 1];
        // Walk back through `[A-Za-z0-9_]+` to extract the word.
        let table_start = body_no_dot
            .rfind(|c: char| !is_word_char(c))
            .map(|i| i + 1)
            .unwrap_or(0);
        let table = &body_no_dot[table_start..];
        if !table.is_empty() {
            return SqlContext::ColumnOf(table.to_string());
        }
        return SqlContext::Open;
    }

    // Trailing whitespace before the prefix → look at the last word
    // before the gap. `FROM` / `JOIN` / `INTO` (after INSERT) /
    // `UPDATE` open a table-naming spot.
    let trimmed = head.trim_end_matches(|c: char| c.is_whitespace());
    if trimmed.len() == head.len() {
        // No whitespace gap — the prefix sits glued to a non-word
        // char (a comma, a paren) or to the start of the line. None
        // of our trigger keywords apply in that shape.
        return SqlContext::Open;
    }
    let last_word_start = trimmed
        .rfind(|c: char| !is_word_char(c))
        .map(|i| i + 1)
        .unwrap_or(0);
    let last_word = &trimmed[last_word_start..];
    let upper = last_word.to_ascii_uppercase();
    if matches!(upper.as_str(), "FROM" | "JOIN" | "UPDATE" | "INTO") {
        return SqlContext::Table;
    }

    SqlContext::Open
}

/// Build the candidate list for the popup. `prefix` is the partial
/// word the user has typed; `context` is what the cursor's
/// surroundings hint at; `schema` is the in-memory schema cache for
/// the active connection (or `None` when not yet loaded). Schema
/// items lead, then keywords/builtins — except in `ColumnOf`, which
/// suppresses keywords entirely (a column name slot can't take a
/// keyword anyway).
///
/// Sorted alphabetically by label so the same prefix always produces
/// the same popup ordering — UX wins from determinism here.
pub fn complete(
    dialect: Dialect,
    prefix: &str,
    context: SqlContext,
    schema: Option<&[SchemaTable]>,
) -> Vec<CompletionItem> {
    let prefix_upper = prefix.to_ascii_uppercase();
    let mut out: Vec<CompletionItem> = Vec::new();

    // Schema source — only when we have a cache for this connection
    // and the context tells us what to surface.
    if let Some(tables) = schema {
        match &context {
            SqlContext::Table => {
                for t in tables {
                    if t.name.to_ascii_uppercase().starts_with(&prefix_upper) {
                        out.push(CompletionItem {
                            label: t.name.clone(),
                            kind: CompletionKind::Table,
                            detail: t.schema.clone(),
                        });
                    }
                }
            }
            SqlContext::ColumnOf(table_name) => {
                // Match the table name case-insensitively — users
                // often type `users.id` even if the schema name is
                // `Users` or quoted differently. V1 ignores aliases
                // (no scope analysis); a future story will track
                // `FROM users u` → alias `u` resolves to `users`.
                if let Some(table) = tables
                    .iter()
                    .find(|t| t.name.eq_ignore_ascii_case(table_name))
                {
                    for col in &table.columns {
                        if col
                            .name
                            .to_ascii_uppercase()
                            .starts_with(&prefix_upper)
                        {
                            out.push(CompletionItem {
                                label: col.name.clone(),
                                kind: CompletionKind::Column,
                                detail: col.data_type.clone(),
                            });
                        }
                    }
                }
                // ColumnOf suppresses keywords/builtins — return now
                // so the sort below sees only column items.
                out.sort_by(|a, b| a.label.cmp(&b.label));
                out.dedup_by(|a, b| a.label == b.label);
                return out;
            }
            SqlContext::Open => {}
        }
    }

    let keyword_lists: &[&[&str]] = match dialect {
        Dialect::Postgres => &[ANSI_KEYWORDS, POSTGRES_KEYWORDS],
        Dialect::MySql => &[ANSI_KEYWORDS, MYSQL_KEYWORDS],
        Dialect::Sqlite => &[ANSI_KEYWORDS, SQLITE_KEYWORDS],
        Dialect::Generic => &[ANSI_KEYWORDS],
    };
    for list in keyword_lists {
        for kw in *list {
            if kw.starts_with(&prefix_upper) {
                out.push(CompletionItem {
                    label: (*kw).to_string(),
                    kind: CompletionKind::Keyword,
                    detail: None,
                });
            }
        }
    }

    let fn_list: &[&str] = match dialect {
        Dialect::Postgres => POSTGRES_FUNCTIONS,
        Dialect::MySql => MYSQL_FUNCTIONS,
        Dialect::Sqlite => SQLITE_FUNCTIONS,
        Dialect::Generic => &[],
    };
    for fname in fn_list {
        if fname.starts_with(&prefix_upper) {
            out.push(CompletionItem {
                label: (*fname).to_string(),
                kind: CompletionKind::Function,
                detail: None,
            });
        }
    }

    // Stable sort: alphabetical by label, with kind as a deterministic
    // tie-breaker. The `Ord` impl below sets `Keyword < Function`, so
    // a token that exists in both lists (`CASE`, `COUNT`) keeps the
    // keyword variant when we dedup below.
    out.sort_by(|a, b| a.label.cmp(&b.label).then_with(|| a.kind.cmp(&b.kind)));
    // Dedup by label only — popup never shows the same word twice.
    // The tie-break in the sort above means we keep the keyword
    // variant when both kinds match, which is the more useful
    // categorization for the user.
    out.dedup_by(|a, b| a.label == b.label);
    out
}

// `Ord` for `CompletionKind` so the dedup tie-breaker is well-defined.
// Order is informational only (not user-facing).
impl PartialOrd for CompletionKind {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for CompletionKind {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        (*self as u8).cmp(&(*other as u8))
    }
}

/// Walk back from `(line, offset)` in `body` and return the start
/// offset of the current "word" (alphanumeric / underscore run) plus
/// the prefix string. Returns `None` when the cursor isn't in a
/// completable position (e.g. just after a non-word char or at line
/// start). The dispatcher uses this to decide whether to open the
/// popup and, when accepting, where to splice the chosen label in.
pub fn prefix_at_cursor(body: &str, line: usize, offset: usize) -> Option<(usize, String)> {
    let line_text = body.lines().nth(line)?;
    if offset > line_text.chars().count() {
        return None;
    }
    let chars: Vec<char> = line_text.chars().collect();
    // Walk backwards while the previous char is a word char. The
    // resulting `start` is where the prefix begins; everything from
    // there to `offset` is what the user has typed for the current
    // token.
    let mut start = offset;
    while start > 0 && is_word_char(chars[start - 1]) {
        start -= 1;
    }
    if start == offset {
        return None;
    }
    let prefix: String = chars[start..offset].iter().collect();
    Some((start, prefix))
}

fn is_word_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn complete_filters_keywords_by_prefix_case_insensitive() {
        // `sel` should surface SELECT (and only SELECT among ANSI).
        let items = complete(Dialect::Generic, "sel", SqlContext::Open, None);
        assert!(items.iter().any(|i| i.label == "SELECT"));
        assert!(items.iter().all(|i| i.label.starts_with("SEL")));
    }

    #[test]
    fn complete_includes_dialect_extras_for_postgres() {
        // Postgres adds RETURNING; generic doesn't.
        let pg = complete(Dialect::Postgres, "RETUR", SqlContext::Open, None);
        assert!(pg.iter().any(|i| i.label == "RETURNING"));
        let gen = complete(Dialect::Generic, "RETUR", SqlContext::Open, None);
        assert!(gen.iter().all(|i| i.label != "RETURNING"));
    }

    #[test]
    fn complete_includes_function_builtins_for_dialect() {
        // `date_t` should match `DATE_TRUNC` on Postgres but not on
        // SQLite (where it's not a standard function).
        let pg = complete(Dialect::Postgres, "date_t", SqlContext::Open, None);
        assert!(pg.iter().any(|i| i.label == "DATE_TRUNC"));
        let sqlite = complete(Dialect::Sqlite, "date_t", SqlContext::Open, None);
        assert!(sqlite.iter().all(|i| i.label != "DATE_TRUNC"));
    }

    #[test]
    fn complete_sorts_alphabetically() {
        // Sorted output makes the popup feel predictable across
        // keystrokes — the same prefix always produces the same
        // visual ordering.
        let items = complete(Dialect::Postgres, "co", SqlContext::Open, None);
        let labels: Vec<&str> = items.iter().map(|i| i.label.as_str()).collect();
        let mut sorted = labels.clone();
        sorted.sort_unstable();
        assert_eq!(labels, sorted);
    }

    #[test]
    fn complete_empty_prefix_returns_all_candidates_for_dialect() {
        // `<C-Space>` (manual force open) calls with empty prefix —
        // useful for "what's available?". MySQL list should be
        // non-empty and contain its own extras.
        let items = complete(Dialect::MySql, "", SqlContext::Open, None);
        assert!(items.iter().any(|i| i.label == "STRAIGHT_JOIN"));
    }

    #[test]
    fn complete_dedups_keyword_function_overlap() {
        // `CASE` shows up as both a keyword and a Postgres function.
        // The popup should list it once, not twice.
        let items = complete(Dialect::Postgres, "CASE", SqlContext::Open, None);
        let count = items.iter().filter(|i| i.label == "CASE").count();
        assert_eq!(count, 1);
    }

    #[test]
    fn prefix_at_cursor_returns_word_start_and_chars_typed() {
        // Cursor at the end of `SELE` → prefix is `SELE`, start is 0.
        let body = "SELE";
        let got = prefix_at_cursor(body, 0, 4).expect("has prefix");
        assert_eq!(got.0, 0);
        assert_eq!(got.1, "SELE");
    }

    #[test]
    fn prefix_at_cursor_walks_back_from_mid_word() {
        // `SELECT * FRO` — cursor at end → prefix `FRO`, start at 9.
        let body = "SELECT * FRO";
        let got = prefix_at_cursor(body, 0, 12).expect("has prefix");
        assert_eq!(got.1, "FRO");
        assert_eq!(got.0, 9);
    }

    #[test]
    fn prefix_at_cursor_returns_none_after_non_word_char() {
        // Cursor right after a space → no prefix to complete on.
        let body = "SELECT ";
        assert!(prefix_at_cursor(body, 0, 7).is_none());
    }

    #[test]
    fn prefix_at_cursor_handles_underscore_in_word() {
        // `DATE_TR` includes the underscore as part of the word so
        // mid-word completion still works.
        let body = "DATE_TR";
        let got = prefix_at_cursor(body, 0, 7).expect("has prefix");
        assert_eq!(got.0, 0);
        assert_eq!(got.1, "DATE_TR");
    }

    #[test]
    fn prefix_at_cursor_works_on_second_line() {
        // Multi-line bodies: line 1 starts after the first newline.
        let body = "SELECT *\nFROM us";
        let got = prefix_at_cursor(body, 1, 7).expect("has prefix");
        assert_eq!(got.1, "us");
    }

    // ───────────── SqlContext detection ─────────────
    //
    // The detector handles the four explicit table-naming positions
    // and the `<table>.` column-naming shape. Anything else returns
    // `Open` so we fall back to keywords + builtins.

    #[test]
    fn detect_context_after_from_returns_table() {
        // Cursor right after `FROM ` (anchor_offset=5, line=0).
        // Body left of anchor is `FROM ` → trim → `FROM` → Table.
        let ctx = detect_context("FROM ", 0, 5);
        assert_eq!(ctx, SqlContext::Table);
    }

    #[test]
    fn detect_context_mid_word_after_from_returns_table() {
        // `SELECT * FROM us|` → anchor at start of `us`. The walk
        // sees `SELECT * FROM ` left of the prefix and lands on
        // `FROM` as the last word.
        let body = "SELECT * FROM us";
        let ctx = detect_context(body, 0, 14); // `u` starts at col 14
        assert_eq!(ctx, SqlContext::Table);
    }

    #[test]
    fn detect_context_after_join_returns_table() {
        // `... JOIN orders` mid-word. Same shape as FROM.
        let ctx = detect_context("SELECT * FROM users JOIN o", 0, 25);
        assert_eq!(ctx, SqlContext::Table);
    }

    #[test]
    fn detect_context_after_into_returns_table() {
        // `INSERT INTO ⌷` — `INTO` is the trigger (the `INSERT`
        // word ahead of it doesn't matter for V1).
        let ctx = detect_context("INSERT INTO ", 0, 12);
        assert_eq!(ctx, SqlContext::Table);
    }

    #[test]
    fn detect_context_after_update_returns_table() {
        // `UPDATE ⌷` — table name slot.
        let ctx = detect_context("UPDATE ", 0, 7);
        assert_eq!(ctx, SqlContext::Table);
    }

    #[test]
    fn detect_context_after_word_dot_returns_column_of_word() {
        // `users.|` cursor right after the dot (no prefix yet).
        // `<word>.` is the explicit column-of pattern.
        let ctx = detect_context("SELECT users.", 0, 13);
        assert_eq!(ctx, SqlContext::ColumnOf("users".into()));
    }

    #[test]
    fn detect_context_word_dot_with_partial_column() {
        // `users.id|` — anchor at start of `id`; the `users.` left
        // of it triggers ColumnOf.
        let ctx = detect_context("SELECT users.id", 0, 13);
        assert_eq!(ctx, SqlContext::ColumnOf("users".into()));
    }

    #[test]
    fn detect_context_random_word_returns_open() {
        // `SELECT col` — anchor at start of `col`. Last word before
        // the prefix is `SELECT` (not a table-trigger), so Open.
        let ctx = detect_context("SELECT col", 0, 7);
        assert_eq!(ctx, SqlContext::Open);
    }

    #[test]
    fn detect_context_at_line_start_returns_open() {
        // No body left of cursor — nothing to trigger on.
        let ctx = detect_context("", 0, 0);
        assert_eq!(ctx, SqlContext::Open);
    }

    // ───────────── Schema source (Table / ColumnOf) ─────────────

    fn fake_schema() -> Vec<SchemaTable> {
        use crate::schema::SchemaColumn;
        vec![
            SchemaTable {
                schema: Some("public".into()),
                name: "users".into(),
                columns: vec![
                    SchemaColumn { name: "id".into(), data_type: Some("int4".into()) },
                    SchemaColumn { name: "email".into(), data_type: Some("text".into()) },
                    SchemaColumn { name: "name".into(), data_type: Some("text".into()) },
                ],
            },
            SchemaTable {
                schema: Some("public".into()),
                name: "orders".into(),
                columns: vec![
                    SchemaColumn { name: "id".into(), data_type: Some("int4".into()) },
                    SchemaColumn { name: "user_id".into(), data_type: Some("int4".into()) },
                ],
            },
        ]
    }

    #[test]
    fn complete_table_context_surfaces_schema_tables() {
        // Table context + schema cached → tables matching prefix
        // appear, alongside keywords/builtins (a `SELECT` subquery
        // is legal here too, so we keep the keywords).
        let schema = fake_schema();
        let items =
            complete(Dialect::Postgres, "us", SqlContext::Table, Some(&schema));
        let labels: Vec<&str> = items.iter().map(|i| i.label.as_str()).collect();
        assert!(labels.contains(&"users"), "users should be in: {labels:?}");
        // Detail carries the schema name so the popup can show
        // `users  (public)` later.
        let users_item = items.iter().find(|i| i.label == "users").unwrap();
        assert_eq!(users_item.kind, CompletionKind::Table);
        assert_eq!(users_item.detail.as_deref(), Some("public"));
    }

    #[test]
    fn complete_column_of_context_surfaces_only_columns() {
        // ColumnOf(users) — popup should list users' columns and
        // *no* keywords. `<users>.SELECT` doesn't make sense.
        let schema = fake_schema();
        let items = complete(
            Dialect::Postgres,
            "",
            SqlContext::ColumnOf("users".into()),
            Some(&schema),
        );
        let labels: Vec<&str> = items.iter().map(|i| i.label.as_str()).collect();
        assert_eq!(labels, vec!["email", "id", "name"]);
        assert!(items.iter().all(|i| i.kind == CompletionKind::Column));
    }

    #[test]
    fn complete_column_of_unknown_table_returns_empty() {
        // ColumnOf(nope) — table not in schema → no items at all
        // (and keywords stay suppressed by the column branch).
        let schema = fake_schema();
        let items = complete(
            Dialect::Postgres,
            "",
            SqlContext::ColumnOf("nope".into()),
            Some(&schema),
        );
        assert!(items.is_empty(), "got: {items:?}");
    }

    #[test]
    fn complete_column_of_table_name_match_is_case_insensitive() {
        // User wrote `Users.|` but the schema has `users`. V1 still
        // matches — case folding is friendlier than failing silently.
        let schema = fake_schema();
        let items = complete(
            Dialect::Postgres,
            "em",
            SqlContext::ColumnOf("Users".into()),
            Some(&schema),
        );
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].label, "email");
    }

    #[test]
    fn complete_table_context_with_no_schema_falls_back_to_keywords() {
        // Schema not yet cached (`None`) → no schema items, but
        // keywords/builtins still appear so the popup isn't empty.
        let items =
            complete(Dialect::Postgres, "SEL", SqlContext::Table, None);
        assert!(items.iter().any(|i| i.label == "SELECT"));
    }

    #[test]
    fn complete_table_context_keeps_keywords_alongside_tables() {
        // Verifies keywords keep showing up under Table ctx — a
        // user might be starting a subquery (`FROM (SELECT ...)`).
        let schema = fake_schema();
        let items =
            complete(Dialect::Postgres, "S", SqlContext::Table, Some(&schema));
        let labels: Vec<&str> = items.iter().map(|i| i.label.as_str()).collect();
        assert!(labels.contains(&"SELECT"));
    }

    #[test]
    fn dialect_from_block_maps_known_types() {
        // `db-postgres` → Postgres; unknown → Generic. Smoke test
        // for the reverse mapping the dispatcher uses.
        use crate::buffer::block::{BlockId, ExecutionState};
        let mk = |ty: &str| BlockNode {
            id: BlockId(0),
            block_type: ty.to_string(),
            alias: None,
            display_mode: None,
            params: serde_json::json!({}),
            state: ExecutionState::Idle,
            cached_result: None,
        };
        assert_eq!(Dialect::from_block(&mk("db-postgres")), Dialect::Postgres);
        assert_eq!(Dialect::from_block(&mk("db-mysql")), Dialect::MySql);
        assert_eq!(Dialect::from_block(&mk("db-sqlite")), Dialect::Sqlite);
        assert_eq!(Dialect::from_block(&mk("http")), Dialect::Generic);
    }
}
