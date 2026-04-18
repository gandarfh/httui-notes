import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { forceReloadFile } from "@/lib/tauri/commands";

interface FileReloadedPayload {
  path: string;
  markdown: string;
}

interface UseFileConflictsOpts {
  vaultPath: string | null;
  unsavedFiles: Set<string>;
  getOpenFiles: () => string[];
}

export function useFileConflicts({
  vaultPath,
  unsavedFiles,
  getOpenFiles,
}: UseFileConflictsOpts) {
  const [conflictFiles, setConflictFiles] = useState<Set<string>>(new Set());
  const openFilesRef = useRef(getOpenFiles);
  openFilesRef.current = getOpenFiles;

  useEffect(() => {
    const unlisten = listen<FileReloadedPayload>("file-reloaded", (event) => {
      const { path } = event.payload;

      const openFiles = openFilesRef.current();
      if (!openFiles.includes(path)) return;

      // If file has unsaved edits, show conflict banner instead of auto-reloading
      if (unsavedFiles.has(path)) {
        setConflictFiles((prev) => new Set(prev).add(path));
      }
      // Clean files are handled directly by the Editor component
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [unsavedFiles]);

  const hasConflict = useCallback(
    (filePath: string) => conflictFiles.has(filePath),
    [conflictFiles],
  );

  const resolveConflict = useCallback(
    async (filePath: string, action: "reload" | "keep") => {
      if (action === "reload" && vaultPath) {
        // Re-emit file-reloaded from Rust — Editor will pick it up
        try {
          await forceReloadFile(vaultPath, filePath);
        } catch (err) {
          console.error("Failed to reload file:", err);
        }
      }
      setConflictFiles((prev) => {
        const next = new Set(prev);
        next.delete(filePath);
        return next;
      });
    },
    [vaultPath],
  );

  return { conflictFiles, hasConflict, resolveConflict };
}
