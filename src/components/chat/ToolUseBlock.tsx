import { memo, useState } from "react";
import { Box, HStack, Text, IconButton } from "@chakra-ui/react";
import { LuChevronDown, LuChevronRight, LuWrench, LuLoader, LuCheck, LuX } from "react-icons/lu";
import type { ChatToolCall } from "@/lib/tauri/chat";
import type { ToolActivity } from "@/hooks/useChat";

interface ToolUseBlockProps {
  toolCall?: ChatToolCall;
  activity?: ToolActivity;
}

function formatInput(input: unknown): string {
  if (typeof input === "string") {
    try {
      return JSON.stringify(JSON.parse(input), null, 2);
    } catch {
      return input;
    }
  }
  return JSON.stringify(input, null, 2);
}

export const ToolUseBlock = memo(function ToolUseBlock({
  toolCall,
  activity,
}: ToolUseBlockProps) {
  const [expanded, setExpanded] = useState(false);

  const name = toolCall?.tool_name ?? activity?.name ?? "Unknown";
  const input = toolCall ? toolCall.input_json : activity ? activity.input : {};
  const result = toolCall?.result_json ?? activity?.result;
  const isError = toolCall?.is_error ?? activity?.isError ?? false;
  const isPending = activity?.pending ?? false;

  const statusColor = isPending
    ? "blue.400"
    : isError
      ? "red.400"
      : "green.400";

  const StatusIcon = isPending ? LuLoader : isError ? LuX : LuCheck;

  return (
    <Box
      border="1px solid"
      borderColor="border"
      rounded="md"
      overflow="hidden"
      my={1.5}
      fontSize="xs"
    >
      {/* Header */}
      <HStack
        px={2}
        py={1.5}
        bg="bg.subtle"
        cursor="pointer"
        onClick={() => setExpanded((prev) => !prev)}
        gap={1.5}
        _hover={{ bg: "bg.emphasized" }}
      >
        <Box color={statusColor} flexShrink={0}>
          <StatusIcon size={12} className={isPending ? "animate-spin" : undefined} />
        </Box>
        <LuWrench size={12} />
        <Text fontWeight="semibold" fontFamily="mono" flex={1}>
          {name}
        </Text>
        {expanded ? <LuChevronDown size={12} /> : <LuChevronRight size={12} />}
      </HStack>

      {/* Body */}
      {expanded && (
        <Box px={2} py={1.5} borderTop="1px solid" borderColor="border">
          {/* Input */}
          <Text fontSize="2xs" color="fg.muted" fontWeight="semibold" mb={0.5}>
            Input
          </Text>
          <Box
            as="pre"
            bg="bg.subtle"
            rounded="sm"
            px={2}
            py={1}
            fontSize="xs"
            fontFamily="mono"
            whiteSpace="pre-wrap"
            wordBreak="break-all"
            maxH="120px"
            overflowY="auto"
            mb={result ? 2 : 0}
          >
            {formatInput(input)}
          </Box>

          {/* Result */}
          {result && (
            <>
              <Text fontSize="2xs" color="fg.muted" fontWeight="semibold" mb={0.5}>
                Result
              </Text>
              <Box
                as="pre"
                bg={isError ? "red.500/5" : "bg.subtle"}
                border={isError ? "1px solid" : undefined}
                borderColor={isError ? "red.500/20" : undefined}
                rounded="sm"
                px={2}
                py={1}
                fontSize="xs"
                fontFamily="mono"
                whiteSpace="pre-wrap"
                wordBreak="break-all"
                maxH="200px"
                overflowY="auto"
                color={isError ? "red.400" : undefined}
              >
                {result.length > 2000 ? result.slice(0, 2000) + "\n... (truncated)" : result}
              </Box>
            </>
          )}

          {isPending && (
            <Text fontSize="2xs" color="blue.400" mt={1}>
              Executing...
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
});
