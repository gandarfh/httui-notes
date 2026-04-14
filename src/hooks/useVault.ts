import { useState, useCallback, useEffect } from "react";
import {
  listWorkspace,
  setActiveVault,
  startWatching,
  stopWatching,
  rebuildSearchIndex,
} from "@/lib/tauri/commands";
import type { FileEntry } from "@/lib/tauri/commands";
import { listen } from "@tauri-apps/api/event";

export function useVault() {
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [vaults, setVaults] = useState<string[]>([]);
  const [entries, setEntries] = useState<FileEntry[]>([]);

  const refreshFileTree = useCallback(async (vault: string) => {
    try {
      const tree = await listWorkspace(vault);
      setEntries(tree);
    } catch (err) {
      console.error("Failed to list workspace:", err);
    }
  }, []);

  const switchVault = useCallback(
    async (path: string) => {
      try {
        await stopWatching().catch(() => {});
        setVaultPath(path);
        // Run setActiveVault + refreshFileTree in parallel
        await Promise.all([
          setActiveVault(path),
          refreshFileTree(path),
        ]);
        // startWatching + rebuildSearchIndex are fire-and-forget (don't block startup)
        startWatching(path).catch(() => {});
        rebuildSearchIndex(path).catch(() => {});
      } catch (err) {
        console.error("Failed to switch vault:", err);
      }
    },
    [refreshFileTree],
  );

  const openVault = useCallback(async () => {
    try {
      const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
      const selected = await openDialog({ directory: true, multiple: false });
      if (selected) {
        await switchVault(selected as string);
      }
    } catch {
      const path = prompt("Enter vault path:");
      if (path) {
        await switchVault(path);
      }
    }
  }, [switchVault]);

  // File watcher
  useEffect(() => {
    const unlisten = listen("fs-event", () => {
      if (vaultPath) refreshFileTree(vaultPath);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [vaultPath, refreshFileTree]);

  return {
    vaultPath,
    vaults,
    entries,
    setVaultPath,
    setVaults,
    setEntries,
    refreshFileTree,
    switchVault,
    openVault,
  };
}
