import { createContext, useContext } from "react";
import type { PaneLayout, LeafPane } from "@/types/pane";
import type { PaneActions } from "@/hooks/usePaneState";

export interface PaneContextValue {
  layout: PaneLayout;
  activePaneId: string;
  contentVersion: number;
  editorContents: Map<string, string>;
  unsavedFiles: Set<string>;
  getActiveLeaf: () => LeafPane | null;
  actions: PaneActions;
  handleEditorChange: (paneId: string, filePath: string, content: string, vaultPath: string) => void;
}

export const PaneContext = createContext<PaneContextValue | null>(null);

export function usePaneContext(): PaneContextValue {
  const ctx = useContext(PaneContext);
  if (!ctx) throw new Error("usePaneContext must be used within PaneProvider");
  return ctx;
}
