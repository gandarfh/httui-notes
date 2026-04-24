import { describe, it, expect } from "vitest";
import {
  isMutationQuery,
  isUnscopedWriteQuery,
  describeDangerousQuery,
} from "../sql-mutation";

describe("isMutationQuery", () => {
  it("accepts plain mutations", () => {
    expect(isMutationQuery("UPDATE users SET x = 1 WHERE id = 2")).toBe(true);
    expect(isMutationQuery("delete from users where id = 2")).toBe(true);
    expect(isMutationQuery("INSERT INTO t (a) VALUES (1)")).toBe(true);
    expect(isMutationQuery("DROP TABLE users")).toBe(true);
  });

  it("ignores SELECT / WITH / VACUUM / PRAGMA / EXPLAIN", () => {
    expect(isMutationQuery("SELECT * FROM users")).toBe(false);
    expect(isMutationQuery("WITH t AS (SELECT 1) SELECT * FROM t")).toBe(false);
    expect(isMutationQuery("  EXPLAIN ANALYZE SELECT 1")).toBe(false);
    expect(isMutationQuery("PRAGMA table_info(x)")).toBe(false);
  });

  it("strips line and block comments before checking", () => {
    expect(isMutationQuery("-- drop pretending\nSELECT 1")).toBe(false);
    expect(isMutationQuery("/* DROP */ UPDATE users SET x = 1")).toBe(true);
  });
});

describe("isUnscopedWriteQuery", () => {
  it("flags UPDATE without WHERE", () => {
    expect(isUnscopedWriteQuery("UPDATE users SET active = 0")).toBe(true);
  });

  it("flags DELETE without WHERE", () => {
    expect(isUnscopedWriteQuery("DELETE FROM users")).toBe(true);
  });

  it("accepts scoped writes", () => {
    expect(isUnscopedWriteQuery("UPDATE users SET x = 1 WHERE id = 2")).toBe(false);
    expect(isUnscopedWriteQuery("DELETE FROM users WHERE id = 2")).toBe(false);
  });

  it("does not fire on non-mutations", () => {
    expect(isUnscopedWriteQuery("SELECT * FROM users")).toBe(false);
    expect(isUnscopedWriteQuery("INSERT INTO t VALUES (1)")).toBe(false);
  });
});

describe("describeDangerousQuery", () => {
  it("returns null for plain SELECT regardless of read-only flag", () => {
    expect(describeDangerousQuery("SELECT 1", false)).toBeNull();
    expect(describeDangerousQuery("SELECT 1", true)).toBeNull();
  });

  it("explains read-only mismatch first", () => {
    const reason = describeDangerousQuery("INSERT INTO t VALUES (1)", true);
    expect(reason).toContain("read-only");
  });

  it("warns on unscoped DELETE even when connection is writable", () => {
    const reason = describeDangerousQuery("DELETE FROM users", false);
    expect(reason).toContain("WHERE");
  });

  it("returns null for scoped mutation on writable connection", () => {
    expect(
      describeDangerousQuery("UPDATE users SET x = 1 WHERE id = 2", false),
    ).toBeNull();
  });
});
