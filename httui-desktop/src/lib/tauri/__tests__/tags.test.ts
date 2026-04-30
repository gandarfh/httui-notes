import { afterEach, describe, expect, it } from "vitest";

import { scanVaultTags } from "@/lib/tauri/tags";
import { clearTauriMocks, mockTauriCommand } from "@/test/mocks/tauri";

describe("scanVaultTags (Tauri wrapper)", () => {
  afterEach(() => {
    clearTauriMocks();
  });

  it("invokes 'scan_vault_tags_cmd' with vaultPath and returns mocked entries", async () => {
    const calls: Array<{ vaultPath?: string }> = [];
    mockTauriCommand("scan_vault_tags_cmd", (args) => {
      calls.push(args as { vaultPath?: string });
      return [
        { path: "runbook.md", tags: ["payments", "debug"] },
        { path: "ops/incident.md", tags: ["incident"] },
      ];
    });

    const out = await scanVaultTags("/some/vault");

    expect(calls).toEqual([{ vaultPath: "/some/vault" }]);
    expect(out).toEqual([
      { path: "runbook.md", tags: ["payments", "debug"] },
      { path: "ops/incident.md", tags: ["incident"] },
    ]);
  });

  it("returns an empty array when the vault has no tagged files", async () => {
    mockTauriCommand("scan_vault_tags_cmd", () => []);
    await expect(scanVaultTags("/empty")).resolves.toEqual([]);
  });

  it("propagates a rejected invoke call", async () => {
    mockTauriCommand("scan_vault_tags_cmd", () => {
      throw new Error("vault path is not a directory");
    });
    await expect(scanVaultTags("/bad")).rejects.toThrow(
      /vault path is not a directory/,
    );
  });
});
