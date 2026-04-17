import { useState, useCallback, useMemo } from "react";
import { Box, Flex } from "@chakra-ui/react";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { PaneContainer } from "./pane";
import { QuickOpen } from "@/components/search/QuickOpen";
import { SearchPanel } from "@/components/search/SearchPanel";
import { EnvironmentManager } from "./environments/EnvironmentManager";
import { usePaneState } from "@/hooks/usePaneState";
import { useVault } from "@/hooks/useVault";
import { useFileOperations } from "@/hooks/useFileOperations";
import { useEditorSession } from "@/hooks/useEditorSession";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useSidebarResize } from "@/hooks/useSidebarResize";
import { useSessionPersistence } from "@/hooks/useSessionPersistence";
import { useChatSessions } from "@/hooks/useChatSessions";
import { useChat } from "@/hooks/useChat";
import { WorkspaceContext } from "@/contexts/WorkspaceContext";
import { PaneContext } from "@/contexts/PaneContext";
import { EditorSettingsContext } from "@/contexts/EditorSettingsContext";
import { EnvironmentContext } from "@/contexts/EnvironmentContext";
import { ConflictContext } from "@/contexts/ConflictContext";
import { ChatContext } from "@/contexts/ChatContext";
import { useEnvironments } from "@/hooks/useEnvironments";
import { useFileConflicts } from "@/hooks/useFileConflicts";
import { ChatPanel } from "@/components/chat/ChatPanel";

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [vimEnabled, setVimEnabled] = useState(false);
  const [vimMode, setVimMode] = useState("normal");

  const [chatOpen, setChatOpen] = useState(false);
  const [chatWidth] = useState(380);

  const toggleSidebar = useCallback(() => setSidebarOpen((prev) => !prev), []);
  const toggleChat = useCallback(() => setChatOpen((prev) => !prev), []);
  const toggleVim = useCallback(() => setVimEnabled((v) => !v), []);

  // Hooks
  const { sidebarWidth, startResize } = useSidebarResize();
  const { layout, activePaneId, editorContents, unsavedFiles, getActiveLeaf, actions } =
    usePaneState();
  const vault = useVault();

  const fileConflicts = useFileConflicts({
    vaultPath: vault.vaultPath,
    editorContents,
    getOpenFiles: useCallback(() => [...editorContents.keys()], [editorContents]),
    updateEditorContent: useCallback((filePath: string, content: string) => {
      editorContents.set(filePath, content);
      actions.updateContent(filePath, content);
    }, [editorContents, actions]),
  });

  const editorSession = useEditorSession({
    vaultPath: vault.vaultPath,
    activePaneId,
    editorContents,
    actions,
    getActiveLeaf,
    hasConflict: fileConflicts.hasConflict,
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
      toggleChat,
    }),
    [toggleSidebar, toggleChat, actions, getActiveLeaf, editorSession.forceSave],
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
      handleMoveFile: fileOps.handleMoveFile,
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
      unsavedFiles,
      getActiveLeaf,
      actions,
      handleEditorChange: editorSession.handleEditorChange,
    }),
    [layout, activePaneId, editorContents, unsavedFiles, getActiveLeaf, actions, editorSession.handleEditorChange],
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

  const conflictValue = useMemo(
    () => ({
      hasConflict: fileConflicts.hasConflict,
      resolveConflict: fileConflicts.resolveConflict,
    }),
    [fileConflicts.hasConflict, fileConflicts.resolveConflict],
  );

  // Chat hooks
  const chatSessions = useChatSessions();
  const chatHook = useChat(chatSessions.activeSessionId);
  const chatValue = useMemo(
    () => ({
      ...chatSessions,
      ...chatHook,
    }),
    [chatSessions, chatHook],
  );

  const envHook = useEnvironments();
  const environmentValue = useMemo(
    () => ({
      environments: envHook.environments,
      activeEnvironment: envHook.activeEnvironment,
      managerOpen: envHook.managerOpen,
      openManager: envHook.openManager,
      closeManager: envHook.closeManager,
      switchEnvironment: envHook.switchEnvironment,
      createEnvironment: envHook.createEnvironment,
      deleteEnvironment: envHook.deleteEnvironment,
      duplicateEnvironment: envHook.duplicateEnvironment,
      loadVariables: envHook.loadVariables,
      setVariable: envHook.setVariable,
      deleteVariable: envHook.deleteVariable,
      getActiveVariables: envHook.getActiveVariables,
      variablesVersion: envHook.variablesVersion,
    }),
    [envHook],
  );

  return (
    <WorkspaceContext.Provider value={workspaceValue}>
      <PaneContext.Provider value={paneValue}>
        <EditorSettingsContext.Provider value={editorSettingsValue}>
        <EnvironmentContext.Provider value={environmentValue}>
        <ConflictContext.Provider value={conflictValue}>
        <ChatContext.Provider value={chatValue}>
          <Flex h="100vh" direction="column" bg="bg.subtle" overflow="hidden">
            <TopBar
              sidebarOpen={sidebarOpen}
              onToggleSidebar={toggleSidebar}
              chatOpen={chatOpen}
              onToggleChat={toggleChat}
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
              {chatOpen && <ChatPanel width={chatWidth} />}
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

            <EnvironmentManager />
          </Flex>
        </ChatContext.Provider>
        </ConflictContext.Provider>
        </EnvironmentContext.Provider>
        </EditorSettingsContext.Provider>
      </PaneContext.Provider>
    </WorkspaceContext.Provider>
  );
}
