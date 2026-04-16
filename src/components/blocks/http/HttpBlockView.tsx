import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/core";
import { Box, Flex, HStack, Badge, IconButton, Tabs } from "@chakra-ui/react";
import { NativeSelectRoot, NativeSelectField } from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuX, LuPlus, LuBraces } from "react-icons/lu";
import { common, createLowlight } from "lowlight";

const lowlight = createLowlight(common);
import { useColorMode } from "@/components/ui/color-mode";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import { ExecutableBlockShell } from "../ExecutableBlockShell";
import { useBlockContext } from "../BlockContext";
import type { DisplayMode, ExecutionState } from "../ExecutableBlock";
import type { HttpBlockData, KeyValue, HttpMethod, HttpResponse } from "./types";
import { DEFAULT_HTTP_DATA } from "./types";
import { executeBlock, getBlockResult, saveBlockResult } from "@/lib/tauri/commands";
import { hashBlockContent } from "@/lib/blocks/hash";
import { resolveAllReferences } from "@/lib/blocks/references";
import { collectBlocksAbove } from "@/lib/blocks/document";
import { referenceHighlight } from "@/lib/blocks/cm-references";
import { createReferenceAutocomplete } from "@/lib/blocks/cm-autocomplete";
import type { BlockContext } from "@/lib/blocks/references";

const cmTransparentBg = EditorView.theme({
  "&": { backgroundColor: "transparent !important" },
  "& .cm-gutters": { backgroundColor: "transparent !important", border: "none" },
  "& .cm-activeLineGutter, & .cm-activeLine": { backgroundColor: "transparent !important" },
});

const cmInlineTheme = EditorView.theme({
  "&": { backgroundColor: "transparent !important", fontSize: "12px" },
  "&.cm-focused": { outline: "none" },
  "& .cm-gutters": { display: "none" },
  "& .cm-activeLineGutter, & .cm-activeLine": { backgroundColor: "transparent !important" },
  "& .cm-scroller": { overflow: "auto hidden", scrollbarWidth: "none", lineHeight: "30px" },
  "& .cm-scroller::-webkit-scrollbar": { display: "none" },
  "& .cm-content": { padding: "0 10px", minHeight: "auto" },
  "& .cm-line": { padding: "0" },
  "& .cm-placeholder": { color: "var(--chakra-colors-fg-muted)", opacity: "0.5" },
  "& .cm-cursor": { borderLeftColor: "var(--chakra-colors-fg)" },
});

/**
 * Inline single-line CodeMirror with reference autocomplete + highlight.
 * Replaces <Input> for URL, header values, and param values.
 */
function InlineCM({
  value,
  onChange,
  placeholder,
  cmTheme,
  extensions: extraExtensions,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  cmTheme: "light" | "dark";
  extensions?: import("@codemirror/state").Extension[];
}) {
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={[
        cmInlineTheme,
        cmTransparentBg,
        ...referenceHighlight,
        ...(extraExtensions ?? []),
      ]}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        autocompletion: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        indentOnInput: false,
        bracketMatching: false,
        closeBrackets: false,
        history: true,
      }}
      theme={cmTheme}
      height="auto"
      placeholder={placeholder}
      style={{ fontFamily: "var(--chakra-fonts-mono)" }}
    />
  );
}

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const METHODS_WITH_BODY: HttpMethod[] = ["POST", "PUT", "PATCH"];

function parseBlockData(raw: string): HttpBlockData {
  if (!raw) return { ...DEFAULT_HTTP_DATA };
  try {
    return { ...DEFAULT_HTTP_DATA, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_HTTP_DATA };
  }
}

function serializeBlockData(data: HttpBlockData): string {
  return JSON.stringify(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hastToHtml(nodes: any[]): string {
  return nodes.map((node) => {
    if (node.type === "text") return escapeHtml(node.value);
    if (node.type === "element") {
      const cls = node.properties?.className?.join(" ") ?? "";
      const inner = hastToHtml(node.children ?? []);
      return cls ? `<span class="${cls}">${inner}</span>` : inner;
    }
    return "";
  }).join("");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatBody(raw: unknown): string {
  // Unwrap nested JSON strings (e.g. double-encoded)
  let value = raw;
  for (let i = 0; i < 3; i++) {
    if (typeof value !== "string") break;
    try {
      value = JSON.parse(value);
    } catch {
      break;
    }
  }
  // Now value is either a parsed object or a plain string
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function blockResultToResponse(result: { status_code: number; status_text: string; headers: Record<string, string>; body: unknown }, elapsedMs: number): HttpResponse {
  return {
    status: result.status_code,
    statusText: result.status_text,
    headers: result.headers,
    body: typeof result.body === "string" ? result.body : JSON.stringify(result.body),
    elapsedMs,
  };
}

// --- Sub-components ---

function KeyValueRow({
  item,
  keyPlaceholder,
  onChange,
  onRemove,
  isLast,
  cmTheme,
  cmExtensions,
}: {
  item: KeyValue;
  keyPlaceholder: string;
  onChange: (kv: KeyValue) => void;
  onRemove: () => void;
  isLast: boolean;
  cmTheme: "light" | "dark";
  cmExtensions?: import("@codemirror/state").Extension[];
}) {
  return (
    <Flex
      borderBottom={isLast ? undefined : "1px solid"}
      borderColor="border"
      align="center"
    >
      <Box flex={1} px={1}>
        <InlineCM
          value={item.key}
          onChange={(val) => onChange({ ...item, key: val })}
          placeholder={keyPlaceholder}
          cmTheme={cmTheme}
        />
      </Box>
      <Box borderLeft="1px solid" borderColor="border" alignSelf="stretch" />
      <Box flex={1} px={1}>
        <InlineCM
          value={item.value}
          onChange={(val) => onChange({ ...item, value: val })}
          placeholder="Value"
          cmTheme={cmTheme}
          extensions={cmExtensions}
        />
      </Box>
      <IconButton
        aria-label="Remove"
        size="2xs"
        variant="ghost"
        colorPalette="red"
        mx={1}
        onClick={onRemove}
      >
        <LuX />
      </IconButton>
    </Flex>
  );
}

function KeyValueList({
  addLabel,
  keyPlaceholder,
  items,
  onChange,
  cmTheme,
  cmExtensions,
}: {
  addLabel: string;
  keyPlaceholder: string;
  items: KeyValue[];
  onChange: (items: KeyValue[]) => void;
  cmTheme: "light" | "dark";
  cmExtensions?: import("@codemirror/state").Extension[];
}) {
  return (
    <Box
      border="1px solid"
      borderColor="border"
      rounded="md"
      overflow="hidden"
    >
      {items.map((item, i) => (
        <KeyValueRow
          key={i}
          item={item}
          keyPlaceholder={keyPlaceholder}
          isLast={i === items.length - 1}
          cmTheme={cmTheme}
          cmExtensions={cmExtensions}
          onChange={(updated) => {
            const next = [...items];
            next[i] = updated;
            onChange(next);
          }}
          onRemove={() => onChange(items.filter((_, idx) => idx !== i))}
        />
      ))}
      <Flex
        align="center"
        gap={1}
        px={2}
        py={1}
        cursor="pointer"
        color="fg.muted"
        fontSize="xs"
        _hover={{ bg: "bg.subtle" }}
        borderTop={items.length > 0 ? "1px solid" : undefined}
        borderColor="border"
        onClick={() => onChange([...items, { key: "", value: "" }])}
      >
        <LuPlus />
        {addLabel}
      </Flex>
    </Box>
  );
}

function HttpInput({
  data,
  onChange,
  cmTheme,
  blocksRef,
}: {
  data: HttpBlockData;
  onChange: (data: HttpBlockData) => void;
  cmTheme: "light" | "dark";
  blocksRef: React.RefObject<BlockContext[]>;
}) {
  const showBody = METHODS_WITH_BODY.includes(data.method);

  const refAutocomplete = useMemo(
    () => createReferenceAutocomplete(() => blocksRef.current ?? []),
    [blocksRef],
  );

  const jsonError = useMemo(() => {
    if (!showBody || !data.body.trim()) return null;
    try {
      JSON.parse(data.body);
      return null;
    } catch (e) {
      return (e as SyntaxError).message;
    }
  }, [showBody, data.body]);

  return (
    <Box p={2} display="flex" flexDirection="column" gap={1.5}>
      {/* Method + URL */}
      <Flex gap={1} align="center">
        <NativeSelectRoot size="xs" width="auto" flexShrink={0} h="32px">
          <NativeSelectField
            value={data.method}
            onChange={(e) =>
              onChange({ ...data, method: e.target.value as HttpMethod })
            }
            fontFamily="mono"
            fontSize="xs"
            fontWeight="bold"
            h="32px"
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </NativeSelectField>
        </NativeSelectRoot>
        <Box flex={1} minW="0" h="32px" border="1px solid" borderColor="border" rounded="sm" overflow="hidden">
          <InlineCM
            value={data.url}
            onChange={(val) => onChange({ ...data, url: val })}
            placeholder="https://api.example.com/endpoint"
            cmTheme={cmTheme}
            extensions={[refAutocomplete]}
          />
        </Box>
      </Flex>

      {/* Tabs: Params / Headers / Body */}
      <Tabs.Root defaultValue="params" size="sm" variant="line">
        <Tabs.List>
          <Tabs.Trigger value="params" fontSize="xs">
            Params
            {data.params.length > 0 && (
              <Badge size="sm" variant="subtle" colorPalette="gray" fontFamily="mono" ml={1}>
                {data.params.length}
              </Badge>
            )}
          </Tabs.Trigger>
          <Tabs.Trigger value="headers" fontSize="xs">
            Headers
            {data.headers.length > 0 && (
              <Badge size="sm" variant="subtle" colorPalette="gray" fontFamily="mono" ml={1}>
                {data.headers.length}
              </Badge>
            )}
          </Tabs.Trigger>
          {showBody && (
            <Tabs.Trigger value="body" fontSize="xs">
              Body
              {jsonError && (
                <Badge size="sm" variant="subtle" colorPalette="red" fontFamily="mono" ml={1}>
                  !
                </Badge>
              )}
            </Tabs.Trigger>
          )}
        </Tabs.List>

        <Tabs.Content value="params" p={0} pt={2}>
          <KeyValueList
            addLabel="Add param"
            keyPlaceholder="Param name"
            items={data.params}
            onChange={(params) => onChange({ ...data, params })}
            cmTheme={cmTheme}
            cmExtensions={[refAutocomplete]}
          />
        </Tabs.Content>

        <Tabs.Content value="headers" p={0} pt={2}>
          <KeyValueList
            addLabel="Add header"
            keyPlaceholder="Header name"
            items={data.headers}
            onChange={(headers) => onChange({ ...data, headers })}
            cmTheme={cmTheme}
            cmExtensions={[refAutocomplete]}
          />
        </Tabs.Content>

        {showBody && (
          <Tabs.Content value="body" p={0} pt={2}>
            <Box
              position="relative"
              border="1px solid"
              borderColor="border"
              rounded="md"
              overflow="hidden"
              bg="bg.subtle"
            >
              <CodeMirror
                value={data.body}
                onChange={(val) => onChange({ ...data, body: val })}
                extensions={[json(), EditorView.lineWrapping, cmTransparentBg, ...referenceHighlight, refAutocomplete]}
                basicSetup={{ lineNumbers: false, foldGutter: false, autocompletion: false }}
                theme={cmTheme}
                height="80px"
                style={{ fontSize: "12px" }}
              />
              <IconButton
                aria-label="Format JSON"
                size="2xs"
                variant="ghost"
                colorPalette="gray"
                position="absolute"
                top={1}
                right={1}
                opacity={0.5}
                _hover={{ opacity: 1 }}
                onClick={() => {
                  try {
                    const formatted = JSON.stringify(JSON.parse(data.body), null, 2);
                    onChange({ ...data, body: formatted });
                  } catch {
                    // not valid JSON, ignore
                  }
                }}
              >
                <LuBraces />
              </IconButton>
            </Box>
            {jsonError && (
              <Box
                mt={1}
                px={2}
                py={1}
                fontSize="xs"
                fontFamily="mono"
                color="red.400"
                bg="red.500/10"
                rounded="md"
              >
                {jsonError}
              </Box>
            )}
          </Tabs.Content>
        )}
      </Tabs.Root>
    </Box>
  );
}

function HttpOutput({ response, error }: { response: HttpResponse | null; error: string | null }) {
  if (error) {
    return (
      <Box p={3} color="red.500" fontSize="sm" fontFamily="mono">
        {error}
      </Box>
    );
  }
  if (!response) return null;

  return (
    <Box p={2} display="flex" flexDirection="column" gap={1}>
      <HStack gap={2}>
        <Badge
          colorPalette={response.status < 400 ? "green" : "red"}
          variant="subtle"
          fontFamily="mono"
          size="sm"
        >
          {response.status} {response.statusText}
        </Badge>
        <Box color="fg.muted" fontSize="xs" fontFamily="mono">
          {response.elapsedMs}ms
        </Box>
      </HStack>
      <Box
        as="pre"
        border="1px solid"
        borderColor="border"
        rounded="md"
        bg="bg.subtle"
        p={3}
        overflow="auto"
        fontSize="12px"
        fontFamily="mono"
        whiteSpace="pre-wrap"
        wordBreak="break-word"
        lineHeight="1.5"
        maxH="400px"
        m={0}
        userSelect="text"
        cursor="text"
        tabIndex={0}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onCopy={(e) => e.stopPropagation()}
        css={{
          "& .hljs-attr": { color: "var(--chakra-colors-blue-400)" },
          "& .hljs-string": { color: "var(--chakra-colors-green-400)" },
          "& .hljs-number": { color: "var(--chakra-colors-orange-400)" },
          "& .hljs-literal": { color: "var(--chakra-colors-purple-400)" },
          "& .hljs-punctuation": { color: "var(--chakra-colors-fg-subtle)" },
        }}
        dangerouslySetInnerHTML={{
          __html: hastToHtml(lowlight.highlight("json", formatBody(response.body)).children),
        }}
      />
    </Box>
  );
}

// --- Main view ---

export function HttpBlockView({ node, editor, getPos, updateAttributes, selected }: NodeViewProps) {
  const { colorMode } = useColorMode();
  const { filePath } = useBlockContext();
  const cmTheme = colorMode === "dark" ? "dark" : "light";
  const alias = (node.attrs.alias as string) ?? "";
  const displayMode = (node.attrs.displayMode as DisplayMode) ?? "input";
  const executionState = (node.attrs.executionState as ExecutionState) ?? "idle";
  const rawContent = (node.attrs.content as string) ?? "";

  const [response, setResponse] = useState<HttpResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const lastHashRef = useRef<string>("");
  const blocksRef = useRef<BlockContext[]>([]);

  // Keep blocksRef updated for autocomplete
  useEffect(() => {
    if (!filePath || !editor) return;
    let cancelled = false;
    const currentPos = (typeof getPos === "function" ? getPos() : 0) ?? 0;

    collectBlocksAbove(editor, currentPos, filePath).then((blocks) => {
      if (!cancelled) blocksRef.current = blocks;
    });

    return () => { cancelled = true; };
  }, [filePath, editor, getPos]);

  // Local state for responsive editing — debounce sync to TipTap
  const [data, setData] = useState(() => parseBlockData(rawContent));
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDataChange = useCallback(
    (updated: HttpBlockData) => {
      setData(updated);
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => {
        updateAttributes({ content: serializeBlockData(updated) });
      }, 300);
    },
    [updateAttributes],
  );

  // Load cached result on mount and when content changes
  useEffect(() => {
    if (!filePath || !rawContent) return;
    let cancelled = false;

    (async () => {
      const hash = await hashBlockContent(rawContent);
      lastHashRef.current = hash;

      try {
        const cached = await getBlockResult(filePath, hash);
        if (cancelled) return;
        if (cached) {
          const parsed = JSON.parse(cached.response);
          setResponse(blockResultToResponse(parsed, cached.elapsed_ms));
          setError(null);
          updateAttributes({ executionState: "cached", displayMode: "split" });
        } else if (executionState === "cached") {
          // Hash changed, invalidate
          setResponse(null);
          updateAttributes({ executionState: "idle" });
        }
      } catch {
        // Cache lookup failed, ignore
      }
    })();

    return () => { cancelled = true; };
  }, [filePath, rawContent]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRun = useCallback(async () => {
    setError(null);
    setResponse(null);
    updateAttributes({ executionState: "running" });

    let cancelled = false;
    cancelRef.current = () => {
      cancelled = true;
    };

    try {
      // Resolve {{...}} references before execution
      const currentPos = (typeof getPos === "function" ? getPos() : 0) ?? 0;
      const blocks = filePath
        ? await collectBlocksAbove(editor, currentPos, filePath)
        : [];

      const resolvedData = { ...data };
      const allErrors: string[] = [];

      // Resolve URL
      const urlResult = resolveAllReferences(data.url, blocks, currentPos);
      resolvedData.url = urlResult.resolved;
      allErrors.push(...urlResult.errors.map((e) => `URL: ${e.message}`));

      // Resolve header values
      resolvedData.headers = data.headers.map((h) => {
        const r = resolveAllReferences(h.value, blocks, currentPos);
        allErrors.push(...r.errors.map((e) => `Header "${h.key}": ${e.message}`));
        return { ...h, value: r.resolved };
      });

      // Resolve body
      if (data.body) {
        const bodyResult = resolveAllReferences(data.body, blocks, currentPos);
        resolvedData.body = bodyResult.resolved;
        allErrors.push(...bodyResult.errors.map((e) => `Body: ${e.message}`));
      }

      if (allErrors.length > 0) {
        setError(`Reference errors:\n${allErrors.join("\n")}`);
        updateAttributes({ executionState: "error" });
        return;
      }

      const result = await executeBlock("http", resolvedData);
      if (cancelled) return;

      const resultData = result.data as {
        status_code: number;
        status_text: string;
        headers: Record<string, string>;
        body: string;
      };
      const res = blockResultToResponse(resultData, result.duration_ms);
      setResponse(res);
      updateAttributes({
        executionState: result.status === "success" ? "success" : "error",
        displayMode: "split",
      });

      // Save to cache
      if (filePath) {
        const hash = await hashBlockContent(rawContent);
        lastHashRef.current = hash;
        await saveBlockResult(
          filePath,
          hash,
          result.status,
          JSON.stringify(resultData),
          result.duration_ms,
        );
      }
    } catch (err) {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : String(err));
      updateAttributes({ executionState: "error" });
    }
  }, [data, rawContent, filePath, editor, getPos, updateAttributes]);

  const handleCancel = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
    updateAttributes({ executionState: "idle" });
  }, [updateAttributes]);

  return (
    <NodeViewWrapper data-type="http-block">
      <ExecutableBlockShell
        blockType="http"
        alias={alias}
        displayMode={displayMode}
        executionState={executionState}
        onAliasChange={(a) => updateAttributes({ alias: a })}
        onDisplayModeChange={(m) => updateAttributes({ displayMode: m })}
        onRun={handleRun}
        onCancel={handleCancel}
        selected={selected}
        inputSlot={<HttpInput data={data} onChange={handleDataChange} cmTheme={cmTheme} blocksRef={blocksRef} />}
        outputSlot={<HttpOutput response={response} error={error} />}
      />
    </NodeViewWrapper>
  );
}
