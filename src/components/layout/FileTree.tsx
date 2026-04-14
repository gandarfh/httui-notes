import { useState, useCallback, useRef, useEffect } from "react";
import { Box, Text, HStack, VStack, Menu, Portal, Input } from "@chakra-ui/react";
import type { FileEntry } from "@/lib/tauri/commands";
import {
  LuFolder,
  LuFolderOpen,
  LuFileText,
  LuChevronRight,
  LuChevronDown,
} from "react-icons/lu";

export interface InlineCreate {
  type: "note" | "folder";
  dirPath: string;
}

interface FileTreeProps {
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
}

export function FileTree({
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
}: FileTreeProps) {
  // Show inline input at root level
  const showRootInline = inlineCreate && inlineCreate.dirPath === "";

  if (entries.length === 0 && !showRootInline) {
    return (
      <Box px={3} py={8} textAlign="center">
        <Text fontSize="sm" color="fg.muted">
          Empty vault
        </Text>
      </Box>
    );
  }

  return (
    <VStack align="stretch" gap={0} px={1}>
      {showRootInline && (
        <InlineInput
          type={inlineCreate.type}
          depth={0}
          onConfirm={(name) => {
            if (inlineCreate.type === "note") onCreateNote("", name);
            else onCreateFolder("", name);
          }}
          onCancel={onCancelInline}
        />
      )}
      {entries.map((entry) => (
        <FileTreeNode
          key={entry.path}
          entry={entry}
          activeFile={activeFile}
          inlineCreate={inlineCreate}
          onStartCreate={onStartCreate}
          onFileSelect={onFileSelect}
          onCreateNote={onCreateNote}
          onCreateFolder={onCreateFolder}
          onRename={onRename}
          onDelete={onDelete}
          onCancelInline={onCancelInline}
          depth={0}
        />
      ))}
    </VStack>
  );
}

interface FileTreeNodeProps {
  entry: FileEntry;
  activeFile: string | null;
  inlineCreate: InlineCreate | null;
  onStartCreate: (type: "note" | "folder", dirPath: string) => void;
  onFileSelect: (path: string) => void;
  onCreateNote: (dirPath: string, name: string) => void;
  onCreateFolder: (dirPath: string, name: string) => void;
  onRename: (path: string, newName: string) => void;
  onDelete: (path: string) => void;
  onCancelInline: () => void;
  depth: number;
}

function FileTreeNode({
  entry,
  activeFile,
  inlineCreate,
  onStartCreate,
  onFileSelect,
  onCreateNote,
  onCreateFolder,
  onRename,
  onDelete,
  onCancelInline,
  depth,
}: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(depth === 0);
  const [renaming, setRenaming] = useState(false);
  const isActive = !entry.is_dir && entry.path === activeFile;

  // Show inline create inside this folder
  const showChildInline =
    inlineCreate &&
    entry.is_dir &&
    inlineCreate.dirPath === entry.path;

  // Auto-expand when creating inside this folder
  const isExpanded = expanded || !!showChildInline;

  const handleClick = useCallback(() => {
    if (entry.is_dir) {
      setExpanded((prev) => !prev);
    } else {
      onFileSelect(entry.path);
    }
  }, [entry, onFileSelect]);

  if (renaming) {
    return (
      <InlineInput
        type={entry.is_dir ? "folder" : "note"}
        depth={depth}
        defaultValue={entry.name}
        onConfirm={(newName) => {
          onRename(entry.path, newName);
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
          action: () => onStartCreate("note", entry.path),
        },
        {
          label: "Nova pasta",
          action: () => onStartCreate("folder", entry.path),
        },
        { label: "Renomear", action: () => setRenaming(true) },
        {
          label: "Excluir",
          value: "delete",
          action: () => onDelete(entry.path),
        },
      ]
    : [
        { label: "Renomear", action: () => setRenaming(true) },
        {
          label: "Excluir",
          value: "delete",
          action: () => onDelete(entry.path),
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
                  onCreateNote(entry.path, name);
                else onCreateFolder(entry.path, name);
              }}
              onCancel={onCancelInline}
            />
          )}
          {entry.children?.map((child) => (
            <FileTreeNode
              key={child.path}
              entry={child}
              activeFile={activeFile}
              inlineCreate={inlineCreate}
              onStartCreate={onStartCreate}
              onFileSelect={onFileSelect}
              onCreateNote={onCreateNote}
              onCreateFolder={onCreateFolder}
              onRename={onRename}
              onDelete={onDelete}
              onCancelInline={onCancelInline}
              depth={depth + 1}
            />
          ))}
        </VStack>
      )}
    </>
  );
}

// --- Inline Input (VS Code-style) ---

function InlineInput({
  type,
  depth,
  defaultValue,
  onConfirm,
  onCancel,
}: {
  type: "note" | "folder";
  depth: number;
  defaultValue?: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);

  useEffect(() => {
    // Delay focus to let Chakra Menu finish closing and releasing focus
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      mounted.current = true;
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <HStack
      px={2}
      py={0.5}
      pl={`${depth * 16 + 8}px`}
      gap={1.5}
    >
      <Box color="fg.subtle" flexShrink={0}>
        {type === "folder" ? <LuFolder size={14} /> : <LuFileText size={14} />}
      </Box>
      <Input
        ref={inputRef}
        size="xs"
        variant="flushed"
        fontSize="xs"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const trimmed = value.trim();
            if (trimmed) onConfirm(trimmed);
            else onCancel();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={() => {
          if (!mounted.current) return;
          const trimmed = value.trim();
          if (trimmed) onConfirm(trimmed);
          else onCancel();
        }}
        placeholder={type === "folder" ? "nome-da-pasta" : "nome-da-nota"}
      />
    </HStack>
  );
}
