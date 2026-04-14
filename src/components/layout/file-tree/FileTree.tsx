import { Box, Text, VStack } from "@chakra-ui/react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { FileTreeNode } from "./FileTreeNode";
import { InlineInput } from "./InlineInput";

export function FileTree() {
  const {
    entries,
    inlineCreate,
    handleCreateNote,
    handleCreateFolder,
    cancelInlineCreate,
  } = useWorkspace();

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
  );
}
