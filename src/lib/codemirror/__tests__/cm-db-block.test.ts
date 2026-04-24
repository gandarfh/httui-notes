import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditorSelection, EditorState, Text } from "@codemirror/state";
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";

import {
  createDbBlockExtension,
  createDbSchemaCompletionSource,
  findDbBlocks,
  __internal,
  __resetDbSchemaCompletionCache,
  type DbFencedBlock,
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

const { DB_OPEN_RE, FENCE_CLOSE_RE, countDbBlocks, fenceSkipFilter } =
  __internal;

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

// ─────────────────────────────────────────────
// Navigation — fenceSkipFilter
// ─────────────────────────────────────────────

function mkBlock(doc: Text): DbFencedBlock {
  const [b] = findDbBlocks(doc);
  if (!b) throw new Error("no db block in fixture");
  return b;
}

/** Build a fake transaction that moves the cursor from `oldHead` to `newHead`. */
function mkSelectionTr(doc: Text, oldHead: number, newHead: number) {
  const startState = EditorState.create({
    doc,
    selection: EditorSelection.cursor(oldHead),
  });
  return startState.update({ selection: EditorSelection.cursor(newHead) });
}

describe("fenceSkipFilter", () => {
  const DOC_LINES = [
    "before",              // line 1, offsets 0-6
    "```db-postgres",      // line 2 — open fence
    "SELECT 1",            // line 3 — body
    "```",                 // line 4 — close fence
    "after",               // line 5
  ];
  const DOC = Text.of(DOC_LINES);

  it("skips past open fence when moving down from before", () => {
    const block = mkBlock(DOC);
    // Moving cursor from end of "before" (line 1) onto the open fence.
    const oldHead = DOC.line(1).to;
    const newHead = DOC.line(2).from;
    const tr = mkSelectionTr(DOC, oldHead, newHead);
    const spec = fenceSkipFilter(tr, [block]);
    expect(spec).not.toBeNull();
    const target = (spec!.selection as { head: number }).head;
    expect(target).toBe(block.bodyFrom);
  });

  it("skips past close fence when moving down out of body", () => {
    const block = mkBlock(DOC);
    const oldHead = DOC.line(3).to; // end of body
    const newHead = DOC.line(4).from; // close fence line
    const tr = mkSelectionTr(DOC, oldHead, newHead);
    const spec = fenceSkipFilter(tr, [block]);
    expect(spec).not.toBeNull();
    const target = (spec!.selection as { head: number }).head;
    // Must land past the close fence (start of "after" line or doc end).
    expect(target).toBeGreaterThan(block.closeLineTo);
  });

  it("skips back into body when moving up from after", () => {
    const block = mkBlock(DOC);
    const oldHead = DOC.line(5).from; // start of "after"
    const newHead = DOC.line(4).from; // close fence line
    const tr = mkSelectionTr(DOC, oldHead, newHead);
    const spec = fenceSkipFilter(tr, [block]);
    expect(spec).not.toBeNull();
    const target = (spec!.selection as { head: number }).head;
    expect(target).toBe(block.bodyTo);
  });

  it("returns null when selection did not land on a fence line", () => {
    const block = mkBlock(DOC);
    const oldHead = 0;
    const newHead = DOC.line(3).from; // inside the body
    const tr = mkSelectionTr(DOC, oldHead, newHead);
    expect(fenceSkipFilter(tr, [block])).toBeNull();
  });

  it("returns null when there are no db blocks", () => {
    const doc = Text.of(["hello", "world"]);
    const state = EditorState.create({ doc });
    const tr = state.update({ selection: EditorSelection.cursor(5) });
    expect(fenceSkipFilter(tr, [])).toBeNull();
  });

  it("returns null for non-empty selections (user is extending a range)", () => {
    const block = mkBlock(DOC);
    const state = EditorState.create({
      doc: DOC,
      selection: EditorSelection.range(0, 0),
    });
    const tr = state.update({
      selection: EditorSelection.range(0, DOC.line(2).from),
    });
    expect(fenceSkipFilter(tr, [block])).toBeNull();
  });

  // ── Vim / keymap origin-agnostic behavior ──
  // The filter inspects only `tr.startState.selection` and `tr.selection`,
  // not the originating keymap or userEvent. Any selection-change
  // transaction — whether from the default keymap's ArrowDown, vim's `j`,
  // a mouse click, or a programmatic dispatch — must go through it.

  it("applies to transactions marked userEvent: select (vim-style)", () => {
    const block = mkBlock(DOC);
    const startState = EditorState.create({
      doc: DOC,
      selection: EditorSelection.cursor(DOC.line(1).to),
    });
    // Vim dispatches with a userEvent annotation. Confirm the filter
    // still fires; nothing in its logic discriminates by userEvent.
    const tr = startState.update({
      selection: EditorSelection.cursor(DOC.line(2).from),
      userEvent: "select",
    });
    const spec = fenceSkipFilter(tr, [block]);
    expect(spec).not.toBeNull();
    expect((spec!.selection as { head: number }).head).toBe(block.bodyFrom);
  });

  it("applies to transactions marked userEvent: select.pointer (mouse)", () => {
    const block = mkBlock(DOC);
    const startState = EditorState.create({
      doc: DOC,
      selection: EditorSelection.cursor(DOC.line(5).from),
    });
    const tr = startState.update({
      selection: EditorSelection.cursor(DOC.line(4).from),
      userEvent: "select.pointer",
    });
    const spec = fenceSkipFilter(tr, [block]);
    expect(spec).not.toBeNull();
    expect((spec!.selection as { head: number }).head).toBe(block.bodyTo);
  });
});

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
                name: "users",
                columns: [
                  { name: "id", dataType: "integer" },
                  { name: "email", dataType: "text" },
                  { name: "created_at", dataType: "timestamp" },
                ],
              },
              {
                name: "posts",
                columns: [
                  { name: "id", dataType: "integer" },
                  { name: "user_id", dataType: "integer" },
                  { name: "title", dataType: "text" },
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

  it("returns null when the block has no connection metadata", async () => {
    const doc = "```db-postgres\nSELECT | FROM users\n```\n";
    const result = await runCompletion(doc);
    expect(result).toBeNull();
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
});
