import { useCallback, useEffect, useRef } from "react";
import { Box, HStack, Text, Portal } from "@chakra-ui/react";
import { LuShield } from "react-icons/lu";
import { useChatContext } from "@/contexts/ChatContext";

function formatToolInput(input: Record<string, unknown>): string {
  // For common tools, show the most relevant field
  if ("command" in input) return String(input.command);
  if ("file_path" in input) return String(input.file_path);
  if ("pattern" in input) return `${input.pattern}${input.path ? ` in ${input.path}` : ""}`;
  return JSON.stringify(input, null, 2);
}

export function PermissionModal() {
  const { pendingPermission, respondPermission } = useChatContext();
  const denyRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (pendingPermission) {
      denyRef.current?.focus();
    }
  }, [pendingPermission]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!pendingPermission) return;
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        respondPermission(pendingPermission.permissionId, "allow");
      } else if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        respondPermission(pendingPermission.permissionId, "deny");
      }
    },
    [pendingPermission, respondPermission]
  );

  useEffect(() => {
    if (!pendingPermission) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pendingPermission, handleKeyDown]);

  if (!pendingPermission) return null;

  const { permissionId, toolName, toolInput } = pendingPermission;

  return (
    <Portal>
      <Box
        position="fixed"
        inset={0}
        bg="blackAlpha.600"
        zIndex={9999}
        display="flex"
        alignItems="center"
        justifyContent="center"
        onClick={() => respondPermission(permissionId, "deny")}
      >
        <Box
          bg="bg"
          border="1px solid"
          borderColor="border"
          rounded="lg"
          shadow="2xl"
          maxW="480px"
          w="90%"
          p={4}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          <HStack gap={2} mb={3}>
            <Box color="orange.400">
              <LuShield size={18} />
            </Box>
            <Text fontWeight="semibold" fontSize="sm">
              Claude wants to use: {toolName}
            </Text>
          </HStack>

          <Box
            bg="bg.subtle"
            border="1px solid"
            borderColor="border"
            rounded="md"
            px={3}
            py={2}
            mb={4}
            maxH="200px"
            overflowX="auto"
            overflowY="auto"
          >
            <Text
              fontFamily="mono"
              fontSize="xs"
              whiteSpace="pre"
            >
              {formatToolInput(toolInput)}
            </Text>
          </Box>

          <HStack justify="flex-end" gap={2}>
            <Text fontSize="2xs" color="fg.muted" mr="auto">
              Enter = Deny · Cmd+Enter = Allow
            </Text>
            <Box
              as="button"
              ref={denyRef}
              px={3}
              py={1.5}
              rounded="md"
              fontSize="sm"
              fontWeight="medium"
              bg="bg.subtle"
              border="1px solid"
              borderColor="border"
              cursor="pointer"
              _hover={{ bg: "bg.emphasized" }}
              _focus={{ outline: "2px solid", outlineColor: "blue.500", outlineOffset: "1px" }}
              onClick={() => respondPermission(permissionId, "deny")}
            >
              Deny
            </Box>
            <Box
              as="button"
              px={3}
              py={1.5}
              rounded="md"
              fontSize="sm"
              fontWeight="medium"
              bg="blue.500"
              color="white"
              cursor="pointer"
              _hover={{ bg: "blue.600" }}
              _focus={{ outline: "2px solid", outlineColor: "blue.500", outlineOffset: "1px" }}
              onClick={() => respondPermission(permissionId, "allow")}
            >
              Allow
            </Box>
          </HStack>
        </Box>
      </Box>
    </Portal>
  );
}
