import { useCallback } from "react";
import { Box, Text, VStack } from "@chakra-ui/react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { FileTreeNode } from "./FileTreeNode";
import { InlineInput } from "./InlineInput";

export function FileTree() {
  const {
    entries,
    inlineCreate,
    handleCreateNote,
    handleCreateFolder,
    handleMoveFile,
    cancelInlineCreate,
  } = useWorkspace();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const sourcePath = active.data.current?.path as string | undefined;
      const targetDir = over.data.current?.dirPath as string | undefined;
      if (!sourcePath || targetDir === undefined) return;

      // Prevent dropping into self or descendant
      if (sourcePath === targetDir || targetDir.startsWith(sourcePath + "/")) return;

      handleMoveFile(sourcePath, targetDir);
    },
    [handleMoveFile],
  );

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
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <VStack align="stretch" gap={0} px={1}>
        {showRootInline && (
          <InlineInput
            type={inlineCreate.type}
            depth={0}
            onConfirm={(name) => {
              if (inlineCreate.type === "note") handleCreateNote("", name);
              else handleCreateFolder("", name);
            }}
            onCancel={cancelInlineCreate}
          />
        )}
        {entries.map((entry) => (
          <FileTreeNode key={entry.path} entry={entry} depth={0} />
        ))}
      </VStack>
    </DndContext>
  );
}
