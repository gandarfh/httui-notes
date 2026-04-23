import { useEffect, useRef } from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { TabBar } from "../TabBar";
import { Editor } from "@/components/editor";
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
  const setVimMode = useSettingsStore((s) => s.setVimMode);
  const editorEngine = useSettingsStore((s) => s.editorEngine);
  // navigateFile passed via prop chain to avoid WorkspaceContext subscription
  // (which would re-render on every file tree change, resetting CM6 scroll)

  // When switching to CM mode, re-read files that were cached as HTML by TipTap
  const prevEngineRef = useRef(editorEngine);
  useEffect(() => {
    if (prevEngineRef.current !== editorEngine && editorEngine === "codemirror") {
      if (layout.type === "leaf") {
        for (const tab of layout.tabs) {
          if (tab.kind === "diff") continue;
          const cached = editorContents.get(tab.filePath);
          if (cached && cached.trimStart().startsWith("<")) {
            readNote(tab.vaultPath, tab.filePath).then((md) => {
              openFile(tab.filePath, md, tab.vaultPath);
            }).catch(() => {});
          }
        }
      }
    }
    prevEngineRef.current = editorEngine;
  }, [editorEngine, layout, editorContents, openFile]);

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
              {editorEngine === "codemirror" ? (
                <MarkdownEditor
                  content={content}
                  onChange={(c) => handleEditorChange(layout.id, activeTab.filePath, c, activeTab.vaultPath)}
                  filePath={activeTab.filePath}
                  vimEnabled={vimEnabled}
                  onNavigateFile={onNavigateFile}
                />
              ) : (
                <Editor
                  content={content}
                  onChange={(c) => handleEditorChange(layout.id, activeTab.filePath, c, activeTab.vaultPath)}
                  filePath={activeTab.filePath}
                  vimEnabled={vimEnabled}
                  onVimModeChange={setVimMode}
                />
              )}
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
