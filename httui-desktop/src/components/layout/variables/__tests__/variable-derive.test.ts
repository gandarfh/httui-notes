import { describe, expect, it } from "vitest";

import {
  applyVariableScope,
  countVariableScopes,
  deriveVariableRows,
  matchVariableSearch,
  sortVariableRowsByName,
  type VariableRow,
} from "@/components/layout/variables/variable-derive";

function row(over: Partial<VariableRow>): VariableRow {
  return {
    key: "API_BASE",
    scope: "workspace",
    isSecret: false,
    values: { local: "http://localhost", staging: "https://stg" },
    usesCount: 0,
    ...over,
  };
}

describe("applyVariableScope", () => {
  const rows: VariableRow[] = [
    row({ key: "A", scope: "workspace", isSecret: false }),
    row({ key: "B", scope: "captured", isSecret: false }),
    row({ key: "C", scope: "personal", isSecret: false }),
    row({ key: "D", scope: "workspace", isSecret: true }),
    row({ key: "E", scope: "personal", isSecret: true }),
  ];

  it("returns every row for 'all'", () => {
    expect(applyVariableScope(rows, "all").map((r) => r.key)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
    ]);
  });

  it("filters by scope discriminator for workspace/captured/personal", () => {
    expect(applyVariableScope(rows, "workspace").map((r) => r.key)).toEqual([
      "A",
      "D",
    ]);
    expect(applyVariableScope(rows, "captured").map((r) => r.key)).toEqual([
      "B",
    ]);
    expect(applyVariableScope(rows, "personal").map((r) => r.key)).toEqual([
      "C",
      "E",
    ]);
  });

  it("filters by isSecret flag for 'secret' (cross-cuts other scopes)", () => {
    expect(applyVariableScope(rows, "secret").map((r) => r.key)).toEqual([
      "D",
      "E",
    ]);
  });
});

describe("matchVariableSearch", () => {
  const r = row({
    key: "API_BASE",
    scope: "workspace",
    values: { local: "http://localhost:3000" },
  });

  it("returns true on empty / whitespace search", () => {
    expect(matchVariableSearch(r, "")).toBe(true);
    expect(matchVariableSearch(r, "   ")).toBe(true);
  });

  it("matches by key (case-insensitive)", () => {
    expect(matchVariableSearch(r, "api_base")).toBe(true);
    expect(matchVariableSearch(r, "BASE")).toBe(true);
  });

  it("matches by scope", () => {
    expect(matchVariableSearch(r, "workspace")).toBe(true);
  });

  it("matches by any value substring", () => {
    expect(matchVariableSearch(r, "localhost")).toBe(true);
    expect(matchVariableSearch(r, "3000")).toBe(true);
  });

  it("returns false when nothing matches", () => {
    expect(matchVariableSearch(r, "redis")).toBe(false);
  });

  it("ignores undefined values without throwing", () => {
    const sparse = row({
      key: "X",
      values: { local: undefined, staging: "stg" },
    });
    expect(matchVariableSearch(sparse, "stg")).toBe(true);
    expect(matchVariableSearch(sparse, "nope")).toBe(false);
  });
});

describe("sortVariableRowsByName", () => {
  it("sorts ascending case-insensitively without mutating input", () => {
    const input = [
      row({ key: "zeta" }),
      row({ key: "Alpha" }),
      row({ key: "beta" }),
    ];
    const sorted = sortVariableRowsByName(input);
    expect(sorted.map((r) => r.key)).toEqual(["Alpha", "beta", "zeta"]);
    expect(input.map((r) => r.key)).toEqual(["zeta", "Alpha", "beta"]);
  });
});

describe("deriveVariableRows", () => {
  const rows: VariableRow[] = [
    row({ key: "USER", scope: "workspace", values: { local: "alice" } }),
    row({ key: "TOKEN", scope: "personal", isSecret: true, values: {} }),
    row({ key: "DB_URL", scope: "workspace", values: { local: "pg://x" } }),
    row({ key: "TEMP", scope: "captured", values: { local: "42" } }),
  ];

  it("composes scope filter + search + sort", () => {
    const out = deriveVariableRows({
      rows,
      scope: "workspace",
      search: "url",
    });
    expect(out.map((r) => r.key)).toEqual(["DB_URL"]);
  });

  it("returns sorted rows when search is empty", () => {
    const out = deriveVariableRows({ rows, scope: "all", search: "" });
    expect(out.map((r) => r.key)).toEqual(["DB_URL", "TEMP", "TOKEN", "USER"]);
  });
});

describe("countVariableScopes", () => {
  it("returns counts for every scope plus 'all'", () => {
    const rows: VariableRow[] = [
      row({ scope: "workspace", isSecret: false }),
      row({ scope: "workspace", isSecret: true }),
      row({ scope: "captured", isSecret: false }),
      row({ scope: "personal", isSecret: true }),
    ];
    expect(countVariableScopes(rows)).toEqual({
      all: 4,
      workspace: 2,
      captured: 1,
      personal: 1,
      secret: 2,
    });
  });

  it("handles an empty list", () => {
    expect(countVariableScopes([])).toEqual({
      all: 0,
      workspace: 0,
      captured: 0,
      personal: 0,
      secret: 0,
    });
  });
});
