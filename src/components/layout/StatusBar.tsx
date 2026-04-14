import { HStack, Text, Badge } from "@chakra-ui/react";

export function StatusBar() {
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
        <Badge size="xs" variant="subtle">VS Code</Badge>
        <Text>default</Text>
      </HStack>
      <HStack gap={3}>
        <Text>UTF-8</Text>
        <Text>Ln 1, Col 1</Text>
      </HStack>
    </HStack>
  );
}
