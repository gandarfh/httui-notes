import { useState, useCallback, useEffect, useRef } from "react";
import { Box, Flex, HStack, Text, Circle } from "@chakra-ui/react";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { Editor } from "@/components/editor";
import { markdownToHtml } from "@/lib/markdown/parser";
import { htmlToMarkdown } from "@/lib/markdown/serializer";
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

  // Editor state
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [unsaved, setUnsaved] = useState(false);

  // Inline create state
  const [inlineCreate, setInlineCreate] = useState<{
    type: "note" | "folder";
    dirPath: string;
  } | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  // --- Load vaults on startup ---
  useEffect(() => {
    (async () => {
      try {
        const savedVaults = await listVaults();
        setVaults(savedVaults);
        const active = await getActiveVault();
        if (active) {
          await switchVault(active);
          const lastFile = await getConfig("active_file");
          if (lastFile) {
            try {
              const markdown = await readNote(active, lastFile);
              setActiveFile(lastFile);
              setEditorContent(markdownToHtml(markdown));
            } catch {
              // File may have been deleted since last session
            }
          }
        }
      } catch {
        // App may not be in Tauri context (dev browser)
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        setActiveFile(null);
        setEditorContent("");
        await setActiveVault(path);
        await refreshFileTree(path);
        await startWatching(path);
        const savedVaults = await listVaults();
        setVaults(savedVaults);
      } catch (err) {
        console.error("Failed to switch vault:", err);
      }
    },
    [refreshFileTree],
  );

  // --- Open vault (native folder picker) ---
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

  // --- File watcher listener ---
  useEffect(() => {
    const unlisten = listen("fs-event", () => {
      if (vaultPath) {
        refreshFileTree(vaultPath);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [vaultPath, refreshFileTree]);

  // --- Open file ---
  const handleFileSelect = useCallback(
    async (filePath: string) => {
      if (!vaultPath) return;

      if (activeFile && unsaved) {
        await writeNote(vaultPath, activeFile, htmlToMarkdown(editorContent));
        setUnsaved(false);
      }

      try {
        const markdown = await readNote(vaultPath, filePath);
        setActiveFile(filePath);
        setEditorContent(markdownToHtml(markdown));
        setUnsaved(false);
        setConfig("active_file", filePath).catch(() => {});
      } catch (err) {
        console.error("Failed to read note:", err);
      }
    },
    [vaultPath, activeFile, unsaved, editorContent],
  );

  // --- Editor change with auto-save ---
  const handleEditorChange = useCallback(
    (content: string) => {
      setEditorContent(content);
      setUnsaved(true);

      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }

      autoSaveTimer.current = setTimeout(async () => {
        if (vaultPath && activeFile) {
          try {
            await writeNote(vaultPath, activeFile, htmlToMarkdown(content));
            setUnsaved(false);
          } catch (err) {
            console.error("Auto-save failed:", err);
          }
        }
      }, 1000);
    },
    [vaultPath, activeFile],
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
        if (activeFile === path) {
          setActiveFile(newPath);
        }
        await refreshFileTree(vaultPath);
      } catch (err) {
        console.error("Failed to rename:", err);
      }
    },
    [vaultPath, activeFile, refreshFileTree],
  );

  const handleDelete = useCallback(
    async (path: string) => {
      if (!vaultPath) return;
      // File goes to OS trash, so it's reversible
      try {
        await deleteNote(vaultPath, path);
        if (activeFile === path) {
          setActiveFile(null);
          setEditorContent("");
        }
        await refreshFileTree(vaultPath);
      } catch (err) {
        alert(`Failed to delete: ${err}`);
      }
    },
    [vaultPath, activeFile, refreshFileTree],
  );

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleSidebar]);

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

        {/* Main content area */}
        <Flex flex={1} direction="column" overflow="hidden">
          {activeFile ? (
            <>
              {/* Tab bar */}
              <HStack
                h="32px"
                px={2}
                bg="bg"
                borderBottomWidth="1px"
                borderColor="border"
              >
                <Text fontSize="xs" color="fg.subtle" truncate>
                  {activeFile}
                </Text>
                {unsaved && <Circle size="8px" bg="orange.400" />}
              </HStack>
              {/* Editor */}
              <Box flex={1} overflow="hidden">
                <Editor
                  content={editorContent}
                  onChange={handleEditorChange}
                  filePath={activeFile}
                />
              </Box>
            </>
          ) : (
            <Flex h="100%" align="center" justify="center">
              <Text fontSize="sm" color="fg.muted">
                {vaultPath
                  ? "Open a file to start editing"
                  : "Open a vault to get started"}
              </Text>
            </Flex>
          )}
        </Flex>
      </Flex>

      <StatusBar />
    </Flex>
  );
}
