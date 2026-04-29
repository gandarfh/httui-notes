import { describe, it, expect } from "vitest";
import {
  toCsv,
  toJson,
  toMarkdown,
  toInserts,
  inferTableName,
  hasExportableRows,
  type ExportableResult,
} from "../db-export";

function mkResult(overrides: Partial<ExportableResult> = {}): ExportableResult {
  return {
    kind: "select",
    columns: [
      { name: "id", type: "integer" },
      { name: "name", type: "text" },
      { name: "meta", type: "jsonb" },
    ],
    rows: [
      { id: 1, name: "alice", meta: { tier: "gold" } },
      { id: 2, name: "bob, jr.", meta: null },
      { id: 3, name: 'with "quotes"', meta: { tier: "silver" } },
    ],
    has_more: false,
    ...overrides,
  };
}

describe("toCsv", () => {
  it("emits header + rows with RFC-compliant quoting", () => {
    const csv = toCsv(mkResult());
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("id,name,meta");
    expect(lines[1]).toBe(`1,alice,"{""tier"":""gold""}"`);
    expect(lines[2]).toBe(`2,"bob, jr.",`);
    expect(lines[3]).toBe(`3,"with ""quotes""","{""tier"":""silver""}"`);
  });

  it("renders null cells as empty fields", () => {
    const csv = toCsv(
      mkResult({
        rows: [{ id: 1, name: null, meta: null }],
      }),
    );
    expect(csv.trim().split("\n")[1]).toBe("1,,");
  });
});

describe("toJson", () => {
  it("emits pretty-printed array of rows", () => {
    const json = toJson(
      mkResult({
        rows: [{ id: 1, name: "alice", meta: null }],
      }),
    );
    const parsed = JSON.parse(json);
    expect(parsed).toEqual([{ id: 1, name: "alice", meta: null }]);
  });
});

describe("toMarkdown", () => {
  it("produces a valid GFM table", () => {
    const md = toMarkdown(mkResult());
    const lines = md.trim().split("\n");
    expect(lines[0]).toBe("| id | name | meta |");
    expect(lines[1]).toBe("| --- | --- | --- |");
    expect(lines[2]).toBe(`| 1 | alice | {"tier":"gold"} |`);
  });

  it("escapes pipe characters inside cells", () => {
    const md = toMarkdown(
      mkResult({
        rows: [{ id: 1, name: "a|b", meta: null }],
      }),
    );
    expect(md).toContain(`| 1 | a\\|b |  |`);
  });
});

describe("toInserts", () => {
  it("emits one INSERT per row with proper SQL literal quoting", () => {
    const sql = toInserts(
      mkResult({
        rows: [
          { id: 1, name: "alice", meta: { tier: "gold" } },
          { id: 2, name: "o'reilly", meta: null },
        ],
      }),
      "users",
    );
    const lines = sql.trim().split("\n");
    expect(lines[0]).toBe(
      `INSERT INTO users (id, name, meta) VALUES (1, 'alice', '{"tier":"gold"}');`,
    );
    expect(lines[1]).toBe(
      `INSERT INTO users (id, name, meta) VALUES (2, 'o''reilly', NULL);`,
    );
  });

  it("falls back to <table> when table name is empty", () => {
    const sql = toInserts(
      mkResult({ rows: [{ id: 1, name: "a", meta: null }] }),
      "",
    );
    expect(sql).toContain("INSERT INTO <table>");
  });
});

describe("inferTableName", () => {
  it("returns the first FROM identifier", () => {
    expect(inferTableName("SELECT * FROM users")).toBe("users");
    expect(inferTableName("SELECT * FROM vendas.pedidos WHERE 1=1")).toBe(
      "vendas.pedidos",
    );
  });

  it("is not fooled by comments", () => {
    expect(inferTableName("-- FROM fake\nSELECT * FROM real")).toBe("real");
    expect(inferTableName("/* FROM fake */ SELECT 1 FROM real")).toBe("real");
  });

  it("returns null when no FROM clause", () => {
    expect(inferTableName("SELECT 1")).toBeNull();
  });
});

describe("hasExportableRows", () => {
  it("false for empty result", () => {
    expect(hasExportableRows(mkResult({ rows: [], columns: [] }))).toBe(false);
  });

  it("true for non-empty result", () => {
    expect(hasExportableRows(mkResult())).toBe(true);
  });
});
