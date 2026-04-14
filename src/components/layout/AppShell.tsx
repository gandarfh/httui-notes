import { useState, useCallback, useMemo } from "react";
import { Box, Flex } from "@chakra-ui/react";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { PaneContainer } from "./pane";
import { QuickOpen } from "@/components/search/QuickOpen";
import { SearchPanel } from "@/components/search/SearchPanel";
import { usePaneState } from "@/hooks/usePaneState";
import { useVault } from "@/hooks/useVault";
import { useFileOperations } from "@/hooks/useFileOperations";
import { useEditorSession } from "@/hooks/useEditorSession";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useSidebarResize } from "@/hooks/useSidebarResize";
import { useSessionPersistence } from "@/hooks/useSessionPersistence";
import { WorkspaceContext } from "@/contexts/WorkspaceContext";
import { PaneContext } from "@/contexts/PaneContext";
import { EditorSettingsContext } from "@/contexts/EditorSettingsContext";

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [vimEnabled, setVimEnabled] = useState(false);
  const [vimMode, setVimMode] = useState("normal");

  const toggleSidebar = useCallback(() => setSidebarOpen((prev) => !prev), []);
  const toggleVim = useCallback(() => setVimEnabled((v) => !v), []);

  // Hooks
  const { sidebarWidth, startResize } = useSidebarResize();
  const { layout, activePaneId, editorContents, getActiveLeaf, actions } =
    usePaneState();
  const vault = useVault();
  const editorSession = useEditorSession({
    vaultPath: vault.vaultPath,
    activePaneId,
    editorContents,
    actions,
    getActiveLeaf,
  });
  const fileOps = useFileOperations({
    vaultPath: vault.vaultPath,
    refreshFileTree: vault.refreshFileTree,
    onFileCreated: editorSession.handleFileSelect,
  });

  useSessionPersistence({
    layout,
    activePaneId,
    actions,
    vimEnabled,
    setVimEnabled,
    setVaults: vault.setVaults,
    setVaultPath: vault.setVaultPath,
    setEntries: vault.setEntries,
  });

  const shortcutActions = useMemo(
    () => ({
      toggleSidebar,
      splitVertical: actions.splitVertical,
      splitHorizontal: actions.splitHorizontal,
      closeActiveTab: () => {
        const leaf = getActiveLeaf();
        if (leaf && leaf.tabs.length > 0) {
          actions.closeTab(leaf.id, leaf.activeTab);
        }
      },
      nextTab: actions.nextTab,
      openQuickOpen: () => setQuickOpenOpen(true),
      openSearchPanel: () => setSearchPanelOpen(true),
      forceSave: editorSession.forceSave,
    }),
    [toggleSidebar, actions, getActiveLeaf, editorSession.forceSave],
  );
  useKeyboardShortcuts(shortcutActions);

  // Context values (memoized)
  const workspaceValue = useMemo(
    () => ({
      vaultPath: vault.vaultPath,
      vaults: vault.vaults,
      entries: vault.entries,
      switchVault: vault.switchVault,
      openVault: vault.openVault,
      inlineCreate: fileOps.inlineCreate,
      handleStartCreate: fileOps.handleStartCreate,
      handleCreateNote: fileOps.handleCreateNote,
      handleCreateFolder: fileOps.handleCreateFolder,
      handleRename: fileOps.handleRename,
      handleDelete: fileOps.handleDelete,
      cancelInlineCreate: fileOps.cancelInlineCreate,
      handleFileSelect: editorSession.handleFileSelect,
    }),
    [vault, fileOps, editorSession.handleFileSelect],
  );

  const paneValue = useMemo(
    () => ({
      layout,
      activePaneId,
      editorContents,
      getActiveLeaf,
      actions,
      handleEditorChange: editorSession.handleEditorChange,
    }),
    [layout, activePaneId, editorContents, getActiveLeaf, actions, editorSession.handleEditorChange],
  );

  const editorSettingsValue = useMemo(
    () => ({
      vimEnabled,
      vimMode,
      toggleVim,
      setVimMode,
    }),
    [vimEnabled, vimMode, toggleVim],
  );

  return (
    <WorkspaceContext.Provider value={workspaceValue}>
      <PaneContext.Provider value={paneValue}>
        <EditorSettingsContext.Provider value={editorSettingsValue}>
          <Flex h="100vh" direction="column" bg="bg.subtle">
            <TopBar
              sidebarOpen={sidebarOpen}
              onToggleSidebar={toggleSidebar}
            />

            <Flex flex={1} overflow="hidden">
              {sidebarOpen && (
                <>
                  <Sidebar width={sidebarWidth} />
                  <Box
                    w="4px"
                    cursor="col-resize"
                    _hover={{ bg: "blue.500/30" }}
                    _active={{ bg: "blue.500/50" }}
                    transition="background 0.15s"
                    onMouseDown={startResize}
                  />
                </>
              )}
              <PaneContainer />
            </Flex>

            <StatusBar />

            <QuickOpen
              open={quickOpenOpen}
              onClose={() => setQuickOpenOpen(false)}
            />

            <SearchPanel
              open={searchPanelOpen}
              onClose={() => setSearchPanelOpen(false)}
            />
          </Flex>
        </EditorSettingsContext.Provider>
      </PaneContext.Provider>
    </WorkspaceContext.Provider>
  );
}
