import { useEffect, useRef } from "react";
import { restoreSession, setConfig, startWatching, rebuildSearchIndex } from "@/lib/tauri/commands";
import { markdownToHtml } from "@/lib/markdown/parser";
import type { PaneActions } from "@/hooks/usePaneState";
import { scrollPositionsStore } from "@/hooks/usePaneState";
import type { PaneLayout } from "@/types/pane";

interface UseSessionPersistenceOpts {
  layout: PaneLayout;
  activePaneId: string;
  actions: PaneActions;
  vimEnabled: boolean;
  setVimEnabled: (enabled: boolean) => void;
  setVaults: (vaults: string[]) => void;
  setVaultPath: (path: string | null) => void;
  setEntries: (entries: import("@/lib/tauri/commands").FileEntry[]) => void;
}

// Remove tabs for files that no longer exist from the layout
function filterDeletedTabs(
  node: PaneLayout,
  existingFiles: Set<string>,
): PaneLayout {
  if (node.type === "leaf") {
    // Filter out diff tabs (transient) and tabs for deleted files
    const validTabs = node.tabs.filter((t) => t.kind !== "diff" && existingFiles.has(t.filePath));
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
  layout,
  activePaneId,
  actions,
  vimEnabled,
  setVimEnabled,
  setVaults,
  setVaultPath,
  setEntries,
}: UseSessionPersistenceOpts): void {
  const sessionRestored = useRef(false);

  // Load session on startup — single IPC roundtrip
  useEffect(() => {
    (async () => {
      try {
        const session = await restoreSession();

        setVaults(session.vaults);
        if (session.vim_enabled) setVimEnabled(true);

        if (session.active_vault) {
          setVaultPath(session.active_vault);
          setEntries(session.file_tree);

          // Fire-and-forget: start watching + rebuild index
          startWatching(session.active_vault).catch(() => {});
          rebuildSearchIndex(session.active_vault).catch(() => {});

          if (session.pane_layout && session.active_pane_id) {
            try {
              const parsed = JSON.parse(session.pane_layout) as PaneLayout;

              // Convert tab contents from Rust (markdown) to HTML
              const contents = new Map<string, string>();
              for (const tab of session.tab_contents) {
                if (tab.content) {
                  contents.set(tab.file_path, markdownToHtml(tab.content));
                }
              }

              const cleanedLayout = filterDeletedTabs(parsed, new Set(contents.keys()));
              actions.restoreLayout(cleanedLayout, session.active_pane_id, contents);

              // Restore scroll positions
              if (session.scroll_positions) {
                try {
                  const positions = JSON.parse(session.scroll_positions) as Record<string, number>;
                  for (const [fp, pos] of Object.entries(positions)) {
                    scrollPositionsStore.set(fp, pos);
                  }
                } catch { /* invalid JSON, ignore */ }
              }
            } catch {
              // Invalid layout JSON, use default
            }
          } else if (session.active_file) {
            // Fallback: active_file content is already in tab_contents
            const tab = session.tab_contents[0];
            if (tab?.content) {
              actions.openFile(tab.file_path, markdownToHtml(tab.content), tab.vault_path);
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
    setConfig("scroll_positions", JSON.stringify(Object.fromEntries(scrollPositionsStore))).catch(() => {});
  }, [layout, activePaneId]);

  // Save vim preference (only after session restore completes)
  useEffect(() => {
    if (!sessionRestored.current) return;
    setConfig("vim_enabled", vimEnabled ? "true" : "false").catch(() => {});
  }, [vimEnabled]);
}
