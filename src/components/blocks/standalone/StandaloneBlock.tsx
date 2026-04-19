import { useState, useCallback, useMemo, useEffect, useRef, memo } from "react";
import { Box, Text, Badge, HStack } from "@chakra-ui/react";
import { MergeView } from "@codemirror/merge";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { sql } from "@codemirror/lang-sql";
import { json } from "@codemirror/lang-json";
import { ExecutableBlockShell } from "../ExecutableBlockShell";
import { executeBlock } from "@/lib/tauri/commands";
import type { DisplayMode, ExecutionState } from "../ExecutableBlock";

interface StandaloneBlockProps {
  blockType: string;
  content: string;
  counterpartContent?: string;
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
      return { displayContent: data.query ?? raw, connectionId: data.connectionId };
    }
    if (blockType === "http") {
      if (typeof data === "string") return { displayContent: data };
      return { displayContent: data.body ?? raw, method: data.method, url: data.url };
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
    return { displayContent: raw };
  }
}

const readOnlyExt = EditorState.readOnly.of(true);
const cmTheme = EditorView.theme({
  "&": { fontSize: "12px", maxHeight: "250px" },
  ".cm-content": { fontFamily: "var(--chakra-fonts-mono)", padding: "8px" },
  ".cm-gutters": { display: "none" },
  ".cm-scroller": { overflow: "auto" },
  ".cm-mergeView": { overflow: "hidden", borderRadius: "6px" },
  ".cm-mergeViewEditors": { overflow: "hidden" },
  ".cm-mergeViewEditor": { overflow: "auto" },
  ".cm-changedLine": { backgroundColor: "rgba(234, 179, 8, 0.1) !important" },
  ".cm-changedText": { backgroundColor: "rgba(234, 179, 8, 0.25) !important" },
  ".cm-deletedChunk": { backgroundColor: "rgba(239, 68, 68, 0.1) !important" },
});

function langExtension(blockType: string): Extension[] {
  if (blockType === "db") return [sql()];
  if (blockType === "http") return [json()];
  return [];
}

/** Inline MergeView for showing diff within a block */
function BlockDiffInput({ thisContent, otherContent, blockType }: { thisContent: string; otherContent: string; blockType: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const langExt = useMemo(() => langExtension(blockType), [blockType]);

  useEffect(() => {
    if (!containerRef.current) return;
    const view = new MergeView({
      a: { doc: otherContent, extensions: [readOnlyExt, cmTheme, ...langExt] },
      b: { doc: thisContent, extensions: [readOnlyExt, cmTheme, ...langExt] },
      parent: containerRef.current,
      highlightChanges: true,
      gutter: false,
    });
    return () => view.destroy();
  }, [thisContent, otherContent]);

  return (
    <Box
      ref={containerRef}
      border="1px solid"
      borderColor="border"
      rounded="md"
      overflow="hidden"
      mx={3}
      my={2}
    />
  );
}

/** Simple read-only code display (when no diff) */
function BlockCodeInput({ content }: { content: string }) {
  return (
    <Box
      mx={3}
      my={2}
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
      {content}
    </Box>
  );
}

export const StandaloneBlock = memo(function StandaloneBlock({
  blockType,
  content,
  counterpartContent,
  alias,
}: StandaloneBlockProps) {
  const [displayMode, setDisplayMode] = useState<DisplayMode>("input");
  const [executionState, setExecutionState] = useState<ExecutionState>("idle");
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseBlockContent(blockType, content), [blockType, content]);
  const hasDiff = counterpartContent !== undefined && counterpartContent !== parsed.displayContent;

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
          <Box>
            {parsed.method && (
              <HStack gap={2} px={3} pt={2}>
                <Badge size="sm" colorPalette="blue">{parsed.method}</Badge>
                <Text fontSize="xs" fontFamily="mono" color="fg.muted" truncate>{parsed.url}</Text>
              </HStack>
            )}
            {hasDiff ? (
              <BlockDiffInput thisContent={parsed.displayContent} otherContent={counterpartContent!} blockType={blockType} />
            ) : (
              <BlockCodeInput content={parsed.displayContent} />
            )}
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
      return { query: data.query ?? content, connection_id: data.connectionId ?? "", page: 1, page_size: 100 };
    }
    if (blockType === "http") return data;
    if (blockType === "e2e") return data;
    return data;
  } catch {
    if (blockType === "db") {
      return { query: content, connection_id: "", page: 1, page_size: 100 };
    }
    return { raw: content };
  }
}
