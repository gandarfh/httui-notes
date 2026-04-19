import { useState, useCallback } from "react";
import type { PaneLayout, LeafPane } from "@/types/pane";
import { createLeafPane } from "@/types/pane";

export interface DiffTabParams {
  filePath: string;
  vaultPath: string;
  permissionId: string;
  originalContent: string;
  proposedContent: string;
}

export interface PaneActions {
  openFile: (filePath: string, content: string, vaultPath: string) => void;
  openDiffTab: (params: DiffTabParams) => void;
  closeDiffTab: (permissionId: string) => void;
  selectTab: (paneId: string, index: number) => void;
  closeTab: (paneId: string, index: number) => void;
  closeOthers: (paneId: string, index: number) => void;
  closeAll: (paneId: string) => void;
  setActivePaneId: (paneId: string) => void;
  splitVertical: () => void;
  splitHorizontal: () => void;
  nextTab: () => void;
  updateContent: (filePath: string, content: string) => void;
  markUnsaved: (paneId: string, filePath: string, unsaved: boolean) => void;
  resizeSplit: (path: number[], ratio: number) => void;
  restoreLayout: (layout: PaneLayout, activePaneId: string, contents?: Map<string, string>) => void;
}

// --- Pure helper functions (exported for testing) ---

export function findLeaf(node: PaneLayout, id: string): LeafPane | null {
  if (node.type === "leaf") return node.id === id ? node : null;
  return findLeaf(node.children[0], id) ?? findLeaf(node.children[1], id);
}

export function updateLeaf(
  node: PaneLayout,
  id: string,
  updater: (leaf: LeafPane) => LeafPane,
): PaneLayout {
  if (node.type === "leaf") return node.id === id ? updater({ ...node }) : node;
  return {
    ...node,
    children: [
      updateLeaf(node.children[0], id, updater),
      updateLeaf(node.children[1], id, updater),
    ],
  };
}

export function removeLeaf(node: PaneLayout, id: string): PaneLayout | null {
  if (node.type === "leaf") return node.id === id ? null : node;
  const left = removeLeaf(node.children[0], id);
  const right = removeLeaf(node.children[1], id);
  if (!left) return right;
  if (!right) return left;
  return { ...node, children: [left, right] };
}

export function allLeafIds(node: PaneLayout): string[] {
  if (node.type === "leaf") return [node.id];
  return [...allLeafIds(node.children[0]), ...allLeafIds(node.children[1])];
}

export function updateSplitRatio(
  node: PaneLayout,
  path: number[],
  ratio: number,
): PaneLayout {
  if (path.length === 0 && node.type === "split") return { ...node, ratio };
  if (node.type === "split" && path.length > 0) {
    const [head, ...rest] = path;
    const children: [PaneLayout, PaneLayout] = [...node.children];
    children[head] = updateSplitRatio(children[head], rest, ratio);
    return { ...node, children };
  }
  return node;
}

export function replacePaneInLayout(
  node: PaneLayout,
  id: string,
  replacement: PaneLayout,
): PaneLayout {
  if (node.type === "leaf") return node.id === id ? replacement : node;
  return {
    ...node,
    children: [
      replacePaneInLayout(node.children[0], id, replacement),
      replacePaneInLayout(node.children[1], id, replacement),
    ],
  };
}

// Module-level stores — live outside React, no re-render issues
export const editorContentsStore = new Map<string, string>();
const unsavedFilesStore = new Set<string>();
export const scrollPositionsStore = new Map<string, number>();

// --- Hook ---

export function usePaneState() {
  const [layout, setLayout] = useState<PaneLayout>(createLeafPane());
  const [activePaneId, setActivePaneId] = useState(
    (layout as LeafPane).id,
  );
  const getActiveLeaf = useCallback(
    (): LeafPane | null => findLeaf(layout, activePaneId),
    [layout, activePaneId],
  );

  const openFile = useCallback(
    (filePath: string, content: string, vaultPath: string) => {
      editorContentsStore.set(filePath, content);
      setLayout((prev) => {
        const leaf = findLeaf(prev, activePaneId);
        if (!leaf) return prev;
        const existing = leaf.tabs.findIndex((t) => t.filePath === filePath);
        if (existing >= 0) {
          return updateLeaf(prev, activePaneId, (l) => ({
            ...l,
            activeTab: existing,
          }));
        }
        return updateLeaf(prev, activePaneId, (l) => ({
          ...l,
          tabs: [...l.tabs, { filePath, vaultPath, unsaved: false }],
          activeTab: l.tabs.length,
        }));
      });
    },
    [activePaneId],
  );

  const selectTab = useCallback((paneId: string, index: number) => {
    setLayout((prev) => updateLeaf(prev, paneId, (l) => ({ ...l, activeTab: index })));
    setActivePaneId(paneId);
  }, []);

  const closeTab = useCallback((paneId: string, index: number) => {
    setLayout((prev) => {
      const leaf = findLeaf(prev, paneId);
      if (!leaf) return prev;
      const newTabs = leaf.tabs.filter((_, i) => i !== index);
      if (newTabs.length === 0) {
        const result = removeLeaf(prev, paneId);
        if (result) {
          const ids = allLeafIds(result);
          if (ids.length > 0) setActivePaneId(ids[0]);
          return result;
        }
        return updateLeaf(prev, paneId, (l) => ({ ...l, tabs: [], activeTab: 0 }));
      }
      const newActive = Math.min(leaf.activeTab, newTabs.length - 1);
      return updateLeaf(prev, paneId, (l) => ({ ...l, tabs: newTabs, activeTab: newActive }));
    });
  }, []);

  const closeOthers = useCallback((paneId: string, index: number) => {
    setLayout((prev) =>
      updateLeaf(prev, paneId, (l) => ({ ...l, tabs: [l.tabs[index]], activeTab: 0 })),
    );
  }, []);

  const closeAll = useCallback((paneId: string) => {
    setLayout((prev) =>
      updateLeaf(prev, paneId, (l) => ({ ...l, tabs: [], activeTab: 0 })),
    );
  }, []);

  const splitVertical = useCallback(() => {
    setLayout((prev) => {
      const leaf = findLeaf(prev, activePaneId);
      if (!leaf) return prev;
      const newPane = createLeafPane();
      setActivePaneId(newPane.id);
      return replacePaneInLayout(prev, activePaneId, {
        type: "split",
        direction: "vertical",
        children: [leaf, newPane],
        ratio: 0.5,
      });
    });
  }, [activePaneId]);

  const splitHorizontal = useCallback(() => {
    setLayout((prev) => {
      const leaf = findLeaf(prev, activePaneId);
      if (!leaf) return prev;
      const newPane = createLeafPane();
      setActivePaneId(newPane.id);
      return replacePaneInLayout(prev, activePaneId, {
        type: "split",
        direction: "horizontal",
        children: [leaf, newPane],
        ratio: 0.5,
      });
    });
  }, [activePaneId]);

  const nextTab = useCallback(() => {
    setLayout((prev) => {
      const leaf = findLeaf(prev, activePaneId);
      if (!leaf || leaf.tabs.length <= 1) return prev;
      const next = (leaf.activeTab + 1) % leaf.tabs.length;
      return updateLeaf(prev, activePaneId, (l) => ({ ...l, activeTab: next }));
    });
  }, [activePaneId]);

  const updateContent = useCallback(
    (filePath: string, content: string) => {
      editorContentsStore.set(filePath, content);
    },
    [],
  );

  const markUnsaved = useCallback((_paneId: string, filePath: string, unsaved: boolean) => {
    if (unsaved) {
      unsavedFilesStore.add(filePath);
    } else {
      unsavedFilesStore.delete(filePath);
    }
  }, []);

  const resizeSplit = useCallback((path: number[], ratio: number) => {
    setLayout((prev) => updateSplitRatio(prev, path, ratio));
  }, []);

  const openDiffTab = useCallback(
    (params: DiffTabParams) => {
      const diffId = `diff-${params.permissionId}`;
      setLayout((prev) => {
        const leaf = findLeaf(prev, activePaneId);
        if (!leaf) return prev;
        // If diff tab already exists, switch to it
        const existing = leaf.tabs.findIndex((t) => t.diffId === diffId);
        if (existing >= 0) {
          return updateLeaf(prev, activePaneId, (l) => ({ ...l, activeTab: existing }));
        }
        const tab: import("@/types/pane").TabState = {
          filePath: params.filePath,
          vaultPath: params.vaultPath,
          unsaved: false,
          kind: "diff",
          diffId,
          permissionId: params.permissionId,
          originalContent: params.originalContent,
          proposedContent: params.proposedContent,
        };
        return updateLeaf(prev, activePaneId, (l) => ({
          ...l,
          tabs: [...l.tabs, tab],
          activeTab: l.tabs.length,
        }));
      });
    },
    [activePaneId],
  );

  const closeDiffTab = useCallback((permissionId: string) => {
    const diffId = `diff-${permissionId}`;
    setLayout((prev) => {
      // Find the leaf containing this diff tab
      const leaves = allLeafIds(prev);
      for (const leafId of leaves) {
        const leaf = findLeaf(prev, leafId);
        if (!leaf) continue;
        const idx = leaf.tabs.findIndex((t) => t.diffId === diffId);
        if (idx >= 0) {
          const newTabs = leaf.tabs.filter((_, i) => i !== idx);
          if (newTabs.length === 0) {
            const result = removeLeaf(prev, leafId);
            if (result) return result;
            return updateLeaf(prev, leafId, (l) => ({ ...l, tabs: [], activeTab: 0 }));
          }
          const newActive = Math.min(leaf.activeTab, newTabs.length - 1);
          return updateLeaf(prev, leafId, (l) => ({ ...l, tabs: newTabs, activeTab: newActive }));
        }
      }
      return prev;
    });
  }, []);

  const restoreLayout = useCallback(
    (savedLayout: PaneLayout, savedActivePaneId: string, contents?: Map<string, string>) => {
      if (contents) {
        for (const [filePath, html] of contents) {
          editorContentsStore.set(filePath, html);
        }
      }
      setLayout(savedLayout);
      setActivePaneId(savedActivePaneId);
    },
    [],
  );

  return {
    layout,
    activePaneId,
    editorContents: editorContentsStore,
    unsavedFiles: unsavedFilesStore,
    scrollPositions: scrollPositionsStore,
    getActiveLeaf,
    actions: {
      openFile,
      openDiffTab,
      closeDiffTab,
      selectTab,
      closeTab,
      closeOthers,
      closeAll,
      setActivePaneId,
      splitVertical,
      splitHorizontal,
      nextTab,
      updateContent,
      markUnsaved,
      resizeSplit,
      restoreLayout,
    } satisfies PaneActions,
  };
}
