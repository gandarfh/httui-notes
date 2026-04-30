import { describe, expect, it } from "vitest";

import {
  hasAnyOverride,
  resolveVariableValue,
} from "@/components/layout/variables/session-override-resolver";
import type { VariableRow } from "@/components/layout/variables/variable-derive";

function row(over: Partial<VariableRow> = {}): VariableRow {
  return {
    key: "API",
    scope: "workspace",
    isSecret: false,
    values: { local: "from-toml", prod: "prod-toml" },
    usesCount: 0,
    ...over,
  };
}

describe("resolveVariableValue", () => {
  it("returns the row value when no override is present", () => {
    const out = resolveVariableValue(row(), "local", {});
    expect(out).toEqual({ value: "from-toml", isOverridden: false });
  });

  it("returns the row value (undefined) when env is missing from row", () => {
    const out = resolveVariableValue(row(), "staging", {});
    expect(out).toEqual({ value: undefined, isOverridden: false });
  });

  it("returns the override when set for the same env+key", () => {
    const out = resolveVariableValue(row(), "local", {
      local: { API: "from-session" },
    });
    expect(out).toEqual({ value: "from-session", isOverridden: true });
  });

  it("ignores overrides for a different env", () => {
    const out = resolveVariableValue(row(), "local", {
      prod: { API: "prod-override" },
    });
    expect(out).toEqual({ value: "from-toml", isOverridden: false });
  });

  it("ignores overrides for a different key", () => {
    const out = resolveVariableValue(row(), "local", {
      local: { OTHER: "x" },
    });
    expect(out).toEqual({ value: "from-toml", isOverridden: false });
  });

  it("treats an empty-string override as an active override", () => {
    const out = resolveVariableValue(row(), "local", {
      local: { API: "" },
    });
    expect(out).toEqual({ value: "", isOverridden: true });
  });
});

describe("hasAnyOverride", () => {
  it("returns true when any of the envs has an override for the key", () => {
    const overrides = { staging: { API: "x" } };
    expect(hasAnyOverride("API", ["local", "staging", "prod"], overrides)).toBe(
      true,
    );
  });

  it("returns false when none of the envs have an override", () => {
    expect(
      hasAnyOverride("API", ["local", "prod"], { staging: { API: "x" } }),
    ).toBe(false);
  });

  it("returns false on empty envNames", () => {
    expect(hasAnyOverride("API", [], { local: { API: "x" } })).toBe(false);
  });
});
