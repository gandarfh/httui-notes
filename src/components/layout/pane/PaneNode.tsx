import { Box, Flex, Text } from "@chakra-ui/react";
import { TabBar } from "../TabBar";
import { Editor } from "@/components/editor";
import { DiffViewer } from "@/components/editor/DiffViewer";
import { ConflictBanner } from "../ConflictBanner";
import { usePaneContext } from "@/contexts/PaneContext";
import { useEditorSettings } from "@/contexts/EditorSettingsContext";
import { useConflictContext } from "@/contexts/ConflictContext";
import { SplitView } from "./SplitView";
import type { PaneLayout } from "@/types/pane";

export function PaneNode({ layout, path }: { layout: PaneLayout; path: number[] }) {
  const { activePaneId, editorContents, unsavedFiles, actions, handleEditorChange } = usePaneContext();
  const { vimEnabled, setVimMode } = useEditorSettings();
  const conflictCtx = useConflictContext();

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
        borderColor="blue.500/30"
        onClick={() => actions.setActivePaneId(layout.id)}
      >
        <TabBar
          tabs={layout.tabs}
          activeTab={layout.activeTab}
          unsavedFiles={unsavedFiles}
          onSelectTab={(index) => actions.selectTab(layout.id, index)}
          onCloseTab={(index) => actions.closeTab(layout.id, index)}
          onCloseOthers={(index) => actions.closeOthers(layout.id, index)}
          onCloseAll={() => actions.closeAll(layout.id)}
        />
        {activeTab ? (
          activeTab.kind === "diff" ? (
            <Box flex={1} overflow="hidden">
              <DiffViewer tab={activeTab} />
            </Box>
          ) : (
          <Box flex={1} overflow="hidden" display="flex" flexDirection="column">
            {conflictCtx?.hasConflict(activeTab.filePath) && (
              <ConflictBanner
                filePath={activeTab.filePath}
                onReload={() => conflictCtx.resolveConflict(activeTab.filePath, "reload")}
                onKeep={() => conflictCtx.resolveConflict(activeTab.filePath, "keep")}
              />
            )}
            <Box flex={1} overflow="hidden">
              <Editor
                content={content}
                onChange={(c) => handleEditorChange(layout.id, activeTab.filePath, c, activeTab.vaultPath)}
                filePath={activeTab.filePath}
                vimEnabled={vimEnabled}
                onVimModeChange={setVimMode}
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

  return <SplitView layout={layout} path={path} />;
}
