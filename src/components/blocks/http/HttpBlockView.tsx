import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/core";
import { Box, Flex, HStack, Input, Badge, IconButton, Tabs } from "@chakra-ui/react";
import { NativeSelectRoot, NativeSelectField } from "@chakra-ui/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { LuX, LuPlus, LuBraces } from "react-icons/lu";
import { useColorMode } from "@/components/ui/color-mode";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import { ExecutableBlockShell } from "../ExecutableBlockShell";
import type { DisplayMode, ExecutionState } from "../ExecutableBlock";
import type { HttpBlockData, KeyValue, HttpMethod, HttpResponse } from "./types";
import { DEFAULT_HTTP_DATA } from "./types";

const cmTransparentBg = EditorView.theme({
  "&": { backgroundColor: "transparent" },
  "& .cm-gutters": { backgroundColor: "transparent", border: "none" },
  "& .cm-activeLineGutter, & .cm-activeLine": { backgroundColor: "transparent" },
});

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

// --- Mock execution ---
async function mockExecute(data: HttpBlockData): Promise<HttpResponse> {
  if (!data.url.trim()) {
    throw new Error("URL is required");
  }
  await new Promise((r) => setTimeout(r, 800));
  return {
    status: 200,
    statusText: "OK",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(
      {
        message: "Hello from mock",
        method: data.method,
        url: data.url,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
    elapsedMs: 800,
  };
}

// --- Sub-components ---

function KeyValueRow({
  item,
  keyPlaceholder,
  onChange,
  onRemove,
  isLast,
}: {
  item: KeyValue;
  keyPlaceholder: string;
  onChange: (kv: KeyValue) => void;
  onRemove: () => void;
  isLast: boolean;
}) {
  return (
    <Flex
      borderBottom={isLast ? undefined : "1px solid"}
      borderColor="border"
    >
      <Input
        size="xs"
        variant="flushed"
        placeholder={keyPlaceholder}
        value={item.key}
        onChange={(e) => onChange({ ...item, key: e.target.value })}
        fontFamily="mono"
        fontSize="xs"
        flex={1}
        px={2}
        py={1.5}
        borderRadius={0}
        color="fg"
      />
      <Box borderLeft="1px solid" borderColor="border" />
      <Input
        size="xs"
        variant="flushed"
        placeholder="Value"
        value={item.value}
        onChange={(e) => onChange({ ...item, value: e.target.value })}
        fontFamily="mono"
        fontSize="xs"
        flex={1}
        px={2}
        py={1.5}
        borderRadius={0}
        color="fg.muted"
      />
      <IconButton
        aria-label="Remove"
        size="2xs"
        variant="ghost"
        colorPalette="red"
        alignSelf="center"
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
}: {
  addLabel: string;
  keyPlaceholder: string;
  items: KeyValue[];
  onChange: (items: KeyValue[]) => void;
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
}: {
  data: HttpBlockData;
  onChange: (data: HttpBlockData) => void;
  cmTheme: "light" | "dark";
}) {
  const showBody = METHODS_WITH_BODY.includes(data.method);

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
    <Box p={2} display="flex" flexDirection="column" gap={2}>
      {/* Method + URL */}
      <HStack gap={1}>
        <NativeSelectRoot size="xs" width="auto">
          <NativeSelectField
            value={data.method}
            onChange={(e) =>
              onChange({ ...data, method: e.target.value as HttpMethod })
            }
            fontFamily="mono"
            fontSize="xs"
            fontWeight="bold"
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </NativeSelectField>
        </NativeSelectRoot>
        <Input
          size="xs"
          placeholder="https://api.example.com/endpoint"
          value={data.url}
          onChange={(e) => onChange({ ...data, url: e.target.value })}
          fontFamily="mono"
          fontSize="xs"
          flex={1}
        />
      </HStack>

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
          />
        </Tabs.Content>

        <Tabs.Content value="headers" p={0} pt={2}>
          <KeyValueList
            addLabel="Add header"
            keyPlaceholder="Header name"
            items={data.headers}
            onChange={(headers) => onChange({ ...data, headers })}
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
                extensions={[json(), EditorView.lineWrapping, cmTransparentBg]}
                basicSetup={{ lineNumbers: false, foldGutter: false }}
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

function HttpOutput({ response, error, cmTheme }: { response: HttpResponse | null; error: string | null; cmTheme: "light" | "dark" }) {
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
        border="1px solid"
        borderColor="border"
        rounded="md"
        overflow="hidden"
        bg="bg.subtle"
      >
        <CodeMirror
          value={response.body}
          extensions={[json(), EditorView.lineWrapping, cmTransparentBg]}
          basicSetup={{ lineNumbers: false, foldGutter: false }}
          theme={cmTheme}
          height="auto"
          readOnly
          editable={false}
          style={{ fontSize: "12px" }}
        />
      </Box>
    </Box>
  );
}

// --- Main view ---

export function HttpBlockView({ node, updateAttributes, selected }: NodeViewProps) {
  const { colorMode } = useColorMode();
  const cmTheme = colorMode === "dark" ? "dark" : "light";
  const alias = (node.attrs.alias as string) ?? "";
  const displayMode = (node.attrs.displayMode as DisplayMode) ?? "input";
  const executionState = (node.attrs.executionState as ExecutionState) ?? "idle";
  const rawContent = (node.attrs.content as string) ?? "";

  const [response, setResponse] = useState<HttpResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  const data = parseBlockData(rawContent);

  const handleDataChange = useCallback(
    (updated: HttpBlockData) => {
      updateAttributes({ content: serializeBlockData(updated) });
    },
    [updateAttributes],
  );

  const handleRun = useCallback(async () => {
    setError(null);
    setResponse(null);
    updateAttributes({ executionState: "running" });

    let cancelled = false;
    cancelRef.current = () => {
      cancelled = true;
    };

    try {
      const res = await mockExecute(data);
      if (cancelled) return;
      setResponse(res);
      updateAttributes({
        executionState: "success",
        displayMode: "split",
      });
    } catch (err) {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : String(err));
      updateAttributes({ executionState: "error" });
    }
  }, [data, updateAttributes]);

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
        inputSlot={<HttpInput data={data} onChange={handleDataChange} cmTheme={cmTheme} />}
        outputSlot={<HttpOutput response={response} error={error} cmTheme={cmTheme} />}
      />
    </NodeViewWrapper>
  );
}
