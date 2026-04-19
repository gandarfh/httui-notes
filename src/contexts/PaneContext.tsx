import { createContext, useContext } from "react";
import type { PaneLayout, LeafPane } from "@/types/pane";
import type { PaneActions } from "@/hooks/usePaneState";

export interface PaneContextValue {
  layout: PaneLayout;
  activePaneId: string;
  editorContents: Map<string, string>;
  unsavedFiles: Set<string>;
  getActiveLeaf: () => LeafPane | null;
  actions: PaneActions;
  handleEditorChange: (paneId: string, filePath: string, content: string, vaultPath: string) => void;
  suppressAutoSave: (filePath: string) => void;
  unsuppressAutoSave: (filePath: string) => void;
}

export const PaneContext = createContext<PaneContextValue | null>(null);

export function usePaneContext(): PaneContextValue {
  const ctx = useContext(PaneContext);
  if (!ctx) throw new Error("usePaneContext must be used within PaneProvider");
  return ctx;
}
