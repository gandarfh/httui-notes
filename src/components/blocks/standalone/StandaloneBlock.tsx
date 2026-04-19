import { useState, useCallback, memo } from "react";
import { Box, Text } from "@chakra-ui/react";
import { ExecutableBlockShell } from "../ExecutableBlockShell";
import { executeBlock } from "@/lib/tauri/commands";
import type { DisplayMode, ExecutionState } from "../ExecutableBlock";

interface StandaloneBlockProps {
  blockType: string;
  lang: string;
  content: string;
  alias?: string;
}

/**
 * A standalone executable block that works outside TipTap.
 * Used in the diff viewer to render fenced code blocks as executable widgets.
 * Read-only content, but can be executed for validation.
 */
export const StandaloneBlock = memo(function StandaloneBlock({
  blockType,
  lang,
  content,
  alias,
}: StandaloneBlockProps) {
  const [displayMode, setDisplayMode] = useState<DisplayMode>("input");
  const [executionState, setExecutionState] = useState<ExecutionState>("idle");
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = useCallback(async () => {
    setExecutionState("running");
    setError(null);
    try {
      const params = buildParams(blockType, lang, content);
      const result = await executeBlock(blockType, params);
      setResponse(JSON.stringify(result.data, null, 2));
      setExecutionState(result.status === "error" ? "error" : "success");
      setDisplayMode("split");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setExecutionState("error");
      setDisplayMode("split");
    }
  }, [blockType, lang, content]);

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
          <Box
            bg="bg.subtle"
            px={3}
            py={2}
            fontFamily="mono"
            fontSize="xs"
            whiteSpace="pre-wrap"
            overflowX="auto"
            maxH="300px"
            overflowY="auto"
          >
            {content}
          </Box>
        }
        outputSlot={
          error ? (
            <Box px={3} py={2}>
              <Text fontSize="xs" color="red.400">{error}</Text>
            </Box>
          ) : response ? (
            <Box
              bg="bg.subtle"
              px={3}
              py={2}
              fontFamily="mono"
              fontSize="xs"
              whiteSpace="pre-wrap"
              overflowX="auto"
              maxH="300px"
              overflowY="auto"
            >
              {response}
            </Box>
          ) : null
        }
      />
    </Box>
  );
});

/** Build execution params based on block type and language hint */
function buildParams(
  blockType: string,
  _lang: string,
  content: string,
): Record<string, unknown> {
  if (blockType === "db") {
    // lang might be "db-sqlite" or "db" — extract connection info if embedded
    // For standalone, use the first available connection
    return {
      query: content,
      connection_id: "",
      page: 1,
      page_size: 100,
    };
  }
  if (blockType === "http") {
    return { raw: content };
  }
  if (blockType === "e2e") {
    return { raw: content };
  }
  return { content };
}
