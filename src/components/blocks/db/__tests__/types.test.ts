import { describe, it, expect } from "vitest";
import {
  normalizeDbResponse,
  firstSelectResult,
  isDbResponse,
  isSelectResult,
  isMutationResult,
  isErrorResult,
  type DbResponse,
  type DbResult,
} from "../types";

describe("isDbResponse", () => {
  it("accepts stage-2 shape", () => {
    expect(
      isDbResponse({
        results: [],
        messages: [],
        stats: { elapsed_ms: 0 },
      }),
    ).toBe(true);
  });

  it("rejects legacy select shape", () => {
    expect(
      isDbResponse({ columns: [], rows: [], has_more: false }),
    ).toBe(false);
  });

  it("rejects null / non-object", () => {
    expect(isDbResponse(null)).toBe(false);
    expect(isDbResponse(42)).toBe(false);
    expect(isDbResponse("string")).toBe(false);
  });
});

describe("normalizeDbResponse", () => {
  it("passes through stage-2 shape unchanged", () => {
    const input: DbResponse = {
      results: [
        {
          kind: "select",
          columns: [{ name: "id", type: "int" }],
          rows: [{ id: 1 }],
          has_more: false,
        },
      ],
      messages: [],
      stats: { elapsed_ms: 5 },
    };
    const out = normalizeDbResponse(input);
    expect(out).toEqual(input);
  });

  it("fills missing messages array defensively on stage-2 shape", () => {
    const input = {
      results: [] as DbResult[],
      stats: { elapsed_ms: 0 },
    };
    const out = normalizeDbResponse(input);
    expect(out.messages).toEqual([]);
  });

  it("wraps legacy select shape", () => {
    const legacy = {
      columns: [{ name: "id", type: "int" }],
      rows: [{ id: 1 }, { id: 2 }],
      has_more: true,
    };
    const out = normalizeDbResponse(legacy);
    expect(out.results).toHaveLength(1);
    expect(out.results[0]).toEqual({
      kind: "select",
      columns: legacy.columns,
      rows: legacy.rows,
      has_more: true,
    });
    expect(out.stats.elapsed_ms).toBe(0);
  });

  it("maps legacy column type_name to new type field", () => {
    const legacy = {
      columns: [{ name: "id", type_name: "int4" }],
      rows: [],
      has_more: false,
    };
    const out = normalizeDbResponse(legacy);
    const first = out.results[0];
    if (first.kind !== "select") throw new Error("expected select");
    expect(first.columns[0]).toEqual({ name: "id", type: "int4" });
  });

  it("wraps legacy mutation shape", () => {
    const out = normalizeDbResponse({ rows_affected: 7 });
    expect(out.results).toEqual([{ kind: "mutation", rows_affected: 7 }]);
  });

  it("treats garbage as empty response (no throw)", () => {
    expect(normalizeDbResponse(null)).toEqual({
      results: [],
      messages: [],
      stats: { elapsed_ms: 0 },
    });
    expect(normalizeDbResponse({ foo: "bar" })).toEqual({
      results: [],
      messages: [],
      stats: { elapsed_ms: 0 },
    });
  });
});

describe("firstSelectResult", () => {
  it("returns the first result when it's a select", () => {
    const resp = normalizeDbResponse({
      columns: [],
      rows: [],
      has_more: false,
    });
    expect(firstSelectResult(resp)?.kind).toBe("select");
  });

  it("returns null when first result is mutation", () => {
    const resp = normalizeDbResponse({ rows_affected: 3 });
    expect(firstSelectResult(resp)).toBeNull();
  });

  it("returns null when there are no results", () => {
    expect(firstSelectResult(normalizeDbResponse(null))).toBeNull();
  });
});

describe("type guards", () => {
  it("narrow variants correctly", () => {
    const select: DbResult = {
      kind: "select",
      columns: [],
      rows: [],
      has_more: false,
    };
    const mutation: DbResult = { kind: "mutation", rows_affected: 1 };
    const error: DbResult = { kind: "error", message: "boom" };

    expect(isSelectResult(select)).toBe(true);
    expect(isMutationResult(mutation)).toBe(true);
    expect(isErrorResult(error)).toBe(true);

    expect(isSelectResult(mutation)).toBe(false);
    expect(isMutationResult(error)).toBe(false);
    expect(isErrorResult(select)).toBe(false);
  });
});
