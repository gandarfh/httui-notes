import { useCallback, useEffect } from "react";
import { Box, HStack, Text } from "@chakra-ui/react";
import { LuShield, LuCheck, LuX } from "react-icons/lu";
import { useChatContext } from "@/contexts/ChatContext";

function formatToolInput(input: Record<string, unknown>): string {
  if ("command" in input) return String(input.command);
  if ("file_path" in input) return String(input.file_path);
  if ("pattern" in input) return `${input.pattern}${input.path ? ` in ${input.path}` : ""}`;
  return JSON.stringify(input, null, 2);
}

export function PermissionBanner() {
  const { pendingPermission, respondPermission } = useChatContext();

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
    [pendingPermission, respondPermission],
  );

  useEffect(() => {
    if (!pendingPermission) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pendingPermission, handleKeyDown]);

  if (!pendingPermission) return null;

  const { permissionId, toolName, toolInput } = pendingPermission;

  return (
    <Box
      borderTop="1px solid"
      borderColor="orange.500/30"
      bg="orange.500/5"
      px={3}
      py={2}
    >
      <HStack gap={2} mb={1.5}>
        <Box color="orange.400">
          <LuShield size={14} />
        </Box>
        <Text fontWeight="medium" fontSize="xs" flex={1}>
          {toolName}
        </Text>
        <HStack gap={1}>
          <Box
            as="button"
            display="flex"
            alignItems="center"
            gap={1}
            px={2}
            py={0.5}
            rounded="md"
            fontSize="xs"
            fontWeight="medium"
            bg="bg.subtle"
            border="1px solid"
            borderColor="border"
            cursor="pointer"
            _hover={{ bg: "bg.emphasized" }}
            onClick={() => respondPermission(permissionId, "deny")}
          >
            <LuX size={12} />
            Deny
          </Box>
          <Box
            as="button"
            display="flex"
            alignItems="center"
            gap={1}
            px={2}
            py={0.5}
            rounded="md"
            fontSize="xs"
            fontWeight="medium"
            bg="green.600"
            color="white"
            cursor="pointer"
            _hover={{ bg: "green.700" }}
            onClick={() => respondPermission(permissionId, "allow")}
          >
            <LuCheck size={12} />
            Allow
          </Box>
        </HStack>
      </HStack>

      <Box
        bg="bg.subtle"
        border="1px solid"
        borderColor="border"
        rounded="md"
        px={2}
        py={1.5}
        maxH="100px"
        overflowX="auto"
        overflowY="auto"
      >
        <Text fontFamily="mono" fontSize="2xs" whiteSpace="pre">
          {formatToolInput(toolInput)}
        </Text>
      </Box>

      <Text fontSize="2xs" color="fg.muted" mt={1}>
        Enter = Deny · Cmd+Enter = Allow
      </Text>
    </Box>
  );
}
