import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { readNote } from "@/lib/tauri/commands";
import { markdownToHtml } from "@/lib/markdown/parser";
import { bumpContentVersion } from "@/components/layout/pane/PaneNode";

interface FileEvent {
  kind: "Created" | "Modified" | "Removed";
  path: string;
}

interface UseFileConflictsOpts {
  vaultPath: string | null;
  editorContents: Map<string, string>;
  getOpenFiles: () => string[];
  updateEditorContent: (filePath: string, content: string) => void;
}

export function useFileConflicts({
  vaultPath,
  editorContents,
  getOpenFiles,
  updateEditorContent,
}: UseFileConflictsOpts) {
  const [conflictFiles, setConflictFiles] = useState<Set<string>>(new Set());
  const openFilesRef = useRef(getOpenFiles);
  openFilesRef.current = getOpenFiles;

  useEffect(() => {
    const unlisten = listen<FileEvent>("fs-event", (event) => {
      const { kind, path } = event.payload;
      if (kind !== "Modified") return;

      const openFiles = openFilesRef.current();
      if (openFiles.includes(path)) {
        setConflictFiles((prev) => new Set(prev).add(path));
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const hasConflict = useCallback(
    (filePath: string) => conflictFiles.has(filePath),
    [conflictFiles],
  );

  const resolveConflict = useCallback(
    async (filePath: string, action: "reload" | "keep") => {
      if (action === "reload" && vaultPath) {
        try {
          const markdown = await readNote(vaultPath, filePath);
          const html = markdownToHtml(markdown);
          editorContents.set(filePath, html);
          bumpContentVersion(filePath);
          updateEditorContent(filePath, html);
        } catch (err) {
          console.error("Failed to reload file:", err);
        }
      }
      // For "keep", we just clear the conflict — next auto-save will overwrite
      setConflictFiles((prev) => {
        const next = new Set(prev);
        next.delete(filePath);
        return next;
      });
    },
    [vaultPath, editorContents, updateEditorContent],
  );

  return { conflictFiles, hasConflict, resolveConflict };
}
