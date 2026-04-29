import { HStack, Text, Button, Box } from "@chakra-ui/react";
import { LuTriangleAlert } from "react-icons/lu";

interface ConflictBannerProps {
  filePath: string;
  onReload: () => void;
  onKeep: () => void;
}

export function ConflictBanner({ filePath, onReload, onKeep }: ConflictBannerProps) {
  const fileName = filePath.includes("/")
    ? filePath.substring(filePath.lastIndexOf("/") + 1)
    : filePath;

  return (
    <Box
      bg="orange.subtle"
      borderBottom="1px solid"
      borderColor="orange.emphasized"
      px={3}
      py={1.5}
    >
      <HStack justify="space-between">
        <HStack gap={2}>
          <LuTriangleAlert size={14} />
          <Text fontSize="xs" fontWeight="medium">
            {fileName} was modified externally
          </Text>
        </HStack>
        <HStack gap={1}>
          <Button size="xs" variant="subtle" colorPalette="orange" onClick={onReload}>
            Reload
          </Button>
          <Button size="xs" variant="ghost" onClick={onKeep}>
            Keep Mine
          </Button>
        </HStack>
      </HStack>
    </Box>
  );
}
