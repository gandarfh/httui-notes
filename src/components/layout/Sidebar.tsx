import { Box, HStack, Text, IconButton, Menu, Portal } from "@chakra-ui/react";
import { FileTree } from "./FileTree";
import type { InlineCreate } from "./FileTree";
import type { FileEntry } from "@/lib/tauri/commands";
import { LuPlus, LuFileText, LuFolder } from "react-icons/lu";

interface SidebarProps {
  width: number;
  entries: FileEntry[];
  activeFile: string | null;
  inlineCreate: InlineCreate | null;
  onStartCreate: (type: "note" | "folder", dirPath: string) => void;
  onFileSelect: (path: string) => void;
  onCreateNote: (dirPath: string, name: string) => void;
  onCreateFolder: (dirPath: string, name: string) => void;
  onRename: (path: string, newName: string) => void;
  onDelete: (path: string) => void;
  onCancelInline: () => void;
  vaultPath: string | null;
}

export function Sidebar({
  width,
  entries,
  activeFile,
  inlineCreate,
  onStartCreate,
  onFileSelect,
  onCreateNote,
  onCreateFolder,
  onRename,
  onDelete,
  onCancelInline,
  vaultPath,
}: SidebarProps) {
  return (
    <Box
      w={`${width}px`}
      bg="bg"
      borderRightWidth="1px"
      borderColor="border"
      display="flex"
      flexDirection="column"
      overflow="hidden"
      flexShrink={0}
    >
      {/* Files section */}
      <Box flex={1} overflowY="auto">
        <HStack px={3} py={2} justify="space-between">
          <Text fontSize="xs" fontWeight="semibold" color="fg.subtle" textTransform="uppercase" letterSpacing="wider">
            Files
          </Text>
          {vaultPath && (
            <Menu.Root positioning={{ placement: "bottom-end" }}>
              <Menu.Trigger asChild>
                <IconButton
                  aria-label="New..."
                  variant="ghost"
                  size="xs"
                >
                  <LuPlus />
                </IconButton>
              </Menu.Trigger>
              <Portal>
                <Menu.Positioner>
                  <Menu.Content>
                    <Menu.Item value="note" onSelect={() => onStartCreate("note", "")}>
                      <LuFileText />
                      Nova nota
                    </Menu.Item>
                    <Menu.Item value="folder" onSelect={() => onStartCreate("folder", "")}>
                      <LuFolder />
                      Nova pasta
                    </Menu.Item>
                  </Menu.Content>
                </Menu.Positioner>
              </Portal>
            </Menu.Root>
          )}
        </HStack>
        {vaultPath ? (
          <FileTree
            entries={entries}
            activeFile={activeFile}
            inlineCreate={inlineCreate}
            onStartCreate={onStartCreate}
            onFileSelect={onFileSelect}
            onCreateNote={onCreateNote}
            onCreateFolder={onCreateFolder}
            onRename={onRename}
            onDelete={onDelete}
            onCancelInline={onCancelInline}
          />
        ) : (
          <Box px={3} py={8} textAlign="center">
            <Text fontSize="sm" color="fg.muted">No vault selected</Text>
          </Box>
        )}
      </Box>

      {/* Connections section */}
      <Box borderTopWidth="1px" borderColor="border">
        <Box px={3} py={2}>
          <Text fontSize="xs" fontWeight="semibold" color="fg.subtle" textTransform="uppercase" letterSpacing="wider">
            Connections
          </Text>
        </Box>
        <Box px={3} py={4} textAlign="center">
          <Text fontSize="sm" color="fg.muted">No connections</Text>
        </Box>
      </Box>
    </Box>
  );
}
