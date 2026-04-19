import { useState, useCallback, useMemo, memo } from "react";
import { Box, Text, Badge, HStack } from "@chakra-ui/react";
import { ExecutableBlockShell } from "../ExecutableBlockShell";
import { executeBlock } from "@/lib/tauri/commands";
import type { DisplayMode, ExecutionState } from "../ExecutableBlock";

interface StandaloneBlockProps {
  blockType: string;
  lang: string;
  content: string;
  alias?: string;
}

interface ParsedBlock {
  displayContent: string;
  connectionId?: string;
  method?: string;
  url?: string;
}

/** Parse the JSON-serialized block content into human-readable form */
function parseBlockContent(blockType: string, raw: string): ParsedBlock {
  try {
    const data = JSON.parse(raw);

    if (blockType === "db") {
      return {
        displayContent: data.query ?? raw,
        connectionId: data.connectionId,
      };
    }

    if (blockType === "http") {
      // HTTP content might be raw text (method + URL + headers) or JSON
      if (typeof data === "string") return { displayContent: data };
      return {
        displayContent: data.body ?? raw,
        method: data.method,
        url: data.url,
      };
    }

    if (blockType === "e2e") {
      return {
        displayContent: data.baseUrl
          ? `Base URL: ${data.baseUrl}\nSteps: ${data.steps?.length ?? 0}`
          : JSON.stringify(data, null, 2),
      };
    }

    return { displayContent: JSON.stringify(data, null, 2) };
  } catch {
    // Not JSON — content is raw text (e.g. plain SQL query)
    return { displayContent: raw };
  }
}

/**
 * A standalone executable block that works outside TipTap.
 * Used in the diff viewer to render fenced code blocks as executable widgets.
 * Read-only content, but can be executed for validation.
 */
export const StandaloneBlock = memo(function StandaloneBlock({
  blockType,
  content,
  alias,
}: StandaloneBlockProps) {
  const [displayMode, setDisplayMode] = useState<DisplayMode>("input");
  const [executionState, setExecutionState] = useState<ExecutionState>("idle");
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseBlockContent(blockType, content), [blockType, content]);

  const handleRun = useCallback(async () => {
    setExecutionState("running");
    setError(null);
    try {
      const params = buildParams(blockType, content);
      const result = await executeBlock(blockType, params);
      setResponse(JSON.stringify(result.data, null, 2));
      setExecutionState(result.status === "error" ? "error" : "success");
      setDisplayMode("split");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setExecutionState("error");
      setDisplayMode("split");
    }
  }, [blockType, content]);

  const handleCancel = useCallback(() => {
    setExecutionState("idle");
  }, []);

  return (
    <Box my={1} mx={1}>
      <ExecutableBlockShell
        blockType={blockType}
        alias={alias ?? ""}
        displayMode={displayMode}
        executionState={executionState}
        onAliasChange={() => {}}
        onDisplayModeChange={setDisplayMode}
        onRun={handleRun}
        onCancel={handleCancel}
        inputSlot={
          <Box px={3} py={2}>
            {/* Method/URL for HTTP blocks */}
            {parsed.method && (
              <HStack gap={2} mb={2}>
                <Badge size="sm" colorPalette="blue">{parsed.method}</Badge>
                <Text fontSize="xs" fontFamily="mono" color="fg.muted" truncate>{parsed.url}</Text>
              </HStack>
            )}
            {/* Query/content */}
            <Box
              bg="bg.subtle"
              border="1px solid"
              borderColor="border"
              rounded="md"
              px={3}
              py={2}
              fontFamily="mono"
              fontSize="xs"
              whiteSpace="pre-wrap"
              overflowX="auto"
              maxH="200px"
              overflowY="auto"
              lineHeight="1.6"
            >
              {parsed.displayContent}
            </Box>
          </Box>
        }
        outputSlot={
          error ? (
            <Box px={3} py={2}>
              <Text fontSize="xs" color="red.400">{error}</Text>
            </Box>
          ) : response ? (
            <Box px={3} py={2}>
              <Box
                bg="bg.subtle"
                border="1px solid"
                borderColor="border"
                rounded="md"
                px={3}
                py={2}
                fontFamily="mono"
                fontSize="xs"
                whiteSpace="pre-wrap"
                overflowX="auto"
                maxH="200px"
                overflowY="auto"
              >
                {response}
              </Box>
            </Box>
          ) : null
        }
      />
    </Box>
  );
});

/** Build execution params based on block type */
function buildParams(blockType: string, content: string): Record<string, unknown> {
  try {
    const data = JSON.parse(content);
    if (blockType === "db") {
      return {
        query: data.query ?? content,
        connection_id: data.connectionId ?? "",
        page: 1,
        page_size: 100,
      };
    }
    if (blockType === "http") {
      return data;
    }
    if (blockType === "e2e") {
      return data;
    }
    return data;
  } catch {
    // Raw text content
    if (blockType === "db") {
      return { query: content, connection_id: "", page: 1, page_size: 100 };
    }
    return { raw: content };
  }
}
