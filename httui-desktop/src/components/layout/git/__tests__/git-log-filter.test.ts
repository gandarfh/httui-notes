import { describe, expect, it } from "vitest";

import type { CommitInfo } from "@/lib/tauri/git";

import {
  filterCommitsByAuthor,
  parsePathFilter,
  toggleFilterMode,
} from "../git-log-filter";

function commit(over: Partial<CommitInfo> = {}): CommitInfo {
  return {
    sha: "deadbeef",
    short_sha: "dead",
    author_name: "Jane Doe",
    author_email: "jane@x.test",
    timestamp: 1700000000,
    subject: "first",
    ...over,
  };
}

describe("filterCommitsByAuthor", () => {
  it("returns input unchanged for empty / whitespace query", () => {
    const list = [commit(), commit({ short_sha: "f00" })];
    expect(filterCommitsByAuthor(list, "")).toEqual(list);
    expect(filterCommitsByAuthor(list, "   ")).toEqual(list);
  });

  it("matches against author_name (case-insensitive)", () => {
    const out = filterCommitsByAuthor(
      [
        commit({ author_name: "Jane Doe", author_email: "jd@x.test" }),
        commit({
          author_name: "John Smith",
          author_email: "js@x.test",
          short_sha: "f00",
        }),
      ],
      "JANE",
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.author_name).toBe("Jane Doe");
  });

  it("matches against author_email", () => {
    const out = filterCommitsByAuthor(
      [
        commit({ author_email: "alice@x.test" }),
        commit({ author_email: "bob@y.test", short_sha: "f00" }),
      ],
      "alice",
    );
    expect(out).toHaveLength(1);
  });

  it("returns a fresh array (does not mutate input)", () => {
    const input = [commit()];
    const out = filterCommitsByAuthor(input, "");
    expect(out).not.toBe(input);
  });
});

describe("parsePathFilter", () => {
  it("returns null for empty / whitespace", () => {
    expect(parsePathFilter("")).toBeNull();
    expect(parsePathFilter("   ")).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(parsePathFilter("  src/lib  ")).toBe("src/lib");
  });

  it("strips trailing slashes", () => {
    expect(parsePathFilter("src/lib/")).toBe("src/lib");
    expect(parsePathFilter("src///")).toBe("src");
  });

  it("preserves internal slashes", () => {
    expect(parsePathFilter("src/lib/blocks")).toBe("src/lib/blocks");
  });
});

describe("toggleFilterMode", () => {
  it("flips author → path", () => {
    expect(toggleFilterMode({ mode: "author", query: "x" })).toEqual({
      mode: "path",
      query: "x",
    });
  });

  it("flips path → author", () => {
    expect(toggleFilterMode({ mode: "path", query: "y" })).toEqual({
      mode: "author",
      query: "y",
    });
  });

  it("preserves the query across toggles", () => {
    const a = { mode: "author" as const, query: "alice" };
    const b = toggleFilterMode(a);
    const c = toggleFilterMode(b);
    expect(c.query).toBe("alice");
    expect(c.mode).toBe("author");
  });
});
