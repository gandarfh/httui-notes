import { useCallback, useRef } from "react";
import { readNote, writeNote, setConfig } from "@/lib/tauri/commands";
import { markdownToHtml } from "@/lib/markdown/parser";
import { htmlToMarkdown } from "@/lib/markdown/serializer";
import type { PaneActions } from "@/hooks/usePaneState";
import type { LeafPane } from "@/types/pane";

interface UseEditorSessionOpts {
  vaultPath: string | null;
  activePaneId: string;
  editorContents: Map<string, string>;
  actions: PaneActions;
  getActiveLeaf: () => LeafPane | null;
  hasConflict?: (filePath: string) => boolean;
}

export function useEditorSession({
  vaultPath,
  activePaneId,
  editorContents,
  actions,
  getActiveLeaf,
  hasConflict,
}: UseEditorSessionOpts) {
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleFileSelect = useCallback(
    async (filePath: string) => {
      if (!vaultPath) return;
      try {
        if (!editorContents.has(filePath)) {
          const markdown = await readNote(vaultPath, filePath);
          editorContents.set(filePath, markdownToHtml(markdown));
        }
        actions.openFile(filePath, editorContents.get(filePath) ?? "", vaultPath);
        setConfig("active_file", filePath).catch(() => {});
      } catch (err) {
        console.error("Failed to read note:", err);
      }
    },
    [vaultPath, editorContents, actions],
  );

  const handleEditorChange = useCallback(
    (_paneId: string, filePath: string, content: string, tabVaultPath: string) => {
      actions.updateContent(filePath, content);
      actions.markUnsaved(activePaneId, filePath, true);

      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);

      autoSaveTimer.current = setTimeout(async () => {
        if (hasConflict?.(filePath)) return;
        try {
          await writeNote(tabVaultPath, filePath, htmlToMarkdown(content));
          actions.markUnsaved(activePaneId, filePath, false);
        } catch (err) {
          console.error("Auto-save failed:", err);
        }
      }, 1000);
    },
    [activePaneId, actions],
  );

  const forceSave = useCallback(() => {
    const leaf = getActiveLeaf();
    if (!leaf || leaf.tabs.length === 0) return;
    const tab = leaf.tabs[leaf.activeTab];
    if (!tab) return;
    const content = editorContents.get(tab.filePath);
    if (content) {
      writeNote(tab.vaultPath, tab.filePath, htmlToMarkdown(content))
        .then(() => actions.markUnsaved(leaf.id, tab.filePath, false))
        .catch((err) => console.error("Save failed:", err));
    }
  }, [editorContents, actions, getActiveLeaf]);

  return {
    handleFileSelect,
    handleEditorChange,
    forceSave,
  };
}
