import { HStack, Text, Badge, Kbd, Box } from "@chakra-ui/react";
import { usePaneContext } from "@/contexts/PaneContext";
import { useEditorSettings } from "@/contexts/EditorSettingsContext";
import { useConnectionStatus } from "@/hooks/useConnectionStatus";
import type { PaneLayout } from "@/types/pane";

export function StatusBar() {
  const { layout } = usePaneContext();
  const { vimEnabled, vimMode, toggleVim } = useEditorSettings();
  const { activeConnection } = useConnectionStatus();
  const paneCount = countLeaves(layout);

  return (
    <HStack
      h="24px"
      px={3}
      justify="space-between"
      bg="bg.muted"
      borderTopWidth="1px"
      borderColor="border"
      fontSize="xs"
      color="fg.subtle"
      userSelect="none"
    >
      <HStack gap={3}>
        <Badge
          size="xs"
          variant="subtle"
          cursor="pointer"
          onClick={toggleVim}
          colorPalette={vimEnabled ? "green" : "gray"}
        >
          {vimEnabled ? "VIM" : "VS Code"}
        </Badge>
        {vimEnabled && (
          <Badge
            size="xs"
            variant="outline"
            colorPalette={vimMode === "insert" ? "blue" : vimMode === "visual" ? "purple" : "gray"}
          >
            {vimMode.toUpperCase()}
          </Badge>
        )}
        <Text>default</Text>
        {paneCount > 1 && <Text>{paneCount} panes</Text>}
      </HStack>
      <HStack gap={3}>
        {activeConnection && (
          <HStack gap={1}>
            <Box
              w="6px"
              h="6px"
              rounded="full"
              bg={activeConnection.status === "connected" ? "green.500" : "red.500"}
            />
            <Text>{activeConnection.name}</Text>
          </HStack>
        )}
        <HStack gap={1}>
          <Kbd size="sm">⌘P</Kbd>
          <Text>buscar</Text>
        </HStack>
        <HStack gap={1}>
          <Kbd size="sm">⌘\</Kbd>
          <Text>split</Text>
        </HStack>
        <Text>UTF-8</Text>
        <Text>Ln 1, Col 1</Text>
      </HStack>
    </HStack>
  );
}

function countLeaves(node: PaneLayout): number {
  if (node.type === "leaf") return 1;
  return countLeaves(node.children[0]) + countLeaves(node.children[1]);
}
