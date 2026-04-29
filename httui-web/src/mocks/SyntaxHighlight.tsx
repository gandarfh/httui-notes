import { Box } from "@chakra-ui/react";

/* ── JSON Syntax Highlighting ─────────────────────────── */

function highlightJson(code: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match: strings, numbers, booleans, null, keys
  const regex = /("(?:\\.|[^"\\])*")\s*(?=:)|("(?:\\.|[^"\\])*")|(true|false|null)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(code)) !== null) {
    // Push text before match
    if (match.index > lastIndex) {
      parts.push(code.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // Key (before colon)
      parts.push(<span key={match.index} style={{ color: "#79c0ff" }}>{match[1]}</span>);
    } else if (match[2]) {
      // String value
      parts.push(<span key={match.index} style={{ color: "#a5d6ff" }}>{match[2]}</span>);
    } else if (match[3]) {
      // boolean / null
      parts.push(<span key={match.index} style={{ color: "#ff7b72" }}>{match[3]}</span>);
    } else if (match[4]) {
      // number
      parts.push(<span key={match.index} style={{ color: "#d2a8ff" }}>{match[4]}</span>);
    }

    lastIndex = match.index + match[0].length;
  }

  // Push remaining text
  if (lastIndex < code.length) {
    parts.push(code.slice(lastIndex));
  }

  return parts;
}

/* ── SQL Syntax Highlighting ──────────────────────────── */

const SQL_KEYWORDS = new Set([
  "SELECT", "FROM", "WHERE", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "ON",
  "GROUP", "BY", "ORDER", "HAVING", "LIMIT", "OFFSET", "INSERT", "INTO",
  "VALUES", "UPDATE", "SET", "DELETE", "CREATE", "ALTER", "DROP", "TABLE",
  "INDEX", "AND", "OR", "NOT", "IN", "IS", "NULL", "AS", "COUNT", "SUM",
  "AVG", "MIN", "MAX", "DISTINCT", "DESC", "ASC", "LOWER", "UPPER",
]);

function highlightSql(code: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match: strings, numbers, keywords, identifiers
  const regex = /('(?:[^'\\]|\\.)*')|(-?\d+(?:\.\d+)?)|(\b[A-Za-z_]\w*\b)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      parts.push(code.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // String literal
      parts.push(<span key={match.index} style={{ color: "#a5d6ff" }}>{match[1]}</span>);
    } else if (match[2]) {
      // Number
      parts.push(<span key={match.index} style={{ color: "#d2a8ff" }}>{match[2]}</span>);
    } else if (match[3]) {
      if (SQL_KEYWORDS.has(match[3].toUpperCase())) {
        // SQL keyword
        parts.push(<span key={match.index} style={{ color: "#ff7b72" }}>{match[3]}</span>);
      } else {
        // Identifier (table/column name)
        parts.push(<span key={match.index} style={{ color: "#c9d1d9" }}>{match[3]}</span>);
      }
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < code.length) {
    parts.push(code.slice(lastIndex));
  }

  return parts;
}

/* ── Components ───────────────────────────────────────── */

interface CodeBlockProps {
  children: string;
  language?: "json" | "sql" | "plain";
}

export function CodeBlock({ children, language = "plain" }: CodeBlockProps) {
  let content: React.ReactNode;
  if (language === "json") {
    content = highlightJson(children);
  } else if (language === "sql") {
    content = highlightSql(children);
  } else {
    content = children;
  }

  return (
    <Box
      as="pre"
      fontFamily="mono"
      fontSize="xs"
      p={3}
      m={0}
      lineHeight="1.6"
      whiteSpace="pre"
      overflowX="auto"
      color="fg.muted"
    >
      {content}
    </Box>
  );
}
