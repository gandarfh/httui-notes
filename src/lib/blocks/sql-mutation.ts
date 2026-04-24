/**
 * Lightweight heuristics for SQL query classification. Used by the db block
 * toolbar to decide whether to prompt the user before running a potentially
 * dangerous statement.
 *
 * This is intentionally permissive and does NOT try to parse SQL — the
 * backend is the authority. The goal here is only to give the user a
 * chance to reconsider before the network round-trip.
 */

const MUTATION_PREFIXES = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "REPLACE",
  "MERGE",
  "TRUNCATE",
  "DROP",
  "CREATE",
  "ALTER",
  "RENAME",
  "GRANT",
  "REVOKE",
  "COMMIT",
  "ROLLBACK",
] as const;

/**
 * Strip -- line comments and /* block comments *\/ so the prefix check
 * works even when the query is heavily commented.
 */
function stripComments(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Return the first keyword at the start of the query, uppercased. */
function firstKeyword(sql: string): string {
  const cleaned = stripComments(sql).trimStart();
  const match = cleaned.match(/^([A-Za-z][A-Za-z_]*)/);
  return match ? match[1].toUpperCase() : "";
}

/** True if the query's leading keyword is a data-modifying or DDL statement. */
export function isMutationQuery(sql: string): boolean {
  const kw = firstKeyword(sql);
  return (MUTATION_PREFIXES as readonly string[]).includes(kw);
}

/**
 * True when the query is an UPDATE or DELETE that has no WHERE clause —
 * the classic "oops, touched every row" footgun. The check is regex-based
 * so subqueries / CTEs can fool it; still, it covers the 99% case.
 */
export function isUnscopedWriteQuery(sql: string): boolean {
  const cleaned = stripComments(sql).trim();
  // DELETE FROM … / UPDATE … without a subsequent WHERE keyword.
  const deleteRe = /^\s*DELETE\s+FROM\s+[\w".]+(?!.*\bWHERE\b)/is;
  const updateRe = /^\s*UPDATE\s+[\w".]+\s+SET\b(?!.*\bWHERE\b)/is;
  return deleteRe.test(cleaned) || updateRe.test(cleaned);
}

/**
 * Compose a human-readable reason for why the confirm prompt should fire.
 * Returns null when the query is safe to run without confirmation.
 */
export function describeDangerousQuery(
  sql: string,
  isReadonlyConnection: boolean,
): string | null {
  const mutation = isMutationQuery(sql);
  if (!mutation) return null;
  if (isReadonlyConnection) {
    return "This connection is marked read-only. The query modifies data.";
  }
  if (isUnscopedWriteQuery(sql)) {
    return "This DELETE/UPDATE has no WHERE clause — it will affect every row.";
  }
  return null;
}
