import { memo } from "react";
import { usePaneStore, selectLayout } from "@/stores/pane";
import { PaneNode } from "./PaneNode";

interface PaneContainerProps {
  handleEditorChange: (paneId: string, filePath: string, content: string, vaultPath: string) => void;
  onNavigateFile?: (filePath: string) => void;
}

export const PaneContainer = memo(function PaneContainer({ handleEditorChange, onNavigateFile }: PaneContainerProps) {
  const layout = usePaneStore(selectLayout);
  return <PaneNode layout={layout} path={[]} handleEditorChange={handleEditorChange} onNavigateFile={onNavigateFile} />;
});
