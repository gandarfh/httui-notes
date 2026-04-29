/**
 * Parser and serializer for DB block fenced-code info strings.
 *
 * New format (post-redesign):
 *   ```db-postgres alias=db1 connection=prod limit=100 timeout=30000 display=split
 *   SELECT * FROM users;
 *   ```
 *
 * Legacy format (pre-redesign, still supported on read):
 *   ```db-postgres alias=db1 displayMode=split
 *   {"connection_id":"<uuid>","query":"SELECT * FROM users","timeout_ms":30000}
 *   ```
 *
 * Rules:
 * - Tokens separated by whitespace; `key=value` (no spaces, no quotes — MVP).
 * - Order does not matter on read; canonical order on write is:
 *   `alias → connection → limit → timeout → display`.
 *   This guarantees deterministic roundtrip and clean git diffs.
 * - Unknown keys are ignored silently.
 * - Invalid values are ignored silently (no throw).
 */

export type DbDialect = "postgres" | "mysql" | "sqlite" | "generic";

export type DbDisplayMode = "input" | "split" | "output";

export interface DbBlockMetadata {
  dialect: DbDialect;
  alias?: string;
  connection?: string;
  limit?: number;
  timeoutMs?: number;
  displayMode?: DbDisplayMode;
}

const DIALECT_FROM_TOKEN: Record<string, DbDialect> = {
  db: "generic",
  "db-postgres": "postgres",
  "db-mysql": "mysql",
  "db-sqlite": "sqlite",
};

const DIALECT_TO_TOKEN: Record<DbDialect, string> = {
  generic: "db",
  postgres: "db-postgres",
  mysql: "db-mysql",
  sqlite: "db-sqlite",
};

const DISPLAY_MODES: readonly DbDisplayMode[] = ["input", "split", "output"];

/**
 * Parse a fenced-code info string into structured metadata.
 * Returns null if the head token is not a recognized db dialect.
 */
export function parseDbFenceInfo(info: string): DbBlockMetadata | null {
  const parts = info.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const dialect = DIALECT_FROM_TOKEN[parts[0]];
  if (!dialect) return null;

  const meta: DbBlockMetadata = { dialect };

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);

    switch (key) {
      case "alias":
        if (value.length > 0) meta.alias = value;
        break;
      case "connection":
        if (value.length > 0) meta.connection = value;
        break;
      case "limit": {
        const n = Number(value);
        if (Number.isFinite(n) && n >= 0) meta.limit = Math.trunc(n);
        break;
      }
      case "timeout": {
        const n = Number(value);
        if (Number.isFinite(n) && n >= 0) meta.timeoutMs = Math.trunc(n);
        break;
      }
      case "display":
      case "displayMode": {
        if ((DISPLAY_MODES as readonly string[]).includes(value)) {
          meta.displayMode = value as DbDisplayMode;
        }
        break;
      }
    }
  }

  return meta;
}

/**
 * Serialize metadata into a canonical info string.
 * Undefined fields are omitted. Order is fixed for deterministic roundtrip.
 */
export function stringifyDbFenceInfo(meta: DbBlockMetadata): string {
  const parts: string[] = [DIALECT_TO_TOKEN[meta.dialect]];
  if (meta.alias !== undefined) parts.push(`alias=${meta.alias}`);
  if (meta.connection !== undefined)
    parts.push(`connection=${meta.connection}`);
  if (meta.limit !== undefined) parts.push(`limit=${meta.limit}`);
  if (meta.timeoutMs !== undefined) parts.push(`timeout=${meta.timeoutMs}`);
  if (meta.displayMode !== undefined) parts.push(`display=${meta.displayMode}`);
  return parts.join(" ");
}

/**
 * Shape extracted from a legacy JSON-body db block.
 * Used only during the retrocompat migration window.
 */
export interface LegacyDbBody {
  query: string;
  connectionId?: string;
  limit?: number;
  timeoutMs?: number;
}

/**
 * Detects whether a fenced block body is the pre-redesign JSON shape.
 * Heuristic: trimmed body starts with `{` AND parses as JSON with a string `query` field.
 */
export function isLegacyDbBody(body: string): boolean {
  return parseLegacyDbBody(body) !== null;
}

/**
 * Parse a legacy JSON body. Returns null if body is not legacy-shaped.
 * Accepts both snake_case (backend) and camelCase (frontend) field names.
 */
export function parseLegacyDbBody(body: string): LegacyDbBody | null {
  const trimmed = body.trimStart();
  if (!trimmed.startsWith("{")) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.query !== "string") return null;

  const out: LegacyDbBody = { query: obj.query };

  const connectionId =
    typeof obj.connection_id === "string"
      ? obj.connection_id
      : typeof obj.connectionId === "string"
        ? obj.connectionId
        : undefined;
  if (connectionId) out.connectionId = connectionId;

  if (typeof obj.limit === "number" && Number.isFinite(obj.limit)) {
    out.limit = Math.trunc(obj.limit);
  }

  const timeout =
    typeof obj.timeout_ms === "number"
      ? obj.timeout_ms
      : typeof obj.timeoutMs === "number"
        ? obj.timeoutMs
        : undefined;
  if (timeout !== undefined && Number.isFinite(timeout)) {
    out.timeoutMs = Math.trunc(timeout);
  }

  return out;
}
