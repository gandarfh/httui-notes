import { afterEach, describe, expect, it } from "vitest";

import {
  deleteCapturesCache,
  readCapturesCache,
  writeCapturesCache,
} from "@/lib/tauri/captures-cache";
import { clearTauriMocks, mockTauriCommand } from "@/test/mocks/tauri";

describe("captures-cache Tauri wrappers", () => {
  afterEach(() => {
    clearTauriMocks();
  });

  it("writeCapturesCache invokes write_captures_cache_cmd with named args", async () => {
    const seen: Array<Record<string, unknown>> = [];
    mockTauriCommand("write_captures_cache_cmd", (args) => {
      seen.push(args as Record<string, unknown>);
      return "/tmp/v/.httui/captures/x.md.json";
    });
    const out = await writeCapturesCache("/tmp/v", "x.md", '{"a":1}');
    expect(out).toBe("/tmp/v/.httui/captures/x.md.json");
    expect(seen[0]).toEqual({
      vaultPath: "/tmp/v",
      filePath: "x.md",
      json: '{"a":1}',
    });
  });

  it("readCapturesCache returns the JSON string when present", async () => {
    mockTauriCommand("read_captures_cache_cmd", () => '{"a":1}');
    const r = await readCapturesCache("/v", "x.md");
    expect(r).toBe('{"a":1}');
  });

  it("readCapturesCache returns null when missing", async () => {
    mockTauriCommand("read_captures_cache_cmd", () => null);
    await expect(readCapturesCache("/v", "absent.md")).resolves.toBeNull();
  });

  it("deleteCapturesCache returns boolean removed flag", async () => {
    mockTauriCommand("delete_captures_cache_cmd", () => true);
    await expect(deleteCapturesCache("/v", "x.md")).resolves.toBe(true);
    mockTauriCommand("delete_captures_cache_cmd", () => false);
    await expect(deleteCapturesCache("/v", "absent.md")).resolves.toBe(false);
  });

  it("propagates IPC errors", async () => {
    mockTauriCommand("write_captures_cache_cmd", () => {
      throw new Error("file_path may not contain `..` segments");
    });
    await expect(
      writeCapturesCache("/v", "../escape.md", "{}"),
    ).rejects.toThrow(/`\.\.`/);
  });
});
