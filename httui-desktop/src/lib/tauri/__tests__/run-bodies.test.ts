import { afterEach, describe, expect, it } from "vitest";

import {
  listRunBodies,
  readRunBody,
  trimRunBodies,
  writeRunBody,
  type RunBodyEntry,
} from "@/lib/tauri/run-bodies";
import { clearTauriMocks, mockTauriCommand } from "@/test/mocks/tauri";

describe("run-bodies Tauri wrappers", () => {
  afterEach(() => {
    clearTauriMocks();
  });

  it("writeRunBody invokes write_run_body_cmd with named args + array body", async () => {
    const seen: Array<Record<string, unknown>> = [];
    mockTauriCommand("write_run_body_cmd", (args) => {
      seen.push(args as Record<string, unknown>);
      return "/tmp/x.httui/runs/x.md/a/r1.json";
    });

    const out = await writeRunBody(
      "/tmp/x",
      "x.md",
      "a",
      "r1",
      "json",
      new Uint8Array([0x7b, 0x7d]),
    );

    expect(out).toBe("/tmp/x.httui/runs/x.md/a/r1.json");
    expect(seen).toEqual([
      {
        vaultPath: "/tmp/x",
        filePath: "x.md",
        alias: "a",
        runId: "r1",
        kind: "json",
        body: [0x7b, 0x7d],
      },
    ]);
  });

  it("readRunBody returns Uint8Array when the file exists", async () => {
    mockTauriCommand("read_run_body_cmd", () => [0x68, 0x69]);
    const r = await readRunBody("/v", "x.md", "a", "r1");
    expect(r).toBeInstanceOf(Uint8Array);
    expect(Array.from(r as Uint8Array)).toEqual([0x68, 0x69]);
  });

  it("readRunBody returns null when the file is missing", async () => {
    mockTauriCommand("read_run_body_cmd", () => null);
    await expect(readRunBody("/v", "x.md", "a", "missing")).resolves.toBeNull();
  });

  it("listRunBodies passes through entries verbatim", async () => {
    const fakeEntries: RunBodyEntry[] = [
      { run_id: "01b", kind: "json", byte_size: 12, truncated: false },
      { run_id: "01a", kind: "bin", byte_size: 1_048_576, truncated: true },
    ];
    mockTauriCommand("list_run_bodies_cmd", () => fakeEntries);
    const r = await listRunBodies("/v", "x.md", "a");
    expect(r).toEqual(fakeEntries);
  });

  it("trimRunBodies returns the deleted count", async () => {
    const seen: Array<Record<string, unknown>> = [];
    mockTauriCommand("trim_run_bodies_cmd", (args) => {
      seen.push(args as Record<string, unknown>);
      return 3;
    });
    const r = await trimRunBodies("/v", "x.md", "a", 10);
    expect(r).toBe(3);
    expect(seen[0]).toEqual({
      vaultPath: "/v",
      filePath: "x.md",
      alias: "a",
      keepN: 10,
    });
  });

  it("propagates IPC errors", async () => {
    mockTauriCommand("write_run_body_cmd", () => {
      throw new Error("alias contains invalid char");
    });
    await expect(
      writeRunBody("/v", "x.md", "bad alias", "r1", "json", new Uint8Array()),
    ).rejects.toThrow(/invalid char/);
  });
});
