import { beforeEach, describe, expect, it } from "vitest";

import { useCaptureStore } from "@/stores/captureStore";

describe("useCaptureStore", () => {
  beforeEach(() => {
    useCaptureStore.setState({ values: {} });
  });

  it("starts empty", () => {
    expect(useCaptureStore.getState().values).toEqual({});
  });

  it("setBlockCaptures wraps each value in a CaptureEntry with isSecret", () => {
    useCaptureStore
      .getState()
      .setBlockCaptures("a.md", "login", { token: "t", user_id: 99 });
    const block = useCaptureStore.getState().values["a.md"]?.["login"];
    expect(block?.token).toEqual({ value: "t", isSecret: true });
    expect(block?.user_id).toEqual({ value: 99, isSecret: false });
  });

  it("coerces non-primitive values to null", () => {
    useCaptureStore.getState().setBlockCaptures("a.md", "x", {
      obj: { nested: 1 },
      arr: [1, 2],
      und: undefined,
      nil: null,
      bool: true,
    });
    const block = useCaptureStore.getState().values["a.md"]?.["x"];
    expect(block?.obj.value).toBeNull();
    expect(block?.arr.value).toBeNull();
    expect(block?.und.value).toBeNull();
    expect(block?.nil.value).toBeNull();
    expect(block?.bool.value).toBe(true);
  });

  it("setBlockCaptures replaces the alias map (no merge)", () => {
    useCaptureStore.getState().setBlockCaptures("a.md", "x", { a: 1 });
    useCaptureStore.getState().setBlockCaptures("a.md", "x", { b: 2 });
    expect(useCaptureStore.getState().values["a.md"]?.["x"]).toEqual({
      b: { value: 2, isSecret: false },
    });
  });

  it("setBlockCaptures preserves siblings under the same file", () => {
    useCaptureStore.getState().setBlockCaptures("a.md", "x", { a: 1 });
    useCaptureStore.getState().setBlockCaptures("a.md", "y", { b: 2 });
    expect(
      Object.keys(useCaptureStore.getState().values["a.md"] ?? {}),
    ).toEqual(["x", "y"]);
  });

  it("clearBlockCaptures drops the alias and the whole file when last", () => {
    useCaptureStore.getState().setBlockCaptures("a.md", "x", { a: 1 });
    useCaptureStore.getState().clearBlockCaptures("a.md", "x");
    expect(useCaptureStore.getState().values).toEqual({});
  });

  it("clearBlockCaptures keeps siblings when removing one alias", () => {
    useCaptureStore.getState().setBlockCaptures("a.md", "x", { a: 1 });
    useCaptureStore.getState().setBlockCaptures("a.md", "y", { b: 2 });
    useCaptureStore.getState().clearBlockCaptures("a.md", "x");
    expect(
      Object.keys(useCaptureStore.getState().values["a.md"] ?? {}),
    ).toEqual(["y"]);
  });

  it("clearBlockCaptures is a no-op when alias not present", () => {
    useCaptureStore.getState().setBlockCaptures("a.md", "x", { a: 1 });
    const before = useCaptureStore.getState().values;
    useCaptureStore.getState().clearBlockCaptures("a.md", "missing");
    expect(useCaptureStore.getState().values).toBe(before);
  });

  it("clearFile drops every alias for the file", () => {
    useCaptureStore.getState().setBlockCaptures("a.md", "x", { a: 1 });
    useCaptureStore.getState().setBlockCaptures("a.md", "y", { b: 2 });
    useCaptureStore.getState().setBlockCaptures("b.md", "z", { c: 3 });
    useCaptureStore.getState().clearFile("a.md");
    expect(useCaptureStore.getState().values).toEqual({
      "b.md": { z: { c: { value: 3, isSecret: false } } },
    });
  });

  it("clearFile is a no-op when file not present", () => {
    useCaptureStore.getState().setBlockCaptures("a.md", "x", { a: 1 });
    const before = useCaptureStore.getState().values;
    useCaptureStore.getState().clearFile("missing.md");
    expect(useCaptureStore.getState().values).toBe(before);
  });

  it("clearAll resets the entire store", () => {
    useCaptureStore.getState().setBlockCaptures("a.md", "x", { a: 1 });
    useCaptureStore.getState().setBlockCaptures("b.md", "y", { b: 2 });
    useCaptureStore.getState().clearAll();
    expect(useCaptureStore.getState().values).toEqual({});
  });

  it("getCapture returns the entry or undefined", () => {
    useCaptureStore.getState().setBlockCaptures("a.md", "x", { a: "v" });
    expect(useCaptureStore.getState().getCapture("a.md", "x", "a")).toEqual({
      value: "v",
      isSecret: false,
    });
    expect(
      useCaptureStore.getState().getCapture("a.md", "x", "missing"),
    ).toBeUndefined();
    expect(
      useCaptureStore.getState().getCapture("nope.md", "x", "a"),
    ).toBeUndefined();
  });

  it("getBlockCaptures returns the alias map or {}", () => {
    useCaptureStore.getState().setBlockCaptures("a.md", "x", { a: 1, b: 2 });
    const block = useCaptureStore.getState().getBlockCaptures("a.md", "x");
    expect(Object.keys(block)).toEqual(["a", "b"]);
    expect(useCaptureStore.getState().getBlockCaptures("nope.md", "x")).toEqual(
      {},
    );
  });
});
