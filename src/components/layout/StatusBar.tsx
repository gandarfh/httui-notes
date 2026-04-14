import { HStack, Text, Badge, Kbd } from "@chakra-ui/react";

interface StatusBarProps {
  paneCount?: number;
  vimEnabled?: boolean;
  vimMode?: string;
  onToggleVim?: () => void;
}

export function StatusBar({
  paneCount = 1,
  vimEnabled = false,
  vimMode = "normal",
  onToggleVim,
}: StatusBarProps) {
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
          onClick={onToggleVim}
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
