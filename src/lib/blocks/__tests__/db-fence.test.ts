import { describe, it, expect } from "vitest";
import {
  parseDbFenceInfo,
  stringifyDbFenceInfo,
  isLegacyDbBody,
  parseLegacyDbBody,
  type DbBlockMetadata,
} from "../db-fence";

describe("parseDbFenceInfo", () => {
  it("parses dialect-only info strings", () => {
    expect(parseDbFenceInfo("db-postgres")).toEqual({ dialect: "postgres" });
    expect(parseDbFenceInfo("db-mysql")).toEqual({ dialect: "mysql" });
    expect(parseDbFenceInfo("db-sqlite")).toEqual({ dialect: "sqlite" });
    expect(parseDbFenceInfo("db")).toEqual({ dialect: "generic" });
  });

  it("returns null for non-db dialects", () => {
    expect(parseDbFenceInfo("http alias=x")).toBeNull();
    expect(parseDbFenceInfo("e2e")).toBeNull();
    expect(parseDbFenceInfo("javascript")).toBeNull();
    expect(parseDbFenceInfo("")).toBeNull();
  });

  it("parses a complete canonical info string", () => {
    const meta = parseDbFenceInfo(
      "db-postgres alias=db1 connection=prod limit=100 timeout=30000 display=split session=doc",
    );
    expect(meta).toEqual({
      dialect: "postgres",
      alias: "db1",
      connection: "prod",
      limit: 100,
      timeoutMs: 30000,
      displayMode: "split",
      session: { kind: "doc" },
    });
  });

  it("is order-independent on read", () => {
    const a = parseDbFenceInfo(
      "db-postgres alias=db1 connection=prod limit=100",
    );
    const b = parseDbFenceInfo(
      "db-postgres limit=100 connection=prod alias=db1",
    );
    expect(a).toEqual(b);
  });

  it("accepts legacy displayMode key", () => {
    const meta = parseDbFenceInfo("db-postgres alias=x displayMode=output");
    expect(meta?.displayMode).toBe("output");
  });

  it("prefers new display key over legacy when both present", () => {
    // Last-write-wins via switch-case iteration; confirm behavior is deterministic.
    const meta = parseDbFenceInfo(
      "db-postgres displayMode=input display=output",
    );
    expect(meta?.displayMode).toBe("output");
  });

  it("ignores unknown keys silently", () => {
    const meta = parseDbFenceInfo(
      "db-postgres alias=db1 foo=bar baz=qux connection=prod",
    );
    expect(meta).toEqual({
      dialect: "postgres",
      alias: "db1",
      connection: "prod",
    });
  });

  it("ignores invalid values silently", () => {
    const meta = parseDbFenceInfo(
      "db-postgres alias=db1 limit=abc timeout=-5 display=weird session=bogus",
    );
    expect(meta).toEqual({
      dialect: "postgres",
      alias: "db1",
    });
  });

  it("rejects zero-length values", () => {
    const meta = parseDbFenceInfo("db-postgres alias= connection=prod");
    expect(meta).toEqual({ dialect: "postgres", connection: "prod" });
  });

  it("parses session named:<id>", () => {
    const meta = parseDbFenceInfo("db-postgres session=named:runbook-42");
    expect(meta?.session).toEqual({ kind: "named", id: "runbook-42" });
  });

  it("rejects session=named without id", () => {
    const meta = parseDbFenceInfo("db-postgres session=named:");
    expect(meta?.session).toBeUndefined();
  });

  it("tolerates extra whitespace between tokens", () => {
    const meta = parseDbFenceInfo(
      "  db-postgres    alias=db1   connection=prod  ",
    );
    expect(meta).toEqual({
      dialect: "postgres",
      alias: "db1",
      connection: "prod",
    });
  });

  it("truncates fractional limit/timeout to integers", () => {
    const meta = parseDbFenceInfo("db-postgres limit=100.9 timeout=5000.5");
    expect(meta?.limit).toBe(100);
    expect(meta?.timeoutMs).toBe(5000);
  });
});

describe("stringifyDbFenceInfo", () => {
  it("emits dialect-only string when metadata has no extras", () => {
    expect(stringifyDbFenceInfo({ dialect: "postgres" })).toBe("db-postgres");
    expect(stringifyDbFenceInfo({ dialect: "mysql" })).toBe("db-mysql");
    expect(stringifyDbFenceInfo({ dialect: "sqlite" })).toBe("db-sqlite");
    expect(stringifyDbFenceInfo({ dialect: "generic" })).toBe("db");
  });

  it("emits canonical order regardless of property iteration order", () => {
    const meta: DbBlockMetadata = {
      dialect: "postgres",
      session: { kind: "doc" },
      displayMode: "split",
      timeoutMs: 30000,
      limit: 100,
      connection: "prod",
      alias: "db1",
    };
    expect(stringifyDbFenceInfo(meta)).toBe(
      "db-postgres alias=db1 connection=prod limit=100 timeout=30000 display=split session=doc",
    );
  });

  it("omits undefined fields", () => {
    expect(
      stringifyDbFenceInfo({
        dialect: "postgres",
        alias: "db1",
        displayMode: "split",
      }),
    ).toBe("db-postgres alias=db1 display=split");
  });

  it("serializes session named:<id>", () => {
    expect(
      stringifyDbFenceInfo({
        dialect: "postgres",
        session: { kind: "named", id: "shared" },
      }),
    ).toBe("db-postgres session=named:shared");
  });
});

describe("parseDbFenceInfo + stringifyDbFenceInfo roundtrip", () => {
  const cases: DbBlockMetadata[] = [
    { dialect: "postgres" },
    { dialect: "mysql", alias: "users" },
    {
      dialect: "postgres",
      alias: "db1",
      connection: "prod",
      limit: 100,
      timeoutMs: 30000,
      displayMode: "split",
      session: { kind: "doc" },
    },
    { dialect: "sqlite", session: { kind: "none" } },
    {
      dialect: "postgres",
      session: { kind: "named", id: "runbook-1" },
    },
    { dialect: "mysql", connection: "550e8400-e29b-41d4-a716-446655440000" },
  ];

  it.each(cases)("roundtrip preserves shape for %o", (meta) => {
    const str = stringifyDbFenceInfo(meta);
    const parsed = parseDbFenceInfo(str);
    expect(parsed).toEqual(meta);
  });

  it("stringify is idempotent (two roundtrips = one)", () => {
    const meta: DbBlockMetadata = {
      dialect: "postgres",
      alias: "db1",
      connection: "prod",
      limit: 50,
      displayMode: "output",
    };
    const once = stringifyDbFenceInfo(meta);
    const twice = stringifyDbFenceInfo(parseDbFenceInfo(once)!);
    expect(twice).toBe(once);
  });

  it("reading different orderings produces identical canonical output", () => {
    const a = parseDbFenceInfo(
      "db-postgres alias=db1 connection=prod limit=100",
    )!;
    const b = parseDbFenceInfo(
      "db-postgres limit=100 alias=db1 connection=prod",
    )!;
    expect(stringifyDbFenceInfo(a)).toBe(stringifyDbFenceInfo(b));
  });
});

describe("isLegacyDbBody / parseLegacyDbBody", () => {
  it("detects legacy JSON body with query field", () => {
    const body = '{"connection_id":"abc","query":"SELECT 1"}';
    expect(isLegacyDbBody(body)).toBe(true);
    expect(parseLegacyDbBody(body)).toEqual({
      query: "SELECT 1",
      connectionId: "abc",
    });
  });

  it("treats raw SQL as non-legacy", () => {
    expect(isLegacyDbBody("SELECT * FROM users")).toBe(false);
    expect(parseLegacyDbBody("SELECT * FROM users")).toBeNull();
  });

  it("treats empty body as non-legacy", () => {
    expect(isLegacyDbBody("")).toBe(false);
    expect(parseLegacyDbBody("")).toBeNull();
  });

  it("treats malformed JSON as non-legacy", () => {
    expect(isLegacyDbBody("{not valid json")).toBe(false);
  });

  it("treats JSON without `query` as non-legacy", () => {
    expect(isLegacyDbBody('{"foo":"bar"}')).toBe(false);
    expect(parseLegacyDbBody('{"foo":"bar"}')).toBeNull();
  });

  it("treats JSON where `query` is not a string as non-legacy", () => {
    expect(isLegacyDbBody('{"query":123}')).toBe(false);
  });

  it("accepts both snake_case and camelCase connection id", () => {
    expect(parseLegacyDbBody('{"connectionId":"x","query":"SELECT 1"}'))
      .toEqual({ query: "SELECT 1", connectionId: "x" });
    expect(parseLegacyDbBody('{"connection_id":"y","query":"SELECT 1"}'))
      .toEqual({ query: "SELECT 1", connectionId: "y" });
  });

  it("accepts both snake_case and camelCase timeout", () => {
    expect(parseLegacyDbBody('{"query":"SELECT 1","timeout_ms":5000}'))
      .toEqual({ query: "SELECT 1", timeoutMs: 5000 });
    expect(parseLegacyDbBody('{"query":"SELECT 1","timeoutMs":5000}'))
      .toEqual({ query: "SELECT 1", timeoutMs: 5000 });
  });

  it("tolerates leading whitespace in body", () => {
    const body = '  \n  {"query":"SELECT 1"}';
    expect(isLegacyDbBody(body)).toBe(true);
    expect(parseLegacyDbBody(body)).toEqual({ query: "SELECT 1" });
  });

  it("rejects bodies that don't start with `{` after trim", () => {
    expect(isLegacyDbBody('// comment\n{"query":"SELECT 1"}')).toBe(false);
  });
});
