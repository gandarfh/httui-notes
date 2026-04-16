import { createContext, useContext } from "react";
import type { FileEntry } from "@/lib/tauri/commands";
import type { InlineCreate } from "@/hooks/useFileOperations";

export interface WorkspaceContextValue {
  vaultPath: string | null;
  vaults: string[];
  entries: FileEntry[];
  switchVault: (path: string) => Promise<void>;
  openVault: () => Promise<void>;
  inlineCreate: InlineCreate | null;
  handleStartCreate: (type: "note" | "folder", dirPath: string) => void;
  handleCreateNote: (dirPath: string, name: string) => Promise<void>;
  handleCreateFolder: (dirPath: string, name: string) => Promise<void>;
  handleRename: (path: string, newName: string) => Promise<void>;
  handleDelete: (path: string) => Promise<void>;
  handleMoveFile: (sourcePath: string, targetDir: string) => Promise<void>;
  cancelInlineCreate: () => void;
  handleFileSelect: (filePath: string) => Promise<void>;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
