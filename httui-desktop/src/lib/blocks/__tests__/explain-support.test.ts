import { describe, expect, it } from "vitest";

import {
  EXPLAIN_BODY_CAP,
  EXPLAIN_SUPPORTED_DRIVERS,
  driverSupportsExplain,
} from "@/lib/blocks/explain-support";

describe("driverSupportsExplain", () => {
  it("matches Postgres aliases", () => {
    expect(driverSupportsExplain("postgres")).toBe(true);
    expect(driverSupportsExplain("postgresql")).toBe(true);
    expect(driverSupportsExplain("pg")).toBe(true);
  });

  it("matches MySQL family", () => {
    expect(driverSupportsExplain("mysql")).toBe(true);
    expect(driverSupportsExplain("mariadb")).toBe(true);
  });

  it("rejects SQLite per spec", () => {
    expect(driverSupportsExplain("sqlite")).toBe(false);
  });

  it("rejects unknown drivers", () => {
    expect(driverSupportsExplain("oracle")).toBe(false);
    expect(driverSupportsExplain("bigquery")).toBe(false);
    expect(driverSupportsExplain("snowflake")).toBe(false);
    expect(driverSupportsExplain("mongo")).toBe(false);
  });

  it("normalizes case and whitespace", () => {
    expect(driverSupportsExplain("  Postgres  ")).toBe(true);
    expect(driverSupportsExplain("MYSQL")).toBe(true);
    expect(driverSupportsExplain(" MariaDB ")).toBe(true);
  });

  it("treats empty / null / undefined as unsupported", () => {
    expect(driverSupportsExplain("")).toBe(false);
    expect(driverSupportsExplain("   ")).toBe(false);
    expect(driverSupportsExplain(null)).toBe(false);
    expect(driverSupportsExplain(undefined)).toBe(false);
  });

  it("EXPLAIN_BODY_CAP mirrors backend value", () => {
    expect(EXPLAIN_BODY_CAP).toBe(200_000);
  });

  it("EXPLAIN_SUPPORTED_DRIVERS is the documented set", () => {
    expect(Array.from(EXPLAIN_SUPPORTED_DRIVERS).sort()).toEqual(
      ["mariadb", "mysql", "pg", "postgres", "postgresql"].sort(),
    );
  });
});
