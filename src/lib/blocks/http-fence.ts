/**
 * Parser and serializer for HTTP block fenced-code info strings and bodies.
 *
 * New format (post-redesign):
 *   ```http alias=req1 timeout=30000 display=split mode=raw
 *   POST https://api.example.com/users?page=1
 *   &limit=10
 *   Authorization: Bearer {{TOKEN}}
 *   Content-Type: application/json
 *
 *   {"name":"alice"}
 *   ```
 *
 * Legacy format (pre-redesign, still supported on read):
 *   ```http alias=req1 displayMode=split
 *   {"method":"POST","url":"...","params":[...],"headers":[...],"body":"..."}
 *   ```
 *
 * Info string rules:
 * - Tokens separated by whitespace; `key=value` (no spaces, no quotes — MVP).
 * - Order does not matter on read; canonical order on write is:
 *   `alias → timeout → display → mode`.
 * - Unknown keys are ignored silently. Invalid values are ignored silently.
 *
 * Body rules (HTTP message format):
 * - First non-empty, non-comment line: `METHOD URL`. URL may include inline query.
 * - Lines starting with `?` or `&` are query continuations.
 * - Until the first blank line: headers in `Key: Value` form.
 * - After the first blank line: body (until end of fence).
 * - Convention: `# desc: <text>` (case-sensitive, exactly one space) attaches a
 *   description to the line below. Other `# ...` lines = disabled (param/header
 *   commented out).
 *
 * Stringifier is canonical and idempotent: `parse → stringify → parse → stringify`
 * is a fixed point.
 */

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type HttpDisplayMode = "input" | "split" | "output";

export type HttpFenceMode = "raw" | "form";

export interface HttpBlockMetadata {
  alias?: string;
  timeoutMs?: number;
  displayMode?: HttpDisplayMode;
  mode?: HttpFenceMode;
}

export interface HttpKVRow {
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
}

export interface HttpMessageParsed {
  method: HttpMethod;
  url: string;
  params: HttpKVRow[];
  headers: HttpKVRow[];
  body: string;
}

const HTTP_METHODS: ReadonlySet<HttpMethod> = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

const DISPLAY_MODES: readonly HttpDisplayMode[] = ["input", "split", "output"];
const FENCE_MODES: readonly HttpFenceMode[] = ["raw", "form"];

const URL_INLINE_LIMIT = 80;

// ─────────────────────── Info string ───────────────────────

/**
 * Parse a fenced-code info string into structured metadata.
 * Returns null if the head token is not `http`.
 */
export function parseHttpFenceInfo(info: string): HttpBlockMetadata | null {
  const parts = info.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts[0] !== "http") return null;

  const meta: HttpBlockMetadata = {};

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
      case "timeout": {
        const n = Number(value);
        if (Number.isFinite(n) && n >= 0) meta.timeoutMs = Math.trunc(n);
        break;
      }
      case "display":
      case "displayMode":
        if ((DISPLAY_MODES as readonly string[]).includes(value)) {
          meta.displayMode = value as HttpDisplayMode;
        }
        break;
      case "mode":
        if ((FENCE_MODES as readonly string[]).includes(value)) {
          meta.mode = value as HttpFenceMode;
        }
        break;
    }
  }

  return meta;
}

/**
 * Serialize metadata into a canonical info string.
 * Order is fixed: alias → timeout → display → mode.
 */
export function stringifyHttpFenceInfo(meta: HttpBlockMetadata): string {
  const parts: string[] = ["http"];
  if (meta.alias !== undefined) parts.push(`alias=${meta.alias}`);
  if (meta.timeoutMs !== undefined) parts.push(`timeout=${meta.timeoutMs}`);
  if (meta.displayMode !== undefined) parts.push(`display=${meta.displayMode}`);
  if (meta.mode !== undefined) parts.push(`mode=${meta.mode}`);
  return parts.join(" ");
}

// ─────────────────────── Body parsing ───────────────────────

const DESC_PREFIX = "# desc: ";
const COMMENT_PREFIX = "#";

interface ParsedFirstLine {
  method: HttpMethod;
  url: string;
  inlineQuery: string;
}

/**
 * Parse an HTTP-message-formatted body. Always succeeds; malformed lines are
 * preserved as raw (e.g., a header without a colon stays as a free-form row
 * in `headers` with empty key).
 */
export function parseHttpMessageBody(body: string): HttpMessageParsed {
  const lines = body.split("\n");

  let i = 0;
  // skip blank/leading comment lines until the first method line
  while (i < lines.length && lines[i].trim() === "") i++;

  let pendingDescription: string | undefined;

  // Empty body → return defaults.
  if (i >= lines.length) {
    return { method: "GET", url: "", params: [], headers: [], body: "" };
  }

  // First non-blank line MUST be `METHOD URL` (we ignore # lines until we find
  // the method line, but `# desc:` doesn't apply to METHOD line).
  while (i < lines.length && lines[i].trim().startsWith("#")) i++;
  if (i >= lines.length) {
    return { method: "GET", url: "", params: [], headers: [], body: "" };
  }

  const firstLineParsed = parseFirstLine(lines[i].trim());
  if (!firstLineParsed) {
    // Couldn't parse the request line; bail with empty shape so caller can show
    // a syntax error in the UI rather than crashing.
    return { method: "GET", url: "", params: [], headers: [], body: "" };
  }
  const { method, url, inlineQuery } = firstLineParsed;
  i++;

  const params: HttpKVRow[] = [];
  // Seed params from inline query (if any).
  if (inlineQuery.length > 0) {
    for (const seg of inlineQuery.split("&")) {
      if (seg.length === 0) continue;
      const row = parseQuerySegment(seg, true, undefined);
      if (row) params.push(row);
    }
  }

  // Phase 1: query continuations and headers, until first blank line.
  const headers: HttpKVRow[] = [];
  let sawHeader = false;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed === "") {
      // Blank line ends headers; everything after is body.
      i++;
      break;
    }

    if (trimmed.startsWith(DESC_PREFIX)) {
      pendingDescription = trimmed.slice(DESC_PREFIX.length);
      i++;
      continue;
    }

    // Disabled row marker? Only `# ` (with space) or bare `#` count.
    // `#foo` (no space) is treated as a free-form comment and ignored.
    if (trimmed === "#" || trimmed.startsWith("# ")) {
      const inner = trimmed === "#" ? "" : trimmed.slice(2);
      // Disabled query continuation
      if (inner.startsWith("?") || inner.startsWith("&")) {
        const seg = inner.slice(1);
        const row = parseQuerySegment(seg, false, pendingDescription);
        if (row) params.push(row);
      } else if (looksLikeHeader(inner)) {
        const row = parseHeaderLine(inner, false, pendingDescription);
        if (row) {
          headers.push(row);
          sawHeader = true;
        }
      }
      // Otherwise: free-form comment, ignored.
      pendingDescription = undefined;
      i++;
      continue;
    }
    // `#xxxx` (no space) → free-form comment, ignored.
    if (trimmed.startsWith(COMMENT_PREFIX)) {
      pendingDescription = undefined;
      i++;
      continue;
    }

    // Query continuation (only valid before the first header).
    if (!sawHeader && (trimmed.startsWith("?") || trimmed.startsWith("&"))) {
      const seg = trimmed.slice(1);
      const row = parseQuerySegment(seg, true, pendingDescription);
      if (row) params.push(row);
      pendingDescription = undefined;
      i++;
      continue;
    }

    // Header line.
    const row = parseHeaderLine(trimmed, true, pendingDescription);
    if (row) {
      headers.push(row);
      sawHeader = true;
    } else {
      // Malformed: preserve as raw header with empty key, so user sees it.
      headers.push({
        key: "",
        value: raw,
        enabled: true,
        description: pendingDescription,
      });
    }
    pendingDescription = undefined;
    i++;
  }

  // Phase 2: body.
  const bodyLines = lines.slice(i);
  // Drop trailing blank lines (idempotency: stringifier never emits trailing
  // blank lines).
  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1] === "") {
    bodyLines.pop();
  }
  const bodyText = bodyLines.join("\n");

  return { method, url, params, headers, body: bodyText };
}

function parseFirstLine(line: string): ParsedFirstLine | null {
  const m = line.match(/^([A-Z]+)\s+(\S.*)$/);
  if (!m) return null;
  const method = m[1] as HttpMethod;
  if (!HTTP_METHODS.has(method)) return null;
  const rest = m[2].trim();
  const qIdx = rest.indexOf("?");
  if (qIdx === -1) {
    return { method, url: rest, inlineQuery: "" };
  }
  return {
    method,
    url: rest.slice(0, qIdx),
    inlineQuery: rest.slice(qIdx + 1),
  };
}

function looksLikeHeader(line: string): boolean {
  const idx = line.indexOf(":");
  return idx > 0;
}

function parseQuerySegment(
  seg: string,
  enabled: boolean,
  description: string | undefined,
): HttpKVRow | null {
  if (seg.length === 0) return null;
  const eq = seg.indexOf("=");
  let key: string;
  let value: string;
  if (eq === -1) {
    key = seg;
    value = "";
  } else {
    key = seg.slice(0, eq);
    value = seg.slice(eq + 1);
  }
  if (key.length === 0) return null;
  return description !== undefined
    ? { key, value, enabled, description }
    : { key, value, enabled };
}

function parseHeaderLine(
  line: string,
  enabled: boolean,
  description: string | undefined,
): HttpKVRow | null {
  const colonIdx = line.indexOf(":");
  if (colonIdx <= 0) return null;
  const key = line.slice(0, colonIdx).trim();
  const value = line.slice(colonIdx + 1).trim();
  if (key.length === 0) return null;
  return description !== undefined
    ? { key, value, enabled, description }
    : { key, value, enabled };
}

// ─────────────────────── Body emission ───────────────────────

/**
 * Emit canonical HTTP message body. Idempotent reformatter.
 *
 * Layout rules:
 * - First line: `METHOD URL[?inline_query]`. Inline query only if all params
 *   are enabled, none have descriptions, and the resulting line stays under
 *   ~80 characters. Otherwise each param is emitted on its own continuation
 *   line.
 * - Continuation lines: first param `?key=value`, rest `&key=value`.
 * - Disabled params/headers are emitted with a `# ` prefix.
 * - Descriptions are emitted as `# desc: <text>` on the line above.
 * - One blank line separates headers from body (omitted if body is empty AND
 *   there are no headers; otherwise always emitted when body is non-empty).
 * - Trailing whitespace stripped; output ends without trailing newline (caller
 *   adds the close fence).
 */
export function stringifyHttpMessageBody(parsed: HttpMessageParsed): string {
  const { method, url, params, headers, body } = parsed;
  const out: string[] = [];

  const inline = canInlineQuery(method, url, params);
  if (inline) {
    if (params.length > 0) {
      const q = params.map((p) => formatParam(p, true)).join("&");
      out.push(`${method} ${url}?${q}`);
    } else {
      out.push(`${method} ${url}`);
    }
  } else {
    out.push(`${method} ${url}`);
    let isFirst = true;
    for (const p of params) {
      if (p.description) {
        const prefix = p.enabled ? "" : "# ";
        out.push(`${prefix}${DESC_PREFIX}${p.description}`);
        // Description applies to the next emitted line; we emit the row right
        // below.
      }
      const seg = formatParam(p, true);
      const lead = isFirst ? "?" : "&";
      isFirst = false;
      const prefix = p.enabled ? "" : "# ";
      out.push(`${prefix}${lead}${seg}`);
    }
  }

  for (const h of headers) {
    if (h.description) {
      const prefix = h.enabled ? "" : "# ";
      out.push(`${prefix}${DESC_PREFIX}${h.description}`);
    }
    if (h.key.length === 0) {
      // raw / unparsed header preserved as-is
      out.push(h.value);
    } else {
      const prefix = h.enabled ? "" : "# ";
      out.push(`${prefix}${h.key}: ${h.value}`);
    }
  }

  if (body.length > 0) {
    out.push("");
    out.push(body);
  }

  return out.join("\n");
}

function canInlineQuery(
  method: HttpMethod,
  url: string,
  params: HttpKVRow[],
): boolean {
  if (params.length === 0) return true;
  // Force continuation if any disabled or any has description.
  if (params.some((p) => !p.enabled || p.description !== undefined)) return false;
  const inline = params.map((p) => formatParam(p, true)).join("&");
  const total = method.length + 1 + url.length + 1 + inline.length;
  return total <= URL_INLINE_LIMIT;
}

function formatParam(p: HttpKVRow, _includeEnabledPrefix: boolean): string {
  if (p.value === "") return p.key;
  return `${p.key}=${p.value}`;
}

// ─────────────────────── Legacy JSON body ───────────────────────

/**
 * Shape extracted from a legacy JSON-body http block.
 * Used only during the retrocompat migration window.
 */
export interface LegacyHttpBody {
  method: HttpMethod;
  url: string;
  params: Array<{ key: string; value: string }>;
  headers: Array<{ key: string; value: string }>;
  body: string;
  timeoutMs?: number;
}

/**
 * Detects whether a fenced block body is the pre-redesign JSON shape.
 * Heuristic: trimmed body starts with `{` AND parses as JSON with string
 * `method` and `url` fields.
 */
export function isLegacyHttpBody(body: string): boolean {
  return parseLegacyHttpBody(body) !== null;
}

/**
 * Parse a legacy JSON body. Returns null if body is not legacy-shaped.
 * Accepts both snake_case (backend) and camelCase (frontend) field names.
 */
export function parseLegacyHttpBody(body: string): LegacyHttpBody | null {
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
  if (typeof obj.method !== "string" || typeof obj.url !== "string") return null;

  const methodUpper = obj.method.toUpperCase();
  if (!HTTP_METHODS.has(methodUpper as HttpMethod)) return null;

  const out: LegacyHttpBody = {
    method: methodUpper as HttpMethod,
    url: obj.url,
    params: normalizeKVArray(obj.params),
    headers: normalizeKVArray(obj.headers),
    body: typeof obj.body === "string" ? obj.body : "",
  };

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

function normalizeKVArray(value: unknown): Array<{ key: string; value: string }> {
  if (!Array.isArray(value)) return [];
  const out: Array<{ key: string; value: string }> = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const key = typeof obj.key === "string" ? obj.key : "";
    const v = typeof obj.value === "string" ? obj.value : "";
    if (key.length === 0) continue;
    out.push({ key, value: v });
  }
  return out;
}

/**
 * Convert a legacy body to the new HTTP-message shape. All rows enabled, no
 * descriptions (legacy format never had them).
 */
export function legacyToHttpMessage(legacy: LegacyHttpBody): HttpMessageParsed {
  return {
    method: legacy.method,
    url: legacy.url,
    params: legacy.params.map((p) => ({ ...p, enabled: true })),
    headers: legacy.headers.map((h) => ({ ...h, enabled: true })),
    body: legacy.body,
  };
}

// ─────────────────────── Body mode ↔ Content-Type ───────────────────────

/**
 * Body mode pill values. `none` means no `Content-Type` header is set.
 *
 * The pill is a *view* over the `Content-Type` header — selecting a mode
 * rewrites only that header value (or removes it for `none`); the body
 * itself is never touched. See `setContentTypeForMode` and
 * `isCompatibleSwitch` for the read-modify-write contract.
 */
export type HttpBodyMode =
  | "none"
  | "json"
  | "xml"
  | "text"
  | "form-urlencoded"
  | "multipart"
  | "binary";

const BODY_MODE_TO_CT: Record<Exclude<HttpBodyMode, "none">, string> = {
  json: "application/json",
  xml: "application/xml",
  text: "text/plain",
  "form-urlencoded": "application/x-www-form-urlencoded",
  multipart: "multipart/form-data",
  binary: "application/octet-stream",
};

const TEXTUAL_MODES: ReadonlySet<HttpBodyMode> = new Set([
  "json",
  "xml",
  "text",
]);

const STRUCTURED_MODES: ReadonlySet<HttpBodyMode> = new Set([
  "form-urlencoded",
  "multipart",
  "binary",
]);

const CONTENT_TYPE_HEADER = "Content-Type";

function findContentTypeIndex(headers: HttpKVRow[]): number {
  return headers.findIndex(
    (h) => h.key.toLowerCase() === "content-type",
  );
}

/**
 * Map a `Content-Type` value (without parameters like `; charset=utf-8`) to a
 * pill mode. Unknown types fall back to `text` so the user can still
 * reformat; absence of the header yields `none`.
 */
export function deriveBodyMode(headers: HttpKVRow[]): HttpBodyMode {
  const idx = findContentTypeIndex(headers);
  if (idx === -1) return "none";
  const row = headers[idx];
  if (!row.enabled) return "none";
  // Strip parameters (`; charset=utf-8`, `; boundary=...`) and lowercase.
  const mime = row.value.split(";")[0].trim().toLowerCase();
  if (mime === "") return "none";
  if (mime === "application/json" || mime.endsWith("+json")) return "json";
  if (mime === "application/xml" || mime === "text/xml" || mime.endsWith("+xml"))
    return "xml";
  if (mime === "text/plain") return "text";
  if (mime === "application/x-www-form-urlencoded") return "form-urlencoded";
  if (mime.startsWith("multipart/")) return "multipart";
  if (
    mime === "application/octet-stream" ||
    mime.startsWith("image/") ||
    mime.startsWith("audio/") ||
    mime.startsWith("video/") ||
    mime === "application/pdf"
  )
    return "binary";
  if (mime.startsWith("text/")) return "text";
  // Default for unknown types: keep as text so the user can edit cleanly.
  return "text";
}

/**
 * Set the `Content-Type` header so it matches the desired body mode. Idempotent
 * and surgical — body, params, URL and other headers are never touched.
 *
 * - `none` removes any existing `Content-Type` header (case-insensitive).
 * - Any other mode replaces the value of an existing header (preserving
 *   description/disabled flag) or appends a new enabled header at the end of
 *   the headers list.
 */
export function setContentTypeForMode(
  parsed: HttpMessageParsed,
  next: HttpBodyMode,
): HttpMessageParsed {
  const idx = findContentTypeIndex(parsed.headers);
  const headers = parsed.headers.slice();

  if (next === "none") {
    if (idx === -1) return parsed;
    headers.splice(idx, 1);
    return { ...parsed, headers };
  }

  const value = BODY_MODE_TO_CT[next];
  if (idx === -1) {
    headers.push({ key: CONTENT_TYPE_HEADER, value, enabled: true });
  } else {
    const prev = headers[idx];
    if (prev.value === value && prev.enabled) return parsed;
    headers[idx] = { ...prev, value, enabled: true };
  }
  return { ...parsed, headers };
}

/**
 * Decide whether switching from `prev` to `next` is "compatible" with the
 * current body. Used to surface a warning toast — the switch is *never*
 * blocked, the user just gets a heads-up that the body shape no longer
 * matches the declared `Content-Type`.
 *
 * Compatibility rules (intentionally loose):
 * - If the body is empty → always compatible (nothing to misinterpret).
 * - Same mode → compatible.
 * - Toggling between textual modes (json/xml/text) → compatible (the user
 *   is just changing the declared subtype; payload may still need editing
 *   but it's not a structural mismatch).
 * - Going from a textual body to a structured mode (form-urlencoded /
 *   multipart / binary) → **incompatible** (current text won't parse).
 * - Going from `none` → anything is compatible (we're only adding a
 *   declaration).
 */
export function isCompatibleSwitch(
  prev: HttpBodyMode,
  next: HttpBodyMode,
  body: string,
): boolean {
  if (prev === next) return true;
  if (body.trim().length === 0) return true;
  if (prev === "none") return true;
  if (TEXTUAL_MODES.has(prev) && TEXTUAL_MODES.has(next)) return true;
  if (TEXTUAL_MODES.has(prev) && STRUCTURED_MODES.has(next)) return false;
  // Structured → textual or structured → structured: textual content is
  // unlikely to live there anyway; allow with no warning.
  return true;
}
