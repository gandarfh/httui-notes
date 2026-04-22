import { useCallback, useRef } from "react";
import { readNote, writeNote, setConfig } from "@/lib/tauri/commands";
import { markdownToHtml } from "@/lib/markdown/parser";
import { htmlToMarkdown } from "@/lib/markdown/serializer";
import type { PaneActions } from "@/hooks/usePaneState";
import type { LeafPane } from "@/types/pane";
import type { EditorEngine } from "@/contexts/EditorSettingsContext";

interface UseEditorSessionOpts {
  vaultPath: string | null;
  activePaneId: string;
  editorContents: Map<string, string>;
  actions: PaneActions;
  getActiveLeaf: () => LeafPane | null;
  hasConflict?: (filePath: string) => boolean;
  autoSaveMs?: number; // 0 = disabled, default 1000
  editorEngine?: EditorEngine;
}

export function useEditorSession({
  vaultPath,
  activePaneId,
  editorContents,
  actions,
  getActiveLeaf,
  hasConflict,
  autoSaveMs = 1000,
  editorEngine = "tiptap",
}: UseEditorSessionOpts) {
  const useCM = editorEngine === "codemirror";
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressedFiles = useRef<Set<string>>(new Set());

  const handleFileSelect = useCallback(
    async (filePath: string) => {
      if (!vaultPath) return;
      try {
        const cached = editorContents.get(filePath);
        // Re-read from disk if: no cache, or CM mode but cache contains HTML from TipTap
        const needsRead = !cached || (useCM && cached.trimStart().startsWith("<"));
        if (needsRead) {
          const markdown = await readNote(vaultPath, filePath);
          editorContents.set(filePath, useCM ? markdown : markdownToHtml(markdown));
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

      if (autoSaveMs > 0) {
        autoSaveTimer.current = setTimeout(async () => {
          if (hasConflict?.(filePath)) return;
          if (suppressedFiles.current.has(filePath)) return;
          try {
            await writeNote(tabVaultPath, filePath, useCM ? content : htmlToMarkdown(content));
            actions.markUnsaved(activePaneId, filePath, false);
          } catch (err) {
            console.error("Auto-save failed:", err);
          }
        }, autoSaveMs);
      }
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
      writeNote(tab.vaultPath, tab.filePath, useCM ? content : htmlToMarkdown(content))
        .then(() => actions.markUnsaved(leaf.id, tab.filePath, false))
        .catch((err) => console.error("Save failed:", err));
    }
  }, [editorContents, actions, getActiveLeaf]);

  const suppressAutoSave = useCallback((filePath: string) => {
    // Cancel any pending auto-save timer
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = null;
    }
    // Suppress future auto-saves for this file until it's reloaded
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
