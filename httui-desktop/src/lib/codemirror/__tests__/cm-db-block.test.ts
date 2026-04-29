import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditorState, Text } from "@codemirror/state";
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";

import {
  createDbBlockExtension,
  createDbSchemaCompletionSource,
  findDbBlocks,
  __internal,
  __resetDbSchemaCompletionCache,
} from "../cm-db-block";
import { useSchemaCacheStore } from "@/stores/schemaCache";

vi.mock("@/lib/tauri/connections", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tauri/connections")>(
    "@/lib/tauri/connections",
  );
  return {
    ...actual,
    listConnections: vi.fn(async () => [
      {
        id: "conn-123",
        name: "prod",
        driver: "postgres" as const,
        host: "localhost",
        port: 5432,
        database_name: "app",
        username: "app",
        has_password: false,
        ssl_mode: "disable",
        timeout_ms: 10000,
        query_timeout_ms: 30000,
        ttl_seconds: 300,
        max_pool_size: 5,
        last_tested_at: null,
        created_at: "",
        updated_at: "",
      },
    ]),
    introspectSchema: vi.fn(async () => []),
    getCachedSchema: vi.fn(async () => null),
  };
});

const { DB_OPEN_RE, FENCE_CLOSE_RE, countDbBlocks } = __internal;

// ─────────────────────────────────────────────
// findDbBlocks
// ─────────────────────────────────────────────

describe("findDbBlocks", () => {
  it("detects a basic db-postgres block", () => {
    const doc = Text.of([
      "# Heading",
      "",
      "```db-postgres alias=q1 connection=prod",
      "SELECT * FROM users",
      "```",
      "",
      "more",
    ]);
    const blocks = findDbBlocks(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].lang).toBe("db-postgres");
    expect(blocks[0].body).toBe("SELECT * FROM users");
    expect(blocks[0].metadata.dialect).toBe("postgres");
    expect(blocks[0].metadata.alias).toBe("q1");
    expect(blocks[0].metadata.connection).toBe("prod");
  });

  it("detects generic db dialect", () => {
    const doc = Text.of(["```db", "SELECT 1", "```"]);
    const blocks = findDbBlocks(doc);
    expect(blocks[0].metadata.dialect).toBe("generic");
  });

  it("detects db-mysql and db-sqlite", () => {
    const doc = Text.of([
      "```db-mysql alias=m",
      "SELECT 1",
      "```",
      "",
      "```db-sqlite alias=s",
      "SELECT 2",
      "```",
    ]);
    const blocks = findDbBlocks(doc);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].metadata.dialect).toBe("mysql");
    expect(blocks[1].metadata.dialect).toBe("sqlite");
  });

  it("ignores non-db fenced blocks", () => {
    const doc = Text.of([
      "```http",
      "GET /",
      "```",
      "",
      "```javascript",
      "console.log(1)",
      "```",
      "",
      "```db",
      "SELECT 1",
      "```",
    ]);
    const blocks = findDbBlocks(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].lang).toBe("db");
  });

  it("preserves multi-line body with blank lines", () => {
    const doc = Text.of([
      "```db-postgres",
      "SELECT 1;",
      "",
      "SELECT 2;",
      "```",
    ]);
    const blocks = findDbBlocks(doc);
    expect(blocks[0].body).toBe("SELECT 1;\n\nSELECT 2;");
  });

  it("handles an empty body", () => {
    const doc = Text.of(["```db", "```"]);
    const blocks = findDbBlocks(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].body).toBe("");
    // Body range collapses to a single position between fences.
    expect(blocks[0].bodyFrom).toBe(blocks[0].bodyTo);
  });

  it("ignores blocks with no closing fence", () => {
    const doc = Text.of(["```db", "SELECT 1", "(no close)"]);
    expect(findDbBlocks(doc)).toHaveLength(0);
  });

  it("exposes open/close/body positions", () => {
    const doc = Text.of([
      "```db-postgres alias=q",
      "SELECT 1",
      "```",
    ]);
    const [block] = findDbBlocks(doc);
    expect(block.openLineFrom).toBe(0);
    const openLine = doc.lineAt(block.openLineFrom);
    expect(openLine.text).toBe("```db-postgres alias=q");
    const closeLine = doc.lineAt(block.closeLineFrom);
    expect(closeLine.text).toBe("```");
  });
});

// ─────────────────────────────────────────────
// Internal regexes and counter
// ─────────────────────────────────────────────

describe("internal regexes", () => {
  it("DB_OPEN_RE matches all db variants", () => {
    expect("```db".match(DB_OPEN_RE)?.[1]).toBe("db");
    expect("```db-postgres alias=x".match(DB_OPEN_RE)?.[1]).toBe("db-postgres");
    expect("```db-mysql".match(DB_OPEN_RE)?.[1]).toBe("db-mysql");
    expect("```db-sqlite limit=10".match(DB_OPEN_RE)?.[1]).toBe("db-sqlite");
  });

  it("DB_OPEN_RE rejects non-db langs", () => {
    expect("```http".match(DB_OPEN_RE)).toBeNull();
    expect("```e2e".match(DB_OPEN_RE)).toBeNull();
    expect("```javascript".match(DB_OPEN_RE)).toBeNull();
    expect("not a fence".match(DB_OPEN_RE)).toBeNull();
  });

  it("FENCE_CLOSE_RE matches variable-length closing fences", () => {
    expect(FENCE_CLOSE_RE.test("```")).toBe(true);
    expect(FENCE_CLOSE_RE.test("````")).toBe(true);
    expect(FENCE_CLOSE_RE.test("``` ")).toBe(true); // trailing whitespace OK
    expect(FENCE_CLOSE_RE.test("```db")).toBe(false);
    expect(FENCE_CLOSE_RE.test("``")).toBe(false);
  });

  it("countDbBlocks matches findDbBlocks length", () => {
    const doc = Text.of([
      "```db",
      "x",
      "```",
      "",
      "```http",
      "x",
      "```",
      "",
      "```db-mysql",
      "x",
      "```",
    ]);
    // countDbBlocks counts openings only; findDbBlocks requires a close.
    // Both agree here because every opening has a closer.
    expect(countDbBlocks(doc)).toBe(2);
    expect(findDbBlocks(doc)).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────
// Extension smoke — state creation + decorations present
// ─────────────────────────────────────────────

describe("createDbBlockExtension", () => {
  const DOC = [
    "intro",
    "",
    "```db-postgres alias=q",
    "SELECT 1",
    "```",
    "",
    "outro",
  ].join("\n");

  it("state can be created without error", () => {
    const state = EditorState.create({
      doc: DOC,
      extensions: [createDbBlockExtension()],
    });
    expect(state.doc.toString()).toBe(DOC);
  });

  it("rebuilds when a db block is added", () => {
    const state = EditorState.create({
      doc: "text",
      extensions: [createDbBlockExtension()],
    });
    const tr = state.update({
      changes: {
        from: state.doc.length,
        to: state.doc.length,
        insert: "\n```db-postgres\nSELECT 1\n```",
      },
    });
    const blocks = findDbBlocks(tr.state.doc);
    expect(blocks).toHaveLength(1);
  });
});

// Navigation over db blocks is now fully delegated to CM6's default
// handling — the replaced fence widgets already make the fence rows
// non-selectable, so cursor arrow keys and mouse clicks land naturally
// without any custom transaction filter. The old `fenceSkipFilter`
// test suite was removed along with the filter itself.

// ─────────────────────────────────────────────
// Schema-aware SQL autocomplete
// ─────────────────────────────────────────────

describe("createDbSchemaCompletionSource", () => {
  beforeEach(() => {
    __resetDbSchemaCompletionCache();
    useSchemaCacheStore.setState({
      byConnection: {
        "conn-123": {
          schema: {
            fetchedAt: Date.now(),
            tables: [
              {
                schema: "public",
                name: "users",
                columns: [
                  { name: "id", dataType: "integer" },
                  { name: "email", dataType: "text" },
                  { name: "created_at", dataType: "timestamp" },
                ],
              },
              {
                schema: "public",
                name: "posts",
                columns: [
                  { name: "id", dataType: "integer" },
                  { name: "user_id", dataType: "integer" },
                  { name: "title", dataType: "text" },
                ],
              },
              {
                schema: "vendas",
                name: "pedidos",
                columns: [
                  { name: "id", dataType: "integer" },
                  { name: "total", dataType: "numeric" },
                ],
              },
            ],
          },
          loading: false,
          error: null,
          inflight: null,
        },
      },
    });
  });

  function makeCtx(doc: string, pos: number): CompletionContext {
    const state = EditorState.create({ doc });
    // Minimal CompletionContext shim — the fields the source reads.
    return {
      state,
      pos,
      explicit: true,
      matchBefore: (re: RegExp) => {
        const before = state.doc.sliceString(0, pos);
        const match = before.match(re);
        if (!match) return null;
        const text = match[0];
        const from = pos - text.length;
        return { from, to: pos, text };
      },
      aborted: false,
    } as unknown as CompletionContext;
  }

  async function runCompletion(
    doc: string,
    cursorMarker = "|",
  ): Promise<CompletionResult | null> {
    const pos = doc.indexOf(cursorMarker);
    if (pos === -1) throw new Error("cursor marker missing");
    const cleaned = doc.slice(0, pos) + doc.slice(pos + cursorMarker.length);
    const source = createDbSchemaCompletionSource();
    const ctx = makeCtx(cleaned, pos);
    const result = source(ctx);
    return (await result) as CompletionResult | null;
  }

  it("returns null outside a db block", async () => {
    const result = await runCompletion("hello |world");
    expect(result).toBeNull();
  });

  it("offers SQL keywords + status hint when connection metadata is missing", async () => {
    const doc = "```db-postgres\nSELECT | FROM users\n```\n";
    const result = await runCompletion(doc);
    expect(result).not.toBeNull();
    const labels = result!.options.map((o) => o.label);
    // Postgres keyword list is contributed even without a connection, so
    // Ctrl-Space never yields an empty popup inside a db block.
    expect(labels).toContain("select");
    expect(labels).toContain("⋯ no connection set");
    // Tables / columns only appear once a connection resolves.
    expect(labels).not.toContain("users");
  });

  it("offers SQL keywords + 'connection not found' hint for orphan connection", async () => {
    const doc = "```db-postgres connection=ghost\nSELECT |\n```\n";
    const result = await runCompletion(doc);
    expect(result).not.toBeNull();
    const labels = result!.options.map((o) => o.label);
    expect(labels).toContain("select");
    expect(labels.some((l) => l.startsWith("⋯ connection \"ghost\""))).toBe(true);
  });

  it("offers table names after FROM", async () => {
    const doc = "```db-postgres connection=prod\nSELECT * FROM |\n```\n";
    const result = await runCompletion(doc);
    expect(result).not.toBeNull();
    const labels = result!.options.map((o) => o.label);
    expect(labels).toContain("users");
    expect(labels).toContain("posts");
  });

  it("offers columns after `table.`", async () => {
    const doc = "```db-postgres connection=prod\nSELECT users.| FROM users\n```\n";
    const result = await runCompletion(doc);
    expect(result).not.toBeNull();
    const labels = result!.options.map((o) => o.label);
    expect(labels).toEqual(
      expect.arrayContaining(["id", "email", "created_at"]),
    );
    // Does not offer posts columns.
    expect(labels).not.toContain("title");
  });

  it("returns null inside an active {{ref}} expression", async () => {
    const doc = "```db-postgres connection=prod\nSELECT * WHERE id = {{|}}\n```\n";
    const result = await runCompletion(doc);
    expect(result).toBeNull();
  });

  it("offers schema-qualified tables for non-public schemas", async () => {
    const doc = "```db-postgres connection=prod\nSELECT * FROM |\n```\n";
    const result = await runCompletion(doc);
    expect(result).not.toBeNull();
    const labels = result!.options.map((o) => o.label);
    // public-schema tables use bare names so user typing `users` keeps working.
    expect(labels).toContain("users");
    // vendas schema is qualified — `vendas.pedidos` offers as single token.
    expect(labels).toContain("vendas.pedidos");
  });

  it("offers columns after a `schema.table.` prefix", async () => {
    const doc = "```db-postgres connection=prod\nSELECT vendas.pedidos.| FROM vendas.pedidos\n```\n";
    const result = await runCompletion(doc);
    expect(result).not.toBeNull();
    const labels = result!.options.map((o) => o.label);
    expect(labels).toEqual(expect.arrayContaining(["id", "total"]));
    // Does not spill columns from unrelated tables.
    expect(labels).not.toContain("email");
  });
});
