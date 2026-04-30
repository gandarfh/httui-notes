import { describe, expect, it } from "vitest";

import { parseUnifiedDiff, selectRunbookMd } from "../parse-diff";

describe("parseUnifiedDiff", () => {
  it("returns empty array for empty input", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
  });

  it("parses a minimal single-file modification", () => {
    const diff = `diff --git a/x.md b/x.md
--- a/x.md
+++ b/x.md
@@ -1,3 +1,3 @@
 ctx
-old
+new
`;
    const files = parseUnifiedDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe("x.md");
    expect(files[0]!.oldPath).toBe("x.md");
    expect(files[0]!.isAdded).toBe(false);
    expect(files[0]!.isDeleted).toBe(false);
    expect(files[0]!.hunks).toHaveLength(1);
    const hunk = files[0]!.hunks[0]!;
    expect(hunk.oldStart).toBe(1);
    expect(hunk.oldLines).toBe(3);
    expect(hunk.newStart).toBe(1);
    expect(hunk.newLines).toBe(3);
  });

  it("tracks added line numbers in the new file", () => {
    const diff = `diff --git a/x b/x
--- a/x
+++ b/x
@@ -10,2 +10,4 @@
 a
 b
+added1
+added2
`;
    const hunk = parseUnifiedDiff(diff)[0]!.hunks[0]!;
    expect(hunk.addedLines).toEqual([12, 13]);
    expect(hunk.removedLines).toEqual([]);
  });

  it("tracks removed line numbers in the old file", () => {
    const diff = `diff --git a/x b/x
--- a/x
+++ b/x
@@ -10,4 +10,2 @@
 a
 b
-rem1
-rem2
`;
    const hunk = parseUnifiedDiff(diff)[0]!.hunks[0]!;
    expect(hunk.removedLines).toEqual([12, 13]);
    expect(hunk.addedLines).toEqual([]);
  });

  it("flags pure-add files via oldPath = /dev/null", () => {
    const diff = `diff --git a/new.md b/new.md
--- /dev/null
+++ b/new.md
@@ -0,0 +1,2 @@
+hello
+world
`;
    const f = parseUnifiedDiff(diff)[0]!;
    expect(f.isAdded).toBe(true);
    expect(f.isDeleted).toBe(false);
    expect(f.path).toBe("new.md");
    expect(f.hunks[0]!.addedLines).toEqual([1, 2]);
  });

  it("flags pure-delete files via newPath = /dev/null", () => {
    const diff = `diff --git a/old.md b/old.md
--- a/old.md
+++ /dev/null
@@ -1,2 +0,0 @@
-bye
-cruel
`;
    const f = parseUnifiedDiff(diff)[0]!;
    expect(f.isDeleted).toBe(true);
    expect(f.isAdded).toBe(false);
    expect(f.oldPath).toBe("old.md");
  });

  it("parses multiple files in one diff", () => {
    const diff = `diff --git a/a.md b/a.md
--- a/a.md
+++ b/a.md
@@ -1,1 +1,1 @@
-a
+A
diff --git a/b.md b/b.md
--- a/b.md
+++ b/b.md
@@ -1,1 +1,1 @@
-b
+B
`;
    const files = parseUnifiedDiff(diff);
    expect(files).toHaveLength(2);
    expect(files[0]!.path).toBe("a.md");
    expect(files[1]!.path).toBe("b.md");
  });

  it("parses multiple hunks per file", () => {
    const diff = `diff --git a/x b/x
--- a/x
+++ b/x
@@ -1,1 +1,1 @@
-a
+A
@@ -10,1 +10,1 @@
-z
+Z
`;
    const f = parseUnifiedDiff(diff)[0]!;
    expect(f.hunks).toHaveLength(2);
    expect(f.hunks[0]!.oldStart).toBe(1);
    expect(f.hunks[1]!.oldStart).toBe(10);
  });

  it("defaults oldLines/newLines to 1 when omitted", () => {
    // `@@ -5 +5 @@` is the `,1`-omitted form that git actually emits.
    const diff = `diff --git a/x b/x
--- a/x
+++ b/x
@@ -5 +5 @@
-a
+A
`;
    const h = parseUnifiedDiff(diff)[0]!.hunks[0]!;
    expect(h.oldLines).toBe(1);
    expect(h.newLines).toBe(1);
  });

  it("ignores `\\ No newline at end of file` markers", () => {
    const diff = `diff --git a/x b/x
--- a/x
+++ b/x
@@ -1,1 +1,1 @@
-a
\\ No newline at end of file
+A
\\ No newline at end of file
`;
    const h = parseUnifiedDiff(diff)[0]!.hunks[0]!;
    expect(h.addedLines).toEqual([1]);
    expect(h.removedLines).toEqual([1]);
  });

  it("preserves the raw hunk body for downstream block-detection", () => {
    const diff = `diff --git a/x b/x
--- a/x
+++ b/x
@@ -1,1 +1,1 @@
-a
+A
`;
    const h = parseUnifiedDiff(diff)[0]!.hunks[0]!;
    expect(h.raw).toContain("@@ -1,1 +1,1 @@");
    expect(h.raw).toContain("-a");
    expect(h.raw).toContain("+A");
  });
});

describe("selectRunbookMd", () => {
  it("keeps .md files inside runbooks/", () => {
    const diff = `diff --git a/runbooks/db.md b/runbooks/db.md
--- a/runbooks/db.md
+++ b/runbooks/db.md
@@ -1,1 +1,1 @@
-x
+y
`;
    const files = parseUnifiedDiff(diff);
    expect(selectRunbookMd(files)).toHaveLength(1);
  });

  it("drops .md files outside runbooks/", () => {
    const diff = `diff --git a/notes/random.md b/notes/random.md
--- a/notes/random.md
+++ b/notes/random.md
@@ -1,1 +1,1 @@
-x
+y
`;
    expect(selectRunbookMd(parseUnifiedDiff(diff))).toHaveLength(0);
  });

  it("drops non-.md files inside runbooks/", () => {
    const diff = `diff --git a/runbooks/script.sh b/runbooks/script.sh
--- a/runbooks/script.sh
+++ b/runbooks/script.sh
@@ -1,1 +1,1 @@
-x
+y
`;
    expect(selectRunbookMd(parseUnifiedDiff(diff))).toHaveLength(0);
  });

  it("matches deleted files via oldPath", () => {
    const diff = `diff --git a/runbooks/old.md b/runbooks/old.md
--- a/runbooks/old.md
+++ /dev/null
@@ -1,1 +0,0 @@
-x
`;
    expect(selectRunbookMd(parseUnifiedDiff(diff))).toHaveLength(1);
  });
});
