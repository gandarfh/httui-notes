export interface TabState {
  filePath: string;
  vaultPath: string;
  unsaved: boolean;
}

export interface LeafPane {
  type: "leaf";
  id: string;
  tabs: TabState[];
  activeTab: number;
}

export interface SplitPane {
  type: "split";
  direction: "horizontal" | "vertical";
  children: [PaneLayout, PaneLayout];
  ratio: number; // 0-1, first child gets this fraction
}

export type PaneLayout = LeafPane | SplitPane;

let nextPaneId = 1;
export function createLeafPane(filePath?: string, vaultPath?: string): LeafPane {
  return {
    type: "leaf",
    id: `pane-${nextPaneId++}`,
    tabs: filePath ? [{ filePath, vaultPath: vaultPath ?? "", unsaved: false }] : [],
    activeTab: 0,
  };
}
