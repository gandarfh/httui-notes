import { describe, expect, it } from "vitest";

import {
  dbResponseToAssertionContext,
  evaluateAllAssertions,
  evaluateAssertion,
  extractAssertionLines,
  httpResponseToAssertionContext,
  parseAllAssertions,
  parseAssertionLine,
  parseRhs,
  resolveLhs,
  type AssertionContext,
} from "@/lib/blocks/assertions";

describe("extractAssertionLines", () => {
  it("returns empty when no marker is present", () => {
    expect(extractAssertionLines("GET /\n")).toEqual([]);
  });

  it("collects every commented line until a blank line", () => {
    const body = `GET /

# expect:
# status === 200
# time < 1000
# $.body.id === 1

# trailing comment after blank — ignored`;
    const out = extractAssertionLines(body);
    expect(out.map((l) => l.rawLine)).toEqual([
      "status === 200",
      "time < 1000",
      "$.body.id === 1",
    ]);
  });

  it("stops when a non-comment line shows up before blank", () => {
    const body = `# expect:
# a === 1
not-a-comment
# b === 2`;
    const out = extractAssertionLines(body);
    expect(out.map((l) => l.rawLine)).toEqual(["a === 1"]);
  });

  it("matches the marker case-insensitively", () => {
    expect(
      extractAssertionLines("# EXPECT:\n# status === 200").map(
        (l) => l.rawLine,
      ),
    ).toEqual(["status === 200"]);
  });

  it("attaches the 1-indexed body line number", () => {
    const body = `line1
# expect:
# status === 200`;
    const out = extractAssertionLines(body);
    expect(out[0].bodyLine).toBe(3);
  });
});

describe("parseAssertionLine", () => {
  it("parses `<lhs> === <rhs>`", () => {
    expect(parseAssertionLine("status === 200", 5)).toEqual({
      line: 5,
      raw: "status === 200",
      lhs: "status",
      op: "===",
      rhs: "200",
    });
  });

  it("parses `<` / `<=` / `>` / `>=`", () => {
    expect(parseAssertionLine("time < 1000", 1)?.op).toBe("<");
    expect(parseAssertionLine("time <= 1000", 1)?.op).toBe("<=");
    expect(parseAssertionLine("count > 0", 1)?.op).toBe(">");
    expect(parseAssertionLine("count >= 1", 1)?.op).toBe(">=");
  });

  it("parses word operators when surrounded by whitespace", () => {
    expect(parseAssertionLine("$.body.name matches /alice/i", 1)?.op).toBe(
      "matches",
    );
    expect(parseAssertionLine("$.body.tags contains 'admin'", 1)?.op).toBe(
      "contains",
    );
  });

  it("returns null on whitespace-only or empty lines", () => {
    expect(parseAssertionLine("", 1)).toBeNull();
    expect(parseAssertionLine("   ", 1)).toBeNull();
  });

  it("returns null when an operator is missing", () => {
    expect(parseAssertionLine("just a comment", 1)).toBeNull();
  });

  it("returns null when one side is empty", () => {
    expect(parseAssertionLine("=== 200", 1)).toBeNull();
    expect(parseAssertionLine("status ===", 1)).toBeNull();
  });
});

describe("parseAllAssertions", () => {
  it("composes extract + parse and drops unparseable lines silently", () => {
    const body = `GET /

# expect:
# status === 200
# this line cannot parse
# time < 1000`;
    const out = parseAllAssertions(body);
    expect(out.map((p) => p.lhs)).toEqual(["status", "time"]);
  });
});

describe("resolveLhs", () => {
  const ctx: AssertionContext = {
    status: 200,
    time_ms: 42,
    body: { id: 1, user: { name: "alice" }, tags: ["admin", "ops"] },
    headers: { "Content-Type": "application/json", "X-Trace": "abc" },
    row: [
      { id: 1, name: "row-one" },
      { id: 2, name: "row-two" },
    ],
  };

  it("resolves status / time", () => {
    expect(resolveLhs("status", ctx)).toBe(200);
    expect(resolveLhs("time", ctx)).toBe(42);
  });

  it("resolves $.body.<path> with dot descent", () => {
    expect(resolveLhs("$.body.id", ctx)).toBe(1);
    expect(resolveLhs("$.body.user.name", ctx)).toBe("alice");
  });

  it("resolves $.body[N] when the body is an array", () => {
    const ctxA: AssertionContext = { body: [10, 20, 30] };
    expect(resolveLhs("$.body[1]", ctxA)).toBe(20);
  });

  it("resolves $.headers case-insensitively", () => {
    expect(resolveLhs("$.headers.content-type", ctx)).toBe("application/json");
    expect(resolveLhs("$.headers.X-TRACE", ctx)).toBe("abc");
  });

  it("resolves $.row[N].col", () => {
    expect(resolveLhs("$.row[0].name", ctx)).toBe("row-one");
    expect(resolveLhs("$.row[1].id", ctx)).toBe(2);
  });

  it("returns undefined for missing paths", () => {
    expect(resolveLhs("$.body.nope", ctx)).toBeUndefined();
    expect(resolveLhs("$.headers.missing", { headers: {} })).toBeUndefined();
    expect(resolveLhs("$.row[5].id", ctx)).toBeUndefined();
  });

  it("returns undefined for unknown LHS shapes", () => {
    expect(resolveLhs("anything", ctx)).toBeUndefined();
  });
});

describe("parseRhs", () => {
  it("parses numeric literals (positive, negative, decimal)", () => {
    expect(parseRhs("200")).toEqual({ kind: "number", value: 200 });
    expect(parseRhs("-42")).toEqual({ kind: "number", value: -42 });
    expect(parseRhs("1.5")).toEqual({ kind: "number", value: 1.5 });
  });

  it("parses double-quoted and single-quoted strings", () => {
    expect(parseRhs('"hello"')).toEqual({ kind: "string", value: "hello" });
    expect(parseRhs("'world'")).toEqual({ kind: "string", value: "world" });
  });

  it("parses regex literals with flags", () => {
    const r = parseRhs("/^hello$/i");
    expect(r.kind).toBe("regex");
    if (r.kind === "regex") {
      expect(r.value.source).toBe("^hello$");
      expect(r.value.flags).toBe("i");
    }
  });

  it("falls back to raw when nothing else matches", () => {
    expect(parseRhs("ok")).toEqual({ kind: "raw", value: "ok" });
  });
});

describe("evaluateAssertion / evaluateAllAssertions", () => {
  const ctx: AssertionContext = {
    status: 200,
    time_ms: 87,
    body: { id: 1, name: "alice", tags: ["admin", "ops"] },
    headers: { "Content-Type": "application/json" },
    row: [{ col: "x" }],
  };

  function ev(line: string) {
    const parsed = parseAssertionLine(line, 1);
    if (!parsed) throw new Error(`could not parse: ${line}`);
    return evaluateAssertion(parsed, ctx);
  }

  it("=== passes on equal numbers and fails otherwise", () => {
    expect(ev("status === 200").pass).toBe(true);
    expect(ev("status === 404").pass).toBe(false);
  });

  it("!== inverts ===", () => {
    expect(ev("status !== 404").pass).toBe(true);
    expect(ev("status !== 200").pass).toBe(false);
  });

  it("comparison operators work on numbers", () => {
    expect(ev("time < 1000").pass).toBe(true);
    expect(ev("time <= 87").pass).toBe(true);
    expect(ev("time > 50").pass).toBe(true);
    expect(ev("time >= 87").pass).toBe(true);
    expect(ev("time < 50").pass).toBe(false);
  });

  it("matches uses regex literal", () => {
    expect(ev("$.body.name matches /^al/").pass).toBe(true);
    expect(ev("$.body.name matches /^bob$/").pass).toBe(false);
  });

  it("contains matches substring on strings", () => {
    expect(ev("$.body.name contains 'lic'").pass).toBe(true);
    expect(ev("$.body.name contains 'zzz'").pass).toBe(false);
  });

  it("contains matches array element when actual is an array", () => {
    expect(ev("$.body.tags contains 'admin'").pass).toBe(true);
    expect(ev("$.body.tags contains 'missing'").pass).toBe(false);
  });

  it("=== with regex literal also works as a 'matches' shortcut", () => {
    expect(ev("$.body.name === /^al/").pass).toBe(true);
  });

  it("=== falls back to stringification for raw RHS tokens", () => {
    expect(ev("$.body.id === 1").pass).toBe(true);
    expect(ev("$.body.name === alice").pass).toBe(true);
  });

  it("attaches a failure record with line + raw + actual + expected", () => {
    const result = ev("status === 404");
    expect(result.pass).toBe(false);
    if (!result.pass) {
      expect(result.failure.line).toBe(1);
      expect(result.failure.raw).toBe("status === 404");
      expect(result.failure.actual).toBe(200);
      expect(result.failure.expected).toBe(404);
      expect(result.failure.reason).toMatch(/not equal/);
    }
  });

  it("numeric compare fails clearly when actual isn't a number", () => {
    const result = ev("$.body.name > 100");
    expect(result.pass).toBe(false);
    if (!result.pass) expect(result.failure.reason).toMatch(/not a number/);
  });

  it("matches fails clearly when rhs isn't a regex literal", () => {
    const result = ev("$.body.name matches alice");
    expect(result.pass).toBe(false);
    if (!result.pass) expect(result.failure.reason).toMatch(/regex/);
  });

  it("evaluateAllAssertions aggregates pass=true when every check passes", () => {
    const parsed = parseAllAssertions(`# expect:
# status === 200
# time < 1000`);
    const out = evaluateAllAssertions(parsed, ctx);
    expect(out.pass).toBe(true);
    expect(out.failures).toEqual([]);
  });

  it("evaluateAllAssertions aggregates failures and flips pass=false", () => {
    const parsed = parseAllAssertions(`# expect:
# status === 200
# status === 404
# time < 10`);
    const out = evaluateAllAssertions(parsed, ctx);
    expect(out.pass).toBe(false);
    expect(out.failures.length).toBe(2);
    expect(out.failures[0].raw).toContain("status === 404");
  });
});

describe("httpResponseToAssertionContext", () => {
  it("maps status_code / headers / body straight through", () => {
    const ctx = httpResponseToAssertionContext({
      status_code: 200,
      headers: { "Content-Type": "application/json" },
      body: { id: 1 },
      elapsed_ms: 42,
    });
    expect(ctx.status).toBe(200);
    expect(ctx.headers).toEqual({ "Content-Type": "application/json" });
    expect(ctx.body).toEqual({ id: 1 });
  });

  it("prefers timing.total_ms over elapsed_ms when present", () => {
    const ctx = httpResponseToAssertionContext({
      status_code: 200,
      headers: {},
      body: null,
      elapsed_ms: 99,
      timing: { total_ms: 42 },
    });
    expect(ctx.time_ms).toBe(42);
  });

  it("falls back to elapsed_ms when timing.total_ms is missing", () => {
    const ctx = httpResponseToAssertionContext({
      status_code: 200,
      headers: {},
      body: null,
      elapsed_ms: 99,
    });
    expect(ctx.time_ms).toBe(99);
  });
});

describe("dbResponseToAssertionContext", () => {
  it("uses the first SELECT result's rows for $.row", () => {
    const ctx = dbResponseToAssertionContext({
      results: [{ kind: "select", rows: [{ id: 1 }, { id: 2 }] }],
      stats: { elapsed_ms: 7 },
    });
    expect(ctx.row).toEqual([{ id: 1 }, { id: 2 }]);
    expect(ctx.body).toEqual([{ id: 1 }, { id: 2 }]);
    expect(ctx.time_ms).toBe(7);
  });

  it("returns empty rows when no SELECT result is present", () => {
    const ctx = dbResponseToAssertionContext({
      results: [{ kind: "mutation", rows_affected: 3 }],
    });
    expect(ctx.row).toEqual([]);
    expect(ctx.body).toEqual([]);
  });

  it("returns empty rows when SELECT exists but rows isn't an array", () => {
    const ctx = dbResponseToAssertionContext({
      results: [{ kind: "select", rows: null }],
    });
    expect(ctx.row).toEqual([]);
  });

  it("works with no stats", () => {
    const ctx = dbResponseToAssertionContext({
      results: [],
    });
    expect(ctx.time_ms).toBeUndefined();
  });
});
