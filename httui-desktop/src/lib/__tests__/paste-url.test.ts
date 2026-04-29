import { describe, it, expect } from "vitest";

import {
  extractUrl,
  buildRunbookFromUrl,
  PASTE_URL_RUNBOOK_PATH,
} from "@/lib/paste-url";

describe("extractUrl", () => {
  it("accepts a plain https URL", () => {
    expect(extractUrl("https://api.example.com/users")).toBe(
      "https://api.example.com/users",
    );
  });

  it("accepts a plain http URL", () => {
    expect(extractUrl("http://localhost:3000/health")).toBe(
      "http://localhost:3000/health",
    );
  });

  it("trims trailing whitespace from the clipboard payload", () => {
    expect(extractUrl("  https://api.example.com/users\n  ")).toBe(
      "https://api.example.com/users",
    );
  });

  it("rejects payloads that aren't pure URLs", () => {
    expect(extractUrl("see https://api.example.com")).toBeNull();
    expect(extractUrl("https://api.example.com extra")).toBeNull();
  });

  it("rejects multi-line text even when one line is a URL", () => {
    // Defends against the case where a user copies a paragraph that
    // happens to start with a URL.
    expect(
      extractUrl("https://api.example.com\nhttps://api.example.com"),
    ).toBeNull();
  });

  it("rejects empty string and whitespace-only", () => {
    expect(extractUrl("")).toBeNull();
    expect(extractUrl("   ")).toBeNull();
  });

  it("rejects non-http schemes", () => {
    expect(extractUrl("ftp://example.com/file")).toBeNull();
    expect(extractUrl("file:///etc/passwd")).toBeNull();
    expect(extractUrl("javascript:alert(1)")).toBeNull();
  });

  it("is case-insensitive on the scheme", () => {
    expect(extractUrl("HTTPS://api.example.com")).toBe(
      "HTTPS://api.example.com",
    );
  });
});

describe("buildRunbookFromUrl", () => {
  it("produces a runnable HTTP block fence with the URL", () => {
    const body = buildRunbookFromUrl("https://api.example.com/users");
    expect(body).toContain("```http alias=req1");
    expect(body).toContain("GET https://api.example.com/users");
    expect(body).toContain("```\n");
  });

  it("starts with a level-1 heading", () => {
    expect(buildRunbookFromUrl("https://x")).toMatch(/^# /);
  });
});

describe("PASTE_URL_RUNBOOK_PATH", () => {
  it("targets the canonical runbooks/ directory", () => {
    expect(PASTE_URL_RUNBOOK_PATH.startsWith("runbooks/")).toBe(true);
  });
});
