import { memo, useState } from "react";
import { Box, HStack, Text } from "@chakra-ui/react";
import {
  LuChevronDown,
  LuChevronRight,
  LuLoader,
  LuCheck,
  LuX,
  LuFileText,
  LuSearch,
  LuTerminal,
  LuPencil,
  LuFolderSearch,
  LuGlobe,
  LuWrench,
} from "react-icons/lu";
import type { ChatToolCall } from "@/lib/tauri/chat";
import type { ToolActivity } from "@/hooks/useChat";

interface ToolUseBlockProps {
  toolCall?: ChatToolCall;
  activity?: ToolActivity;
}

/** Strip MCP prefix: "mcp__httui_notes__list_connections" → "list_connections" */
function shortName(name: string): string {
  const parts = name.split("__");
  return parts.length > 2 ? parts.slice(2).join("__") : name;
}

/** Pick an icon based on tool name */
function toolIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes("read") || n.includes("cat")) return LuFileText;
  if (n.includes("write") || n.includes("edit") || n.includes("create") || n.includes("update") || n.includes("delete")) return LuPencil;
  if (n.includes("grep") || n.includes("search")) return LuSearch;
  if (n.includes("glob") || n.includes("list")) return LuFolderSearch;
  if (n.includes("bash") || n.includes("exec")) return LuTerminal;
  if (n.includes("fetch") || n.includes("web")) return LuGlobe;
  return LuWrench;
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

/** Show the most relevant field inline */
function inlineSummary(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  if ("command" in obj) return String(obj.command);
  if ("file_path" in obj) return String(obj.file_path);
  if ("path" in obj && "pattern" in obj) return `${obj.pattern} in ${obj.path}`;
  if ("pattern" in obj) return String(obj.pattern);
  if ("path" in obj) return String(obj.path);
  if ("note_path" in obj) return String(obj.note_path);
  return null;
}

export const ToolUseBlock = memo(function ToolUseBlock({
  toolCall,
  activity,
}: ToolUseBlockProps) {
  const [expanded, setExpanded] = useState(false);

  const rawName = toolCall?.tool_name ?? activity?.name ?? "Unknown";
  const name = shortName(rawName);
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
  const ToolIcon = toolIcon(rawName);
  const summary = inlineSummary(input);

  return (
    <Box
      rounded="md"
      overflow="hidden"
      my={0.5}
      fontSize="xs"
    >
      {/* Header */}
      <HStack
        px={1.5}
        py={1}
        rounded="md"
        cursor="pointer"
        onClick={() => setExpanded((prev) => !prev)}
        gap={1}
        _hover={{ bg: "bg.subtle" }}
      >
        <Box color={statusColor} flexShrink={0}>
          <StatusIcon size={11} className={isPending ? "animate-spin" : undefined} />
        </Box>
        <Box color="fg.muted" flexShrink={0}>
          <ToolIcon size={11} />
        </Box>
        <Text fontWeight="medium" fontSize="2xs" flexShrink={0}>
          {name}
        </Text>
        {summary && (
          <Text fontSize="2xs" color="fg.muted" truncate flex={1}>
            {summary}
          </Text>
        )}
        <Box color="fg.muted" flexShrink={0}>
          {expanded ? <LuChevronDown size={10} /> : <LuChevronRight size={10} />}
        </Box>
      </HStack>

      {/* Body */}
      {expanded && (
        <Box px={2} py={1.5} ml={2} borderLeft="2px solid" borderColor="border">
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
            fontSize="2xs"
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
                fontSize="2xs"
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
