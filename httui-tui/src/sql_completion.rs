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
    /// Reserved for Story 04.4b — schema-aware suggestions.
    #[allow(dead_code)]
    Table,
    /// Reserved for Story 04.4b — schema-aware suggestions.
    #[allow(dead_code)]
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

/// Build the candidate list for the popup. `prefix` is the partial
/// word the user has typed (already separated from surrounding
/// punctuation by the dispatcher). Empty prefix yields *all*
/// candidates — useful for an explicit `<C-Space>` trigger; the
/// auto-trigger path callers gate on `prefix.len() >= 1` themselves.
///
/// Sorted alphabetically by label so the same prefix always produces
/// the same popup ordering — UX wins from determinism here.
pub fn complete(dialect: Dialect, prefix: &str) -> Vec<CompletionItem> {
    let prefix_upper = prefix.to_ascii_uppercase();
    let mut out: Vec<CompletionItem> = Vec::new();

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
        let items = complete(Dialect::Generic, "sel");
        assert!(items.iter().any(|i| i.label == "SELECT"));
        assert!(items.iter().all(|i| i.label.starts_with("SEL")));
    }

    #[test]
    fn complete_includes_dialect_extras_for_postgres() {
        // Postgres adds RETURNING; generic doesn't.
        let pg = complete(Dialect::Postgres, "RETUR");
        assert!(pg.iter().any(|i| i.label == "RETURNING"));
        let gen = complete(Dialect::Generic, "RETUR");
        assert!(gen.iter().all(|i| i.label != "RETURNING"));
    }

    #[test]
    fn complete_includes_function_builtins_for_dialect() {
        // `date_t` should match `DATE_TRUNC` on Postgres but not on
        // SQLite (where it's not a standard function).
        let pg = complete(Dialect::Postgres, "date_t");
        assert!(pg.iter().any(|i| i.label == "DATE_TRUNC"));
        let sqlite = complete(Dialect::Sqlite, "date_t");
        assert!(sqlite.iter().all(|i| i.label != "DATE_TRUNC"));
    }

    #[test]
    fn complete_sorts_alphabetically() {
        // Sorted output makes the popup feel predictable across
        // keystrokes — the same prefix always produces the same
        // visual ordering.
        let items = complete(Dialect::Postgres, "co");
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
        let items = complete(Dialect::MySql, "");
        assert!(items.iter().any(|i| i.label == "STRAIGHT_JOIN"));
    }

    #[test]
    fn complete_dedups_keyword_function_overlap() {
        // `CASE` shows up as both a keyword and a Postgres function.
        // The popup should list it once, not twice.
        let items = complete(Dialect::Postgres, "CASE");
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
