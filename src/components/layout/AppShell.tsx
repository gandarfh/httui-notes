import { useState, useCallback, useEffect, useRef } from "react";
import { Box, Flex } from "@chakra-ui/react";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { PaneContainer } from "./PaneContainer";
import { QuickOpen } from "@/components/search/QuickOpen";
import { SearchPanel } from "@/components/search/SearchPanel";
import { markdownToHtml } from "@/lib/markdown/parser";
import { htmlToMarkdown } from "@/lib/markdown/serializer";
import { usePaneState } from "@/hooks/usePaneState";
import {
  listWorkspace,
  readNote,
  writeNote,
  createNote,
  createFolder,
  deleteNote,
  renameNote,
  listVaults,
  setActiveVault,
  getActiveVault,
  startWatching,
  stopWatching,
  getConfig,
  setConfig,
  rebuildSearchIndex,
} from "@/lib/tauri/commands";
import type { FileEntry } from "@/lib/tauri/commands";
import { listen } from "@tauri-apps/api/event";

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 500;
const SIDEBAR_DEFAULT = 256;

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const isResizing = useRef(false);

  // Vault state
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [vaults, setVaults] = useState<string[]>([]);
  const [entries, setEntries] = useState<FileEntry[]>([]);

  // Quick-open state
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);

  // Search panel state
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);

  // Vim state
  const [vimEnabled, setVimEnabled] = useState(false);
  const [vimMode, setVimMode] = useState("normal");

  // Inline create state
  const [inlineCreate, setInlineCreate] = useState<{
    type: "note" | "folder";
    dirPath: string;
  } | null>(null);

  // Pane state
  const { layout, activePaneId, editorContents, getActiveLeaf, actions } =
    usePaneState();

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  // --- Load session on startup ---
  useEffect(() => {
    (async () => {
      try {
        const savedVaults = await listVaults();
        setVaults(savedVaults);

        // Restore vim mode
        const savedVim = await getConfig("vim_enabled");
        if (savedVim === "true") setVimEnabled(true);

        const active = await getActiveVault();
        if (active) {
          await switchVault(active);

          // Restore pane layout
          const savedLayout = await getConfig("pane_layout");
          const savedPaneId = await getConfig("active_pane_id");
          if (savedLayout && savedPaneId) {
            try {
              const parsed = JSON.parse(savedLayout);
              actions.restoreLayout(parsed, savedPaneId);
              // Load content for all open tabs
              const loadTabs = (node: import("@/types/pane").PaneLayout) => {
                if (node.type === "leaf") {
                  for (const tab of node.tabs) {
                    readNote(active, tab.filePath)
                      .then((md) => editorContents.set(tab.filePath, markdownToHtml(md)))
                      .catch(() => {});
                  }
                } else {
                  loadTabs(node.children[0]);
                  loadTabs(node.children[1]);
                }
              };
              loadTabs(parsed);
            } catch {
              // Invalid layout JSON, use default
            }
          } else {
            // Fallback: restore last file
            const lastFile = await getConfig("active_file");
            if (lastFile) {
              try {
                const markdown = await readNote(active, lastFile);
                actions.openFile(lastFile, markdownToHtml(markdown));
              } catch {
                // File may have been deleted
              }
            }
          }
        }
      } catch {
        // App may not be in Tauri context
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Save session on changes ---
  useEffect(() => {
    setConfig("pane_layout", JSON.stringify(layout)).catch(() => {});
    setConfig("active_pane_id", activePaneId).catch(() => {});
  }, [layout, activePaneId]);

  useEffect(() => {
    setConfig("vim_enabled", vimEnabled ? "true" : "false").catch(() => {});
  }, [vimEnabled]);

  // --- Refresh file tree ---
  const refreshFileTree = useCallback(async (vault: string) => {
    try {
      const tree = await listWorkspace(vault);
      setEntries(tree);
    } catch (err) {
      console.error("Failed to list workspace:", err);
    }
  }, []);

  // --- Switch vault ---
  const switchVault = useCallback(
    async (path: string) => {
      try {
        await stopWatching().catch(() => {});
        setVaultPath(path);
        await setActiveVault(path);
        await refreshFileTree(path);
        await startWatching(path);
        rebuildSearchIndex(path).catch(() => {});
        const savedVaults = await listVaults();
        setVaults(savedVaults);
      } catch (err) {
        console.error("Failed to switch vault:", err);
      }
    },
    [refreshFileTree],
  );

  // --- Open vault ---
  const openVault = useCallback(async () => {
    try {
      const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
      const selected = await openDialog({ directory: true, multiple: false });
      if (selected) {
        await switchVault(selected as string);
      }
    } catch {
      const path = prompt("Enter vault path:");
      if (path) {
        await switchVault(path);
      }
    }
  }, [switchVault]);

  // --- File watcher ---
  useEffect(() => {
    const unlisten = listen("fs-event", () => {
      if (vaultPath) refreshFileTree(vaultPath);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [vaultPath, refreshFileTree]);

  // --- Open file in active pane ---
  const handleFileSelect = useCallback(
    async (filePath: string) => {
      if (!vaultPath) return;
      try {
        if (!editorContents.has(filePath)) {
          const markdown = await readNote(vaultPath, filePath);
          editorContents.set(filePath, markdownToHtml(markdown));
        }
        actions.openFile(filePath, editorContents.get(filePath) ?? "");
        setConfig("active_file", filePath).catch(() => {});
      } catch (err) {
        console.error("Failed to read note:", err);
      }
    },
    [vaultPath, editorContents, actions],
  );

  // --- Editor change with auto-save ---
  const handleEditorChange = useCallback(
    (_paneId: string, filePath: string, content: string) => {
      actions.updateContent(filePath, content);
      actions.markUnsaved(activePaneId, filePath, true);

      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);

      autoSaveTimer.current = setTimeout(async () => {
        if (vaultPath) {
          try {
            await writeNote(vaultPath, filePath, htmlToMarkdown(content));
            actions.markUnsaved(activePaneId, filePath, false);
          } catch (err) {
            console.error("Auto-save failed:", err);
          }
        }
      }, 1000);
    },
    [vaultPath, activePaneId, actions],
  );

  // --- CRUD operations (inline) ---
  const handleStartCreate = useCallback(
    (type: "note" | "folder", dirPath: string) => {
      setInlineCreate({ type, dirPath });
    },
    [],
  );

  const handleCreateNote = useCallback(
    async (dirPath: string, name: string) => {
      if (!vaultPath || !name) return;
      setInlineCreate(null);
      const filePath = dirPath ? `${dirPath}/${name}.md` : `${name}.md`;
      try {
        await createNote(vaultPath, filePath);
        await refreshFileTree(vaultPath);
        await handleFileSelect(filePath);
      } catch (err) {
        console.error("Failed to create note:", err);
      }
    },
    [vaultPath, refreshFileTree, handleFileSelect],
  );

  const handleCreateFolder = useCallback(
    async (dirPath: string, name: string) => {
      if (!vaultPath || !name) return;
      setInlineCreate(null);
      const folderPath = dirPath ? `${dirPath}/${name}` : name;
      try {
        await createFolder(vaultPath, folderPath);
        await refreshFileTree(vaultPath);
      } catch (err) {
        console.error("Failed to create folder:", err);
      }
    },
    [vaultPath, refreshFileTree],
  );

  const handleRename = useCallback(
    async (path: string, newName: string) => {
      if (!vaultPath || !newName) return;
      const dir = path.includes("/")
        ? path.substring(0, path.lastIndexOf("/"))
        : "";
      const newPath = dir ? `${dir}/${newName}` : newName;
      try {
        await renameNote(vaultPath, path, newPath);
        await refreshFileTree(vaultPath);
      } catch (err) {
        console.error("Failed to rename:", err);
      }
    },
    [vaultPath, refreshFileTree],
  );

  const handleDelete = useCallback(
    async (path: string) => {
      if (!vaultPath) return;
      try {
        await deleteNote(vaultPath, path);
        await refreshFileTree(vaultPath);
      } catch (err) {
        console.error("Failed to delete:", err);
      }
    },
    [vaultPath, refreshFileTree],
  );

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "b") {
        e.preventDefault();
        toggleSidebar();
      }
      if (mod && e.key === "\\") {
        e.preventDefault();
        if (e.shiftKey) actions.splitHorizontal();
        else actions.splitVertical();
      }
      if (mod && e.key === "w") {
        e.preventDefault();
        const leaf = getActiveLeaf();
        if (leaf && leaf.tabs.length > 0) {
          actions.closeTab(leaf.id, leaf.activeTab);
        }
      }
      if (mod && e.key === "Tab") {
        e.preventDefault();
        actions.nextTab();
      }
      if (mod && e.key === "p") {
        e.preventDefault();
        setQuickOpenOpen(true);
      }
      if (mod && e.shiftKey && e.key === "f") {
        e.preventDefault();
        setSearchPanelOpen(true);
      }
      if (mod && e.key === "s") {
        e.preventDefault();
        // Force save current file
        const leaf = getActiveLeaf();
        if (leaf && leaf.tabs.length > 0 && vaultPath) {
          const tab = leaf.tabs[leaf.activeTab];
          if (tab) {
            const content = editorContents.get(tab.filePath);
            if (content) {
              writeNote(vaultPath, tab.filePath, htmlToMarkdown(content))
                .then(() => actions.markUnsaved(leaf.id, tab.filePath, false))
                .catch((err) => console.error("Save failed:", err));
            }
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleSidebar, actions, getActiveLeaf, vaultPath, editorContents]);

  // --- Resize sidebar ---
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, e.clientX));
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  // Active file for sidebar highlight
  const activeLeaf = getActiveLeaf();
  const activeFile =
    activeLeaf && activeLeaf.tabs.length > 0
      ? activeLeaf.tabs[activeLeaf.activeTab]?.filePath ?? null
      : null;

  return (
    <Flex h="100vh" direction="column" bg="bg.subtle">
      <TopBar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
        vaultPath={vaultPath}
        vaults={vaults}
        onSwitchVault={switchVault}
        onOpenVault={openVault}
      />

      <Flex flex={1} overflow="hidden">
        {sidebarOpen && (
          <>
            <Sidebar
              width={sidebarWidth}
              entries={entries}
              activeFile={activeFile}
              inlineCreate={inlineCreate}
              onStartCreate={handleStartCreate}
              onFileSelect={handleFileSelect}
              onCreateNote={handleCreateNote}
              onCreateFolder={handleCreateFolder}
              onRename={handleRename}
              onDelete={handleDelete}
              onCancelInline={() => setInlineCreate(null)}
              vaultPath={vaultPath}
            />
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

        {/* Pane area */}
        <PaneContainer
          layout={layout}
          activePaneId={activePaneId}
          editorContents={editorContents}
          vimEnabled={vimEnabled}
          onVimModeChange={(mode) => setVimMode(mode)}
          onSelectTab={actions.selectTab}
          onCloseTab={actions.closeTab}
          onCloseOthers={actions.closeOthers}
          onCloseAll={actions.closeAll}
          onEditorChange={handleEditorChange}
          onPaneClick={actions.setActivePaneId}
          onSplitResize={actions.resizeSplit}
        />
      </Flex>

      <StatusBar
        paneCount={countLeaves(layout)}
        vimEnabled={vimEnabled}
        vimMode={vimMode}
        onToggleVim={() => setVimEnabled((v) => !v)}
      />

      <QuickOpen
        open={quickOpenOpen}
        onClose={() => setQuickOpenOpen(false)}
        vaultPath={vaultPath}
        onSelectFile={handleFileSelect}
      />

      <SearchPanel
        open={searchPanelOpen}
        onClose={() => setSearchPanelOpen(false)}
        onSelectFile={handleFileSelect}
      />
    </Flex>
  );
}

function countLeaves(node: import("@/types/pane").PaneLayout): number {
  if (node.type === "leaf") return 1;
  return countLeaves(node.children[0]) + countLeaves(node.children[1]);
}
