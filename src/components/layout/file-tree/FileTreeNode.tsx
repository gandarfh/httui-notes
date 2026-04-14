import { useState, useCallback } from "react";
import { Box, Text, HStack, VStack, Menu, Portal } from "@chakra-ui/react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { usePaneContext } from "@/contexts/PaneContext";
import type { FileEntry } from "@/lib/tauri/commands";
import { InlineInput } from "./InlineInput";
import {
  LuFolder,
  LuFolderOpen,
  LuFileText,
  LuChevronRight,
  LuChevronDown,
} from "react-icons/lu";

export function FileTreeNode({
  entry,
  depth,
}: {
  entry: FileEntry;
  depth: number;
}) {
  const {
    inlineCreate,
    handleStartCreate,
    handleFileSelect,
    handleCreateNote,
    handleCreateFolder,
    handleRename,
    handleDelete,
    cancelInlineCreate,
  } = useWorkspace();
  const { getActiveLeaf } = usePaneContext();

  const [expanded, setExpanded] = useState(depth === 0);
  const [renaming, setRenaming] = useState(false);

  const activeLeaf = getActiveLeaf();
  const activeFile =
    activeLeaf && activeLeaf.tabs.length > 0
      ? activeLeaf.tabs[activeLeaf.activeTab]?.filePath ?? null
      : null;
  const isActive = !entry.is_dir && entry.path === activeFile;

  const showChildInline =
    inlineCreate &&
    entry.is_dir &&
    inlineCreate.dirPath === entry.path;

  const isExpanded = expanded || !!showChildInline;

  const handleClick = useCallback(() => {
    if (entry.is_dir) {
      setExpanded((prev) => !prev);
    } else {
      handleFileSelect(entry.path);
    }
  }, [entry, handleFileSelect]);

  if (renaming) {
    return (
      <InlineInput
        type={entry.is_dir ? "folder" : "note"}
        depth={depth}
        defaultValue={entry.name}
        onConfirm={(newName) => {
          handleRename(entry.path, newName);
          setRenaming(false);
        }}
        onCancel={() => setRenaming(false)}
      />
    );
  }

  const menuItems = entry.is_dir
    ? [
        {
          label: "Nova nota",
          action: () => handleStartCreate("note", entry.path),
        },
        {
          label: "Nova pasta",
          action: () => handleStartCreate("folder", entry.path),
        },
        { label: "Renomear", action: () => setRenaming(true) },
        {
          label: "Excluir",
          value: "delete",
          action: () => handleDelete(entry.path),
        },
      ]
    : [
        { label: "Renomear", action: () => setRenaming(true) },
        {
          label: "Excluir",
          value: "delete",
          action: () => handleDelete(entry.path),
        },
      ];

  return (
    <>
      <Menu.Root>
        <Menu.ContextTrigger asChild>
          <HStack
            as="button"
            w="100%"
            px={2}
            py={1}
            pl={`${depth * 16 + 8}px`}
            gap={1.5}
            rounded="md"
            cursor="pointer"
            bg={isActive ? "bg.emphasized" : "transparent"}
            _hover={{ bg: isActive ? "bg.emphasized" : "bg.subtle" }}
            transition="background 0.1s"
            onClick={handleClick}
          >
            {entry.is_dir && (
              <Box color="fg.subtle" flexShrink={0}>
                {isExpanded ? (
                  <LuChevronDown size={12} />
                ) : (
                  <LuChevronRight size={12} />
                )}
              </Box>
            )}
            <Box color="fg.subtle" flexShrink={0}>
              {entry.is_dir ? (
                isExpanded ? (
                  <LuFolderOpen size={14} />
                ) : (
                  <LuFolder size={14} />
                )
              ) : (
                <LuFileText size={14} />
              )}
            </Box>
            <Text
              fontSize="xs"
              truncate
              color={isActive ? "fg" : "fg.subtle"}
              fontWeight={isActive ? "medium" : "normal"}
            >
              {entry.is_dir ? entry.name : entry.name.replace(".md", "")}
            </Text>
          </HStack>
        </Menu.ContextTrigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content>
              {menuItems.map((item) => (
                <Menu.Item
                  key={item.label}
                  value={item.label}
                  onSelect={item.action}
                  color={item.value === "delete" ? "fg.error" : undefined}
                  _hover={
                    item.value === "delete"
                      ? { bg: "bg.error", color: "fg.error" }
                      : undefined
                  }
                >
                  {item.label}
                </Menu.Item>
              ))}
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>

      {entry.is_dir && isExpanded && (
        <VStack align="stretch" gap={0}>
          {showChildInline && (
            <InlineInput
              type={inlineCreate.type}
              depth={depth + 1}
              onConfirm={(name) => {
                if (inlineCreate.type === "note")
                  handleCreateNote(entry.path, name);
                else handleCreateFolder(entry.path, name);
              }}
              onCancel={cancelInlineCreate}
            />
          )}
          {entry.children?.map((child) => (
            <FileTreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
            />
          ))}
        </VStack>
      )}
    </>
  );
}
