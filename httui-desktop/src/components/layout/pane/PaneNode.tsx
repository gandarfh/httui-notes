import { useEffect, useRef } from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { TabBar } from "../TabBar";
import { MarkdownEditor } from "@/components/editor/MarkdownEditor";
import { DiffViewer } from "@/components/editor/DiffViewer";
import { ConflictBanner } from "../ConflictBanner";
import { usePaneStore } from "@/stores/pane";
import { useSettingsStore } from "@/stores/settings";
import { SplitView } from "./SplitView";
import type { PaneLayout } from "@/types/pane";
import { readNote } from "@/lib/tauri/commands";

interface PaneNodeProps {
  layout: PaneLayout;
  path: number[];
  handleEditorChange: (paneId: string, filePath: string, content: string, vaultPath: string) => void;
  onNavigateFile?: (filePath: string) => void;
}

export function PaneNode({ layout, path, handleEditorChange, onNavigateFile }: PaneNodeProps) {
  const activePaneId = usePaneStore((s) => s.activePaneId);
  const editorContents = usePaneStore((s) => s.editorContents);
  const unsavedFiles = usePaneStore((s) => s.unsavedFiles);
  const hasConflict = usePaneStore((s) => s.hasConflict);
  const resolveConflict = usePaneStore((s) => s.resolveConflict);
  const openFile = usePaneStore((s) => s.openFile);
  const setActivePaneId = usePaneStore((s) => s.setActivePaneId);
  const selectTab = usePaneStore((s) => s.selectTab);
  const closeTab = usePaneStore((s) => s.closeTab);
  const closeOthers = usePaneStore((s) => s.closeOthers);
  const closeAll = usePaneStore((s) => s.closeAll);
  const vimEnabled = useSettingsStore((s) => s.vimEnabled);
  // navigateFile passed via prop chain to avoid WorkspaceContext subscription
  // (which would re-render on every file tree change, resetting CM6 scroll)

  // Re-read files cached as HTML by the legacy TipTap editor on first open
  // after upgrade. Detected by the leading `<` — markdown never starts with
  // an HTML tag at column 0.
  const recoveredRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (layout.type !== "leaf") return;
    for (const tab of layout.tabs) {
      if (tab.kind === "diff") continue;
      const cached = editorContents.get(tab.filePath);
      if (
        cached &&
        cached.trimStart().startsWith("<") &&
        !recoveredRef.current.has(tab.filePath)
      ) {
        recoveredRef.current.add(tab.filePath);
        readNote(tab.vaultPath, tab.filePath)
          .then((md) => openFile(tab.filePath, md, tab.vaultPath))
          .catch(() => {});
      }
    }
  }, [layout, editorContents, openFile]);

  if (layout.type === "leaf") {
    const activeTab = layout.tabs[layout.activeTab];
    const content = activeTab
      ? (editorContents.get(activeTab.filePath) ?? "")
      : "";
    const isActive = layout.id === activePaneId;

    return (
      <Flex
        direction="column"
        flex={1}
        overflow="hidden"
        borderWidth={isActive ? "1px" : "0"}
        borderColor="brand.500/30"
        onClick={() => setActivePaneId(layout.id)}
      >
        <TabBar
          tabs={layout.tabs}
          activeTab={layout.activeTab}
          unsavedFiles={unsavedFiles}
          onSelectTab={(index) => selectTab(layout.id, index)}
          onCloseTab={(index) => closeTab(layout.id, index)}
          onCloseOthers={(index) => closeOthers(layout.id, index)}
          onCloseAll={() => closeAll(layout.id)}
        />
        {activeTab ? (
          activeTab.kind === "diff" ? (
            <Box flex={1} overflow="hidden">
              <DiffViewer tab={activeTab} />
            </Box>
          ) : (
          <Box flex={1} overflow="hidden" display="flex" flexDirection="column">
            {hasConflict(activeTab.filePath) && (
              <ConflictBanner
                filePath={activeTab.filePath}
                onReload={() => resolveConflict(activeTab.filePath, "reload", activeTab.vaultPath)}
                onKeep={() => resolveConflict(activeTab.filePath, "keep", null)}
              />
            )}
            <Box flex={1} overflow="hidden">
              <MarkdownEditor
                content={content}
                onChange={(c) => handleEditorChange(layout.id, activeTab.filePath, c, activeTab.vaultPath)}
                filePath={activeTab.filePath}
                vimEnabled={vimEnabled}
                onNavigateFile={onNavigateFile}
              />
            </Box>
          </Box>
          )
        ) : (
          <Flex flex={1} align="center" justify="center">
            <Text fontSize="sm" color="fg.muted">
              Open a file to start editing
            </Text>
          </Flex>
        )}
      </Flex>
    );
  }

  return <SplitView layout={layout} path={path} handleEditorChange={handleEditorChange} onNavigateFile={onNavigateFile} />;
}
