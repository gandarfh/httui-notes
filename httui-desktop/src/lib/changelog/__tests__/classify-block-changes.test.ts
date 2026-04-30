import { describe, expect, it } from "vitest";

import { classifyBlockChanges } from "../classify-block-changes";
import { parseUnifiedDiff } from "../parse-diff";

function diffOf(text: string) {
  return parseUnifiedDiff(text)[0]!.hunks;
}

describe("classifyBlockChanges", () => {
  it("returns empty when both contents have the same blocks and no hunks", () => {
    const before = "```http alias=a\nGET /\n```\n";
    const after = before;
    const out = classifyBlockChanges({
      beforeContent: before,
      afterContent: after,
      hunks: [],
    });
    expect(out).toEqual([]);
  });

  it("flags added blocks", () => {
    const before = "intro\n";
    const after = ["intro", "```http alias=new", "GET /new", "```"].join("\n");
    const out = classifyBlockChanges({
      beforeContent: before,
      afterContent: after,
      hunks: [],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: "added",
      blockKind: "http",
      alias: "new",
    });
  });

  it("flags removed blocks", () => {
    const before = ["```http alias=old", "GET /", "```"].join("\n");
    const after = "intro\n";
    const out = classifyBlockChanges({
      beforeContent: before,
      afterContent: after,
      hunks: [],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "removed", alias: "old" });
  });

  it("classifies a body change inside an existing block", () => {
    const before = ["```http alias=a", "GET /old", "```"].join("\n");
    const after = ["```http alias=a", "GET /new", "```"].join("\n");
    const diff = `diff --git a/x.md b/x.md
--- a/x.md
+++ b/x.md
@@ -2,1 +2,1 @@
-GET /old
+GET /new
`;
    const out = classifyBlockChanges({
      beforeContent: before,
      afterContent: after,
      hunks: diffOf(diff),
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: "modified-body",
      alias: "a",
    });
  });

  it("classifies an info-string change as modified-info-string", () => {
    const before = ["```http alias=a", "GET /", "```"].join("\n");
    const after = ["```http alias=a timeout=5000", "GET /", "```"].join("\n");
    const diff = `diff --git a/x.md b/x.md
--- a/x.md
+++ b/x.md
@@ -1,1 +1,1 @@
-\`\`\`http alias=a
+\`\`\`http alias=a timeout=5000
`;
    const out = classifyBlockChanges({
      beforeContent: before,
      afterContent: after,
      hunks: diffOf(diff),
    });
    // alias matches on both sides, so no add/remove. The hunk
    // touches startLine, classified as info-string.
    expect(out).toContainEqual(
      expect.objectContaining({
        kind: "modified-info-string",
        alias: "a",
      }),
    );
  });

  it("classifies an assertions section change as modified-assertions", () => {
    const before = [
      "```http alias=a",
      "GET /",
      "# expect:",
      "status === 200",
      "```",
    ].join("\n");
    const after = [
      "```http alias=a",
      "GET /",
      "# expect:",
      "status === 201",
      "```",
    ].join("\n");
    const diff = `diff --git a/x.md b/x.md
--- a/x.md
+++ b/x.md
@@ -4,1 +4,1 @@
-status === 200
+status === 201
`;
    const out = classifyBlockChanges({
      beforeContent: before,
      afterContent: after,
      hunks: diffOf(diff),
    });
    expect(out).toContainEqual(
      expect.objectContaining({
        kind: "modified-assertions",
        alias: "a",
      }),
    );
  });

  it("classifies a captures section change as modified-captures", () => {
    const before = [
      "```http alias=a",
      "GET /",
      "# capture:",
      "id = $.body.id",
      "```",
    ].join("\n");
    const after = [
      "```http alias=a",
      "GET /",
      "# capture:",
      "id = $.body.user.id",
      "```",
    ].join("\n");
    const diff = `diff --git a/x.md b/x.md
--- a/x.md
+++ b/x.md
@@ -4,1 +4,1 @@
-id = $.body.id
+id = $.body.user.id
`;
    const out = classifyBlockChanges({
      beforeContent: before,
      afterContent: after,
      hunks: diffOf(diff),
    });
    expect(out).toContainEqual(
      expect.objectContaining({
        kind: "modified-captures",
        alias: "a",
      }),
    );
  });

  it("dedupes when a hunk touches the same block multiple times in the same kind", () => {
    const before = ["```http alias=a", "GET /old", "POST /old", "```"].join(
      "\n",
    );
    const after = ["```http alias=a", "GET /new", "POST /new", "```"].join(
      "\n",
    );
    const diff = `diff --git a/x.md b/x.md
--- a/x.md
+++ b/x.md
@@ -2,2 +2,2 @@
-GET /old
-POST /old
+GET /new
+POST /new
`;
    const out = classifyBlockChanges({
      beforeContent: before,
      afterContent: after,
      hunks: diffOf(diff),
    });
    // Both lines in the same block, same body kind → 1 entry.
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe("modified-body");
  });

  it("matches alias-less blocks by position fallback", () => {
    const before = ["```http", "GET /old", "```"].join("\n");
    const after = ["```http", "GET /new", "```"].join("\n");
    const diff = `diff --git a/x.md b/x.md
--- a/x.md
+++ b/x.md
@@ -2,1 +2,1 @@
-GET /old
+GET /new
`;
    const out = classifyBlockChanges({
      beforeContent: before,
      afterContent: after,
      hunks: diffOf(diff),
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: "modified-body",
      alias: null,
    });
  });

  it("renames an alias as remove + add (not a modification)", () => {
    const before = ["```http alias=old", "GET /", "```"].join("\n");
    const after = ["```http alias=new", "GET /", "```"].join("\n");
    const out = classifyBlockChanges({
      beforeContent: before,
      afterContent: after,
      hunks: [],
    });
    const kinds = out.map((c) => c.kind).sort();
    expect(kinds).toEqual(["added", "removed"]);
  });

  it("ignores hunk lines that fall outside any block", () => {
    const before = "intro\n\n```http alias=a\nGET /\n```\n";
    const after = "INTRO\n\n```http alias=a\nGET /\n```\n";
    const diff = `diff --git a/x.md b/x.md
--- a/x.md
+++ b/x.md
@@ -1,1 +1,1 @@
-intro
+INTRO
`;
    const out = classifyBlockChanges({
      beforeContent: before,
      afterContent: after,
      hunks: diffOf(diff),
    });
    expect(out).toEqual([]);
  });
});
