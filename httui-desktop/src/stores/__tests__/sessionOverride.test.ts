import { beforeEach, describe, expect, it } from "vitest";

import { useSessionOverrideStore } from "@/stores/sessionOverride";

describe("useSessionOverrideStore", () => {
  beforeEach(() => {
    useSessionOverrideStore.setState({ overrides: {} });
  });

  it("starts empty", () => {
    expect(useSessionOverrideStore.getState().overrides).toEqual({});
  });

  it("setOverride adds the env+key entry", () => {
    useSessionOverrideStore.getState().setOverride("local", "API", "x");
    expect(useSessionOverrideStore.getState().overrides).toEqual({
      local: { API: "x" },
    });
  });

  it("setOverride preserves other entries when adding to the same env", () => {
    useSessionOverrideStore.getState().setOverride("local", "A", "1");
    useSessionOverrideStore.getState().setOverride("local", "B", "2");
    expect(useSessionOverrideStore.getState().overrides).toEqual({
      local: { A: "1", B: "2" },
    });
  });

  it("setOverride replaces an existing value for the same env+key", () => {
    useSessionOverrideStore.getState().setOverride("local", "A", "1");
    useSessionOverrideStore.getState().setOverride("local", "A", "2");
    expect(useSessionOverrideStore.getState().getOverride("local", "A")).toBe(
      "2",
    );
  });

  it("clearOverride removes the entry; drops the env when last key", () => {
    useSessionOverrideStore.getState().setOverride("local", "A", "1");
    useSessionOverrideStore.getState().clearOverride("local", "A");
    expect(useSessionOverrideStore.getState().overrides).toEqual({});
  });

  it("clearOverride keeps siblings when removing one of many", () => {
    useSessionOverrideStore.getState().setOverride("local", "A", "1");
    useSessionOverrideStore.getState().setOverride("local", "B", "2");
    useSessionOverrideStore.getState().clearOverride("local", "A");
    expect(useSessionOverrideStore.getState().overrides).toEqual({
      local: { B: "2" },
    });
  });

  it("clearOverride is a no-op when the env+key was not set", () => {
    const before = useSessionOverrideStore.getState().overrides;
    useSessionOverrideStore.getState().clearOverride("local", "NOPE");
    expect(useSessionOverrideStore.getState().overrides).toBe(before);
  });

  it("clearAllForKey drops the key across every env, keeps the rest", () => {
    useSessionOverrideStore.getState().setOverride("local", "API", "1");
    useSessionOverrideStore.getState().setOverride("staging", "API", "2");
    useSessionOverrideStore.getState().setOverride("local", "OTHER", "3");
    useSessionOverrideStore.getState().clearAllForKey("API");
    expect(useSessionOverrideStore.getState().overrides).toEqual({
      local: { OTHER: "3" },
    });
  });

  it("clearAllForKey is a no-op when the key isn't overridden anywhere", () => {
    useSessionOverrideStore.getState().setOverride("local", "API", "1");
    const before = useSessionOverrideStore.getState().overrides;
    useSessionOverrideStore.getState().clearAllForKey("NOPE");
    expect(useSessionOverrideStore.getState().overrides).toBe(before);
  });

  it("clearAll resets the entire map", () => {
    useSessionOverrideStore.getState().setOverride("local", "A", "1");
    useSessionOverrideStore.getState().setOverride("staging", "B", "2");
    useSessionOverrideStore.getState().clearAll();
    expect(useSessionOverrideStore.getState().overrides).toEqual({});
  });

  it("getOverride returns undefined when nothing is set", () => {
    expect(
      useSessionOverrideStore.getState().getOverride("local", "MISSING"),
    ).toBeUndefined();
  });
});
