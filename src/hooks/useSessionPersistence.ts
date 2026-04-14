import { useEffect, useRef } from "react";
import {
  listVaults,
  getActiveVault,
  getConfig,
  setConfig,
  readNote,
} from "@/lib/tauri/commands";
import { markdownToHtml } from "@/lib/markdown/parser";
import type { PaneActions } from "@/hooks/usePaneState";
import type { PaneLayout } from "@/types/pane";

interface UseSessionPersistenceOpts {
  switchVault: (path: string) => Promise<void>;
  layout: PaneLayout;
  activePaneId: string;
  actions: PaneActions;
  vimEnabled: boolean;
  setVimEnabled: (enabled: boolean) => void;
  setVaults: (vaults: string[]) => void;
}

// Remove tabs for files that no longer exist from the layout
function filterDeletedTabs(
  node: PaneLayout,
  existingFiles: Set<string>,
): PaneLayout {
  if (node.type === "leaf") {
    const validTabs = node.tabs.filter((t) => existingFiles.has(t.filePath));
    return {
      ...node,
      tabs: validTabs,
      activeTab: Math.min(node.activeTab, Math.max(0, validTabs.length - 1)),
    };
  }
  return {
    ...node,
    children: [
      filterDeletedTabs(node.children[0], existingFiles),
      filterDeletedTabs(node.children[1], existingFiles),
    ],
  };
}

export function useSessionPersistence({
  switchVault,
  layout,
  activePaneId,
  actions,
  vimEnabled,
  setVimEnabled,
  setVaults,
}: UseSessionPersistenceOpts): void {
  const sessionRestored = useRef(false);

  // Load session on startup
  useEffect(() => {
    (async () => {
      try {
        const savedVaults = await listVaults();
        setVaults(savedVaults);

        const savedVim = await getConfig("vim_enabled");
        if (savedVim === "true") setVimEnabled(true);

        const active = await getActiveVault();
        if (active) {
          await switchVault(active);

          const savedLayout = await getConfig("pane_layout");
          const savedPaneId = await getConfig("active_pane_id");
          if (savedLayout && savedPaneId) {
            try {
              const parsed = JSON.parse(savedLayout);
              // Load all tab content in parallel, using each tab's vaultPath
              const contents = new Map<string, string>();
              const collectTabs = (node: PaneLayout): { filePath: string; vaultPath: string }[] => {
                if (node.type === "leaf") return node.tabs.map((t) => ({ filePath: t.filePath, vaultPath: t.vaultPath }));
                return [...collectTabs(node.children[0]), ...collectTabs(node.children[1])];
              };
              await Promise.all(
                collectTabs(parsed).map(async (tab) => {
                  try {
                    const md = await readNote(tab.vaultPath, tab.filePath);
                    contents.set(tab.filePath, markdownToHtml(md));
                  } catch {
                    // File may have been deleted — will be filtered out
                  }
                }),
              );
              // Filter out tabs for deleted files
              const cleanedLayout = filterDeletedTabs(parsed, new Set(contents.keys()));
              actions.restoreLayout(cleanedLayout, savedPaneId, contents);
            } catch {
              // Invalid layout JSON, use default
            }
          } else {
            // Fallback: restore last file
            const lastFile = await getConfig("active_file");
            if (lastFile) {
              try {
                const markdown = await readNote(active, lastFile);
                actions.openFile(lastFile, markdownToHtml(markdown), active);
              } catch {
                // File may have been deleted
              }
            }
          }
        }
      } catch {
        // App may not be in Tauri context
      } finally {
        sessionRestored.current = true;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save pane layout on changes (only after session restore completes)
  useEffect(() => {
    if (!sessionRestored.current) return;
    setConfig("pane_layout", JSON.stringify(layout)).catch(() => {});
    setConfig("active_pane_id", activePaneId).catch(() => {});
  }, [layout, activePaneId]);

  // Save vim preference (only after session restore completes)
  useEffect(() => {
    if (!sessionRestored.current) return;
    setConfig("vim_enabled", vimEnabled ? "true" : "false").catch(() => {});
  }, [vimEnabled]);
}
