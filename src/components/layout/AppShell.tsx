import { useState, useCallback, useMemo, useEffect } from "react";
import { Box, Flex } from "@chakra-ui/react";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { PaneContainer } from "./pane";
import { QuickOpen } from "@/components/search/QuickOpen";
import { SearchPanel } from "@/components/search/SearchPanel";
import { EnvironmentManager } from "./environments/EnvironmentManager";
import { SettingsDrawer } from "./settings/SettingsDrawer";
import { usePaneStore } from "@/stores/pane";
import { useWorkspaceStore } from "@/stores/workspace";
import { initTauriBridge } from "@/stores/tauri-bridge";
import { useFileOperations } from "@/hooks/useFileOperations";
import { useEditorSession } from "@/hooks/useEditorSession";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useSidebarResize } from "@/hooks/useSidebarResize";
import { useSessionPersistence } from "@/hooks/useSessionPersistence";
import { WorkspaceContext } from "@/contexts/WorkspaceContext";
import { useAutoUpdate } from "@/hooks/useAutoUpdate";
import { ChatPanel } from "@/components/chat/ChatPanel";

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatWidth] = useState(380);

  const toggleSidebar = useCallback(() => setSidebarOpen((prev) => !prev), []);
  const toggleChat = useCallback(() => setChatOpen((prev) => !prev), []);

  // Initialize all Tauri listeners and stores once
  useEffect(() => { initTauriBridge(); }, []);

  // Hooks
  useAutoUpdate();
  useSessionPersistence();
  const { sidebarWidth, isResizing: isSidebarResizing, startResize } = useSidebarResize();

  // Workspace store
  const vaultPath = useWorkspaceStore((s) => s.vaultPath);
  const vaults = useWorkspaceStore((s) => s.vaults);
  const entries = useWorkspaceStore((s) => s.entries);
  const switchVault = useWorkspaceStore((s) => s.switchVault);
  const openVault = useWorkspaceStore((s) => s.openVault);
  const refreshFileTree = useWorkspaceStore((s) => s.refreshFileTree);

  // Pane store
  const getActiveLeaf = usePaneStore((s) => s.getActiveLeaf);
  const splitVertical = usePaneStore((s) => s.splitVertical);
  const splitHorizontal = usePaneStore((s) => s.splitHorizontal);
  const closeTab = usePaneStore((s) => s.closeTab);
  const nextTab = usePaneStore((s) => s.nextTab);

  // Editor session (reads from stores internally)
  const editorSession = useEditorSession();
  const fileOps = useFileOperations({
    vaultPath,
    refreshFileTree,
    onFileCreated: editorSession.handleFileSelect,
  });

  const shortcutActions = useMemo(
    () => ({
      toggleSidebar,
      splitVertical,
      splitHorizontal,
      closeActiveTab: () => {
        const leaf = getActiveLeaf();
        if (leaf && leaf.tabs.length > 0) {
          closeTab(leaf.id, leaf.activeTab);
        }
      },
      nextTab,
      openQuickOpen: () => setQuickOpenOpen(true),
      openSearchPanel: () => setSearchPanelOpen(true),
      forceSave: editorSession.forceSave,
      toggleChat,
    }),
    [toggleSidebar, toggleChat, splitVertical, splitHorizontal, closeTab, nextTab, getActiveLeaf, editorSession.forceSave],
  );
  useKeyboardShortcuts(shortcutActions);

  // WorkspaceContext still needed for fileOps (local UI state)
  const workspaceValue = useMemo(
    () => ({
      vaultPath,
      vaults,
      entries,
      switchVault,
      openVault,
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
    [vaultPath, vaults, entries, switchVault, openVault, fileOps, editorSession.handleFileSelect],
  );

  return (
    <WorkspaceContext.Provider value={workspaceValue}>
      <Flex h="100vh" direction="column" bg="bg.subtle" overflow="hidden" css={isSidebarResizing ? { cursor: "col-resize", userSelect: "none" } : undefined}>
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
                _hover={{ bg: "brand.500/30" }}
                _active={{ bg: "brand.500/50" }}
                transition="background 0.15s"
                onMouseDown={startResize}
              />
            </>
          )}
          <PaneContainer handleEditorChange={editorSession.handleEditorChange} onNavigateFile={editorSession.handleFileSelect} />
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
        <SettingsDrawer />
      </Flex>
    </WorkspaceContext.Provider>
  );
}
