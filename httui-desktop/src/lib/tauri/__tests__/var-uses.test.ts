import { afterEach, describe, expect, it } from "vitest";

import { grepVarUses } from "@/lib/tauri/var-uses";
import { clearTauriMocks, mockTauriCommand } from "@/test/mocks/tauri";

describe("grepVarUses (Tauri wrapper)", () => {
  afterEach(() => {
    clearTauriMocks();
  });

  it("invokes 'grep_var_uses' with vaultPath + key and returns the mocked entries", async () => {
    const calls: Array<{ vaultPath?: string; key?: string }> = [];
    mockTauriCommand("grep_var_uses", (args) => {
      calls.push(args as { vaultPath?: string; key?: string });
      return [
        { file_path: "runbook.md", line: 7, snippet: "url: {{API}}" },
        { file_path: "ops.md", line: 3, snippet: "{{API.body}}" },
      ];
    });

    const out = await grepVarUses("/some/vault", "API");

    expect(calls).toEqual([{ vaultPath: "/some/vault", key: "API" }]);
    expect(out).toEqual([
      { file_path: "runbook.md", line: 7, snippet: "url: {{API}}" },
      { file_path: "ops.md", line: 3, snippet: "{{API.body}}" },
    ]);
  });

  it("propagates a rejected invoke call", async () => {
    mockTauriCommand("grep_var_uses", () => {
      throw new Error("vault path is not a directory");
    });
    await expect(grepVarUses("/bad", "API")).rejects.toThrow(
      /vault path is not a directory/,
    );
  });
});
