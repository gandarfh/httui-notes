import { describe, it, expect } from "vitest";
import {
  findLeaf,
  updateLeaf,
  removeLeaf,
  allLeafIds,
  updateSplitRatio,
  replacePaneInLayout,
} from "@/stores/pane";
import type { PaneLayout, LeafPane } from "@/types/pane";

function leaf(id: string, tabs: string[] = []): LeafPane {
  return {
    type: "leaf",
    id,
    tabs: tabs.map((fp) => ({ filePath: fp, vaultPath: "/vault", unsaved: false })),
    activeTab: 0,
  };
}

function split(
  left: PaneLayout,
  right: PaneLayout,
  direction: "vertical" | "horizontal" = "vertical",
  ratio = 0.5,
): PaneLayout {
  return { type: "split", direction, children: [left, right], ratio };
}

describe("findLeaf", () => {
  it("finds a leaf in a single-leaf tree", () => {
    const l = leaf("a");
    expect(findLeaf(l, "a")).toBe(l);
  });

  it("returns null for non-existent id", () => {
    expect(findLeaf(leaf("a"), "b")).toBeNull();
  });

  it("finds a leaf in a split tree", () => {
    const target = leaf("b");
    const tree = split(leaf("a"), target);
    expect(findLeaf(tree, "b")).toBe(target);
  });

  it("finds deeply nested leaf", () => {
    const target = leaf("c");
    const tree = split(leaf("a"), split(leaf("b"), target));
    expect(findLeaf(tree, "c")).toBe(target);
  });
});

describe("updateLeaf", () => {
  it("updates matching leaf", () => {
    const l = leaf("a");
    const result = updateLeaf(l, "a", (n) => ({
      ...n,
      tabs: [{ filePath: "test.md", vaultPath: "/vault", unsaved: false }],
    }));
    expect(result.type === "leaf" && result.tabs).toHaveLength(1);
  });

  it("does not modify non-matching leaf", () => {
    const l = leaf("a");
    const result = updateLeaf(l, "b", (n) => ({
      ...n,
      tabs: [{ filePath: "test.md", vaultPath: "/vault", unsaved: false }],
    }));
    expect(result).toBe(l);
  });

  it("updates leaf inside split", () => {
    const tree = split(leaf("a"), leaf("b"));
    const result = updateLeaf(tree, "b", (n) => ({ ...n, activeTab: 5 }));
    const found = findLeaf(result, "b");
    expect(found?.activeTab).toBe(5);
  });
});

describe("removeLeaf", () => {
  it("removes a single leaf returning null", () => {
    expect(removeLeaf(leaf("a"), "a")).toBeNull();
  });

  it("keeps non-matching leaf", () => {
    const l = leaf("a");
    expect(removeLeaf(l, "b")).toBe(l);
  });

  it("removes left child from split, returns right", () => {
    const right = leaf("b");
    const tree = split(leaf("a"), right);
    expect(removeLeaf(tree, "a")).toBe(right);
  });

  it("removes right child from split, returns left", () => {
    const left = leaf("a");
    const tree = split(left, leaf("b"));
    expect(removeLeaf(tree, "b")).toBe(left);
  });
});

describe("allLeafIds", () => {
  it("returns single id for leaf", () => {
    expect(allLeafIds(leaf("a"))).toEqual(["a"]);
  });

  it("returns all ids from split tree", () => {
    const tree = split(leaf("a"), split(leaf("b"), leaf("c")));
    expect(allLeafIds(tree)).toEqual(["a", "b", "c"]);
  });
});

describe("updateSplitRatio", () => {
  it("updates ratio at root split", () => {
    const tree = split(leaf("a"), leaf("b"), "vertical", 0.5);
    const result = updateSplitRatio(tree, [], 0.7);
    expect(result.type === "split" && result.ratio).toBe(0.7);
  });

  it("updates ratio at nested split", () => {
    const inner = split(leaf("b"), leaf("c"), "vertical", 0.5);
    const tree = split(leaf("a"), inner, "vertical", 0.5);
    const result = updateSplitRatio(tree, [1], 0.3);
    if (result.type === "split") {
      const child = result.children[1];
      expect(child.type === "split" && child.ratio).toBe(0.3);
    }
  });

  it("returns leaf unchanged", () => {
    const l = leaf("a");
    expect(updateSplitRatio(l, [], 0.5)).toBe(l);
  });
});

describe("replacePaneInLayout", () => {
  it("replaces matching leaf", () => {
    const replacement = leaf("new");
    const result = replacePaneInLayout(leaf("a"), "a", replacement);
    expect(result).toBe(replacement);
  });

  it("does not replace non-matching leaf", () => {
    const l = leaf("a");
    expect(replacePaneInLayout(l, "b", leaf("new"))).toBe(l);
  });

  it("replaces nested leaf in split", () => {
    const tree = split(leaf("a"), leaf("b"));
    const replacement = leaf("new");
    const result = replacePaneInLayout(tree, "b", replacement);
    expect(findLeaf(result, "new")).toBe(replacement);
    expect(findLeaf(result, "b")).toBeNull();
  });
});
