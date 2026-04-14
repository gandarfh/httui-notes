import { useState, useCallback } from "react";
import {
  createNote,
  createFolder,
  deleteNote,
  renameNote,
} from "@/lib/tauri/commands";

export interface InlineCreate {
  type: "note" | "folder";
  dirPath: string;
}

interface UseFileOperationsOpts {
  vaultPath: string | null;
  refreshFileTree: (vault: string) => Promise<void>;
  onFileCreated?: (filePath: string) => void;
}

export function useFileOperations({
  vaultPath,
  refreshFileTree,
  onFileCreated,
}: UseFileOperationsOpts) {
  const [inlineCreate, setInlineCreate] = useState<InlineCreate | null>(null);

  const handleStartCreate = useCallback(
    (type: "note" | "folder", dirPath: string) => {
      setInlineCreate({ type, dirPath });
    },
    [],
  );

  const cancelInlineCreate = useCallback(() => {
    setInlineCreate(null);
  }, []);

  const handleCreateNote = useCallback(
    async (dirPath: string, name: string) => {
      if (!vaultPath || !name) return;
      setInlineCreate(null);
      const filePath = dirPath ? `${dirPath}/${name}.md` : `${name}.md`;
      try {
        await createNote(vaultPath, filePath);
        await refreshFileTree(vaultPath);
        onFileCreated?.(filePath);
      } catch (err) {
        console.error("Failed to create note:", err);
      }
    },
    [vaultPath, refreshFileTree, onFileCreated],
  );

  const handleCreateFolder = useCallback(
    async (dirPath: string, name: string) => {
      if (!vaultPath || !name) return;
      setInlineCreate(null);
      const folderPath = dirPath ? `${dirPath}/${name}` : name;
      try {
        await createFolder(vaultPath, folderPath);
        await refreshFileTree(vaultPath);
      } catch (err) {
        console.error("Failed to create folder:", err);
      }
    },
    [vaultPath, refreshFileTree],
  );

  const handleRename = useCallback(
    async (path: string, newName: string) => {
      if (!vaultPath || !newName) return;
      const dir = path.includes("/")
        ? path.substring(0, path.lastIndexOf("/"))
        : "";
      const newPath = dir ? `${dir}/${newName}` : newName;
      try {
        await renameNote(vaultPath, path, newPath);
        await refreshFileTree(vaultPath);
      } catch (err) {
        console.error("Failed to rename:", err);
      }
    },
    [vaultPath, refreshFileTree],
  );

  const handleDelete = useCallback(
    async (path: string) => {
      if (!vaultPath) return;
      try {
        await deleteNote(vaultPath, path);
        await refreshFileTree(vaultPath);
      } catch (err) {
        console.error("Failed to delete:", err);
      }
    },
    [vaultPath, refreshFileTree],
  );

  return {
    inlineCreate,
    handleStartCreate,
    handleCreateNote,
    handleCreateFolder,
    handleRename,
    handleDelete,
    cancelInlineCreate,
  };
}
