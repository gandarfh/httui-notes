import { Box, Text } from "@chakra-ui/react";
import type { TabState } from "@/types/pane";

interface DiffViewerProps {
  tab: TabState;
}

export function DiffViewer({ tab }: DiffViewerProps) {
  const fileName = tab.filePath.split("/").pop()?.replace(".md", "") ?? tab.filePath;

  return (
    <Box h="100%" display="flex" alignItems="center" justifyContent="center">
      <Text fontSize="sm" color="fg.muted">
        Diff: {fileName} (loading...)
      </Text>
    </Box>
  );
}
