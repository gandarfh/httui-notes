import { useCallback, useRef } from "react";
import { readNote, writeNote, setConfig } from "@/lib/tauri/commands";
import { markdownToHtml } from "@/lib/markdown/parser";
import { htmlToMarkdown } from "@/lib/markdown/serializer";
import { usePaneStore } from "@/stores/pane";
import { useWorkspaceStore } from "@/stores/workspace";
import { useSettingsStore } from "@/stores/settings";

export function useEditorSession() {
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressedFiles = useRef<Set<string>>(new Set());

  const handleFileSelect = useCallback(
    async (filePath: string) => {
      const vaultPath = useWorkspaceStore.getState().vaultPath;
      const useCM = useSettingsStore.getState().editorEngine === "codemirror";
      if (!vaultPath) return;
      try {
        const { editorContents, openFile } = usePaneStore.getState();
        const cached = editorContents.get(filePath);
        const needsRead = !cached || (useCM && cached.trimStart().startsWith("<"));
        if (needsRead) {
          const markdown = await readNote(vaultPath, filePath);
          const content = useCM ? markdown : markdownToHtml(markdown);
          openFile(filePath, content, vaultPath);
        } else {
          openFile(filePath, cached, vaultPath);
        }
        setConfig("active_file", filePath).catch(() => {});
      } catch (err) {
        console.error("Failed to read note:", err);
      }
    },
    [],
  );

  const handleEditorChange = useCallback(
    (_paneId: string, filePath: string, content: string, tabVaultPath: string) => {
      const { updateContent, markUnsaved, activePaneId } = usePaneStore.getState();
      const { settings: { autoSaveMs }, editorEngine } = useSettingsStore.getState();
      const useCM = editorEngine === "codemirror";
      updateContent(filePath, content);
      markUnsaved(activePaneId, filePath, true);

      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);

      if (autoSaveMs > 0) {
        autoSaveTimer.current = setTimeout(async () => {
          if (usePaneStore.getState().hasConflict(filePath)) return;
          if (suppressedFiles.current.has(filePath)) return;
          try {
            await writeNote(tabVaultPath, filePath, useCM ? content : htmlToMarkdown(content));
            const store = usePaneStore.getState();
            store.markUnsaved(store.activePaneId, filePath, false);
          } catch (err) {
            console.error("Auto-save failed:", err);
          }
        }, autoSaveMs);
      }
    },
    [],
  );

  const forceSave = useCallback(() => {
    const useCM = useSettingsStore.getState().editorEngine === "codemirror";
    const { getActiveLeaf, editorContents, markUnsaved } = usePaneStore.getState();
    const leaf = getActiveLeaf();
    if (!leaf || leaf.tabs.length === 0) return;
    const tab = leaf.tabs[leaf.activeTab];
    if (!tab) return;
    const content = editorContents.get(tab.filePath);
    if (content) {
      writeNote(tab.vaultPath, tab.filePath, useCM ? content : htmlToMarkdown(content))
        .then(() => markUnsaved(leaf.id, tab.filePath, false))
        .catch((err) => console.error("Save failed:", err));
    }
  }, []);

  const suppressAutoSave = useCallback((filePath: string) => {
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = null;
    }
    suppressedFiles.current.add(filePath);
  }, []);

  const unsuppressAutoSave = useCallback((filePath: string) => {
    suppressedFiles.current.delete(filePath);
  }, []);

  return {
    handleFileSelect,
    handleEditorChange,
    forceSave,
    suppressAutoSave,
    unsuppressAutoSave,
  };
}
