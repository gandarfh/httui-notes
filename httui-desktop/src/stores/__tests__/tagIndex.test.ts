import { beforeEach, describe, expect, it } from "vitest";

import { useTagIndexStore } from "../tagIndex";

beforeEach(() => {
  useTagIndexStore.getState().clearAll();
});

describe("tagIndex store", () => {
  it("starts empty", () => {
    const s = useTagIndexStore.getState();
    expect(s.getAllTags()).toEqual([]);
    expect(s.getFilesByTag("anything")).toEqual([]);
  });

  it("indexes a file's tags on setTagsForFile", () => {
    useTagIndexStore.getState().setTagsForFile("a.md", ["payments", "debug"]);
    const s = useTagIndexStore.getState();
    expect(s.getAllTags()).toEqual(["debug", "payments"]);
    expect(s.getFilesByTag("payments")).toEqual(["a.md"]);
    expect(s.getFilesByTag("debug")).toEqual(["a.md"]);
  });

  it("merges multiple files under the same tag", () => {
    const s = useTagIndexStore.getState();
    s.setTagsForFile("a.md", ["x"]);
    s.setTagsForFile("b.md", ["x"]);
    expect(useTagIndexStore.getState().getFilesByTag("x")).toEqual([
      "a.md",
      "b.md",
    ]);
  });

  it("setTagsForFile replaces the previous tag set for that file", () => {
    const s = useTagIndexStore.getState();
    s.setTagsForFile("a.md", ["x", "y"]);
    s.setTagsForFile("a.md", ["y", "z"]);
    const after = useTagIndexStore.getState();
    expect(after.getAllTags()).toEqual(["y", "z"]);
    expect(after.getFilesByTag("x")).toEqual([]);
    expect(after.getFilesByTag("y")).toEqual(["a.md"]);
    expect(after.getFilesByTag("z")).toEqual(["a.md"]);
  });

  it("removes orphaned tag entries when no files reference them", () => {
    const s = useTagIndexStore.getState();
    s.setTagsForFile("a.md", ["x"]);
    s.setTagsForFile("a.md", []);
    expect(useTagIndexStore.getState().getAllTags()).toEqual([]);
  });

  it("removeFile drops the file from every tag bucket", () => {
    const s = useTagIndexStore.getState();
    s.setTagsForFile("a.md", ["x"]);
    s.setTagsForFile("b.md", ["x", "y"]);
    s.removeFile("a.md");
    const after = useTagIndexStore.getState();
    expect(after.getFilesByTag("x")).toEqual(["b.md"]);
    expect(after.getFilesByTag("y")).toEqual(["b.md"]);
    expect(after.getAllTags()).toEqual(["x", "y"]);
  });

  it("removeFile is a no-op for unknown files", () => {
    const s = useTagIndexStore.getState();
    s.setTagsForFile("a.md", ["x"]);
    const before = useTagIndexStore.getState();
    s.removeFile("nope.md");
    const after = useTagIndexStore.getState();
    expect(after.byTag).toEqual(before.byTag);
    expect(after.byFile).toEqual(before.byFile);
  });

  it("removeFile drops orphaned tags entirely", () => {
    const s = useTagIndexStore.getState();
    s.setTagsForFile("a.md", ["unique"]);
    s.removeFile("a.md");
    expect(useTagIndexStore.getState().getAllTags()).toEqual([]);
  });

  it("clearAll resets everything", () => {
    const s = useTagIndexStore.getState();
    s.setTagsForFile("a.md", ["x"]);
    s.setTagsForFile("b.md", ["y"]);
    s.clearAll();
    const after = useTagIndexStore.getState();
    expect(after.byTag).toEqual({});
    expect(after.byFile).toEqual({});
  });

  it("getAllTags returns sorted output", () => {
    const s = useTagIndexStore.getState();
    s.setTagsForFile("a.md", ["zebra", "alpha", "mango"]);
    expect(useTagIndexStore.getState().getAllTags()).toEqual([
      "alpha",
      "mango",
      "zebra",
    ]);
  });

  it("getFilesByTag returns sorted output", () => {
    const s = useTagIndexStore.getState();
    s.setTagsForFile("zebra.md", ["t"]);
    s.setTagsForFile("alpha.md", ["t"]);
    s.setTagsForFile("mango.md", ["t"]);
    expect(useTagIndexStore.getState().getFilesByTag("t")).toEqual([
      "alpha.md",
      "mango.md",
      "zebra.md",
    ]);
  });
});
