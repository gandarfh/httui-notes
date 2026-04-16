import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/core";
import { Box, Flex, HStack, Text, Badge, IconButton, Input, Tabs } from "@chakra-ui/react";
import { NativeSelectRoot, NativeSelectField } from "@chakra-ui/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LuX,
  LuPlus,
  LuChevronDown,
  LuChevronRight,
  LuCheck,
  LuCircleX,
  LuArrowUp,
  LuArrowDown,
} from "react-icons/lu";
import { common, createLowlight } from "lowlight";

const lowlight = createLowlight(common);
import { useColorMode } from "@/components/ui/color-mode";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import { ExecutableBlockShell } from "../ExecutableBlockShell";
import { useBlockContext } from "../BlockContext";
import type { DisplayMode, ExecutionState } from "../ExecutableBlock";
import type { E2eBlockData, E2eStep, E2eStepResult, E2eResult } from "./types";
import { DEFAULT_E2E_DATA, DEFAULT_STEP } from "./types";
import type { HttpMethod } from "../http/types";
import { executeBlock, getBlockResult, saveBlockResult } from "@/lib/tauri/commands";
import { hashBlockContent } from "@/lib/blocks/hash";
import { resolveAllReferences, type BlockContext } from "@/lib/blocks/references";
import { collectBlocksAbove } from "@/lib/blocks/document";
import { resolveAndExecuteDependencies } from "@/lib/blocks/dependencies";
import { referenceHighlight, createReferenceTooltip } from "@/lib/blocks/cm-references";
import { createReferenceAutocomplete } from "@/lib/blocks/cm-autocomplete";
import { useEnvironmentContext } from "@/contexts/EnvironmentContext";

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

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const METHODS_WITH_BODY: HttpMethod[] = ["POST", "PUT", "PATCH"];

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: "green",
  POST: "blue",
  PUT: "orange",
  PATCH: "yellow",
  DELETE: "red",
  HEAD: "purple",
  OPTIONS: "gray",
};

/* ------------------------------------------------------------------ */
/*  Key-Value Row + List (matches HTTP block pattern)                   */
/* ------------------------------------------------------------------ */
function KeyValueRow({
  item,
  keyPlaceholder,
  valuePlaceholder = "Value",
  onChange,
  onRemove,
  isLast,
  cmTheme,
  cmExtensions,
}: {
  item: { key: string; value: string };
  keyPlaceholder: string;
  valuePlaceholder?: string;
  onChange: (kv: { key: string; value: string }) => void;
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
          placeholder={valuePlaceholder}
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

function KVEditor({
  items,
  onChange,
  addLabel = "Add item",
  keyPlaceholder = "key",
  valuePlaceholder = "Value",
  cmTheme,
  autocompleteExt,
}: {
  items: { key: string; value: string }[];
  onChange: (items: { key: string; value: string }[]) => void;
  addLabel?: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  cmTheme: "light" | "dark";
  autocompleteExt?: import("@codemirror/state").Extension[];
}) {
  return (
    <Box border="1px solid" borderColor="border" rounded="md" overflow="hidden">
      {items.map((item, i) => (
        <KeyValueRow
          key={i}
          item={item}
          keyPlaceholder={keyPlaceholder}
          valuePlaceholder={valuePlaceholder}
          isLast={i === items.length - 1}
          cmTheme={cmTheme}
          cmExtensions={autocompleteExt}
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

/* ------------------------------------------------------------------ */
/*  String List Editor (for body_contains)                             */
/* ------------------------------------------------------------------ */
function StringListEditor({
  items,
  onChange,
  addLabel = "Add item",
  placeholder = "value",
  cmTheme,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  addLabel?: string;
  placeholder?: string;
  cmTheme: "light" | "dark";
}) {
  const update = (idx: number, val: string) => {
    const next = [...items];
    next[idx] = val;
    onChange(next);
  };
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));

  return (
    <Box border="1px solid" borderColor="border" rounded="md" overflow="hidden">
      {items.map((item, idx) => (
        <Flex
          key={idx}
          borderBottom={idx === items.length - 1 ? undefined : "1px solid"}
          borderColor="border"
          align="center"
        >
          <Box flex={1} px={1}>
            <InlineCM
              value={item}
              onChange={(v) => update(idx, v)}
              placeholder={placeholder}
              cmTheme={cmTheme}
            />
          </Box>
          <IconButton
            aria-label="Remove"
            size="2xs"
            variant="ghost"
            colorPalette="red"
            mx={1}
            onClick={() => remove(idx)}
          >
            <LuX />
          </IconButton>
        </Flex>
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
        onClick={() => onChange([...items, ""])}
      >
        <LuPlus />
        {addLabel}
      </Flex>
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/*  Collapsible Section                                                */
/* ------------------------------------------------------------------ */
function Section({
  title,
  defaultOpen = false,
  children,
  badge,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Box>
      <Flex
        align="center"
        gap={1}
        cursor="pointer"
        onClick={() => setOpen(!open)}
        py={1}
        _hover={{ bg: "bg.subtle" }}
        rounded="sm"
        px={1}
      >
        {open ? <LuChevronDown size={12} /> : <LuChevronRight size={12} />}
        <Text fontSize="xs" fontWeight="medium" color="fg.muted">
          {title}
        </Text>
        {badge}
      </Flex>
      {open && <Box pl={4} pb={2}>{children}</Box>}
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/*  Step Card                                                          */
/* ------------------------------------------------------------------ */
function StepCard({
  step,
  index,
  totalSteps,
  onChange,
  onRemove,
  onMove,
  cmTheme,
  autocompleteExt,
}: {
  step: E2eStep;
  index: number;
  totalSteps: number;
  onChange: (step: E2eStep) => void;
  onRemove: () => void;
  onMove: (direction: "up" | "down") => void;
  cmTheme: "light" | "dark";
  autocompleteExt?: import("@codemirror/state").Extension[];
}) {
  const [expanded, setExpanded] = useState(true);
  const showBody = METHODS_WITH_BODY.includes(step.method);

  const expectCount =
    (step.expect.status ? 1 : 0) + step.expect.json.length + step.expect.bodyContains.length;

  return (
    <Box
      border="1px solid"
      borderColor="border"
      rounded="md"
      overflow="hidden"
      mb={2}
    >
      {/* Step header — compact summary */}
      <Flex
        align="center"
        gap={1}
        px={2}
        py={1}
        bg="bg.subtle"
        cursor="pointer"
        onClick={() => setExpanded(!expanded)}
        minH="32px"
      >
        {expanded ? <LuChevronDown size={12} /> : <LuChevronRight size={12} />}
        <Input
          size="xs"
          variant="flushed"
          placeholder={`Step ${index + 1}`}
          value={step.name}
          onChange={(e) => onChange({ ...step, name: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          fontFamily="mono"
          fontSize="xs"
          flex={1}
          minW="0"
          color="fg.muted"
        />
        <HStack gap={0} flexShrink={0}>
          <IconButton
            aria-label="Move up"
            size="2xs"
            variant="ghost"
            disabled={index === 0}
            onClick={(e) => { e.stopPropagation(); onMove("up"); }}
          >
            <LuArrowUp />
          </IconButton>
          <IconButton
            aria-label="Move down"
            size="2xs"
            variant="ghost"
            disabled={index === totalSteps - 1}
            onClick={(e) => { e.stopPropagation(); onMove("down"); }}
          >
            <LuArrowDown />
          </IconButton>
          <IconButton
            aria-label="Remove step"
            size="2xs"
            variant="ghost"
            colorPalette="red"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
          >
            <LuX />
          </IconButton>
        </HStack>
      </Flex>

      {/* Step content — HTTP-block-style layout with tabs */}
      {expanded && (
        <Box p={2} display="flex" flexDirection="column" gap={1.5}>
          {/* Method + URL — matching HTTP block pattern */}
          <Flex gap={1} align="center">
            <NativeSelectRoot size="xs" width="auto" flexShrink={0} h="32px">
              <NativeSelectField
                value={step.method}
                onChange={(e) => onChange({ ...step, method: e.target.value as HttpMethod })}
                fontFamily="mono"
                fontSize="xs"
                fontWeight="bold"
                h="32px"
                color={`${METHOD_COLORS[step.method]}.400`}
                onClick={(e) => e.stopPropagation()}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </NativeSelectField>
            </NativeSelectRoot>
            <Box flex={1} minW="0" h="32px" border="1px solid" borderColor="border" rounded="sm" overflow="hidden">
              <InlineCM
                value={step.url}
                onChange={(v) => onChange({ ...step, url: v })}
                placeholder="/path"
                cmTheme={cmTheme}
                extensions={autocompleteExt}
              />
            </Box>
          </Flex>

          {/* Request tabs: Params / Headers / Body */}
          <Tabs.Root defaultValue="params" size="sm" variant="line">
            <Tabs.List>
              <Tabs.Trigger value="params" fontSize="xs">
                Params
                {step.params.length > 0 && (
                  <Badge size="sm" variant="subtle" colorPalette="gray" fontFamily="mono" ml={1}>
                    {step.params.length}
                  </Badge>
                )}
              </Tabs.Trigger>
              <Tabs.Trigger value="headers" fontSize="xs">
                Headers
                {step.headers.length > 0 && (
                  <Badge size="sm" variant="subtle" colorPalette="gray" fontFamily="mono" ml={1}>
                    {step.headers.length}
                  </Badge>
                )}
              </Tabs.Trigger>
              {showBody && (
                <Tabs.Trigger value="body" fontSize="xs">
                  Body
                </Tabs.Trigger>
              )}
            </Tabs.List>

            <Tabs.Content value="params" p={0} pt={2}>
              <KVEditor
                items={step.params}
                onChange={(params) => onChange({ ...step, params })}
                addLabel="Add param"
                keyPlaceholder="Param name"
                valuePlaceholder="Value"
                cmTheme={cmTheme}
                autocompleteExt={autocompleteExt}
              />
            </Tabs.Content>

            <Tabs.Content value="headers" p={0} pt={2}>
              <KVEditor
                items={step.headers}
                onChange={(headers) => onChange({ ...step, headers })}
                addLabel="Add header"
                keyPlaceholder="Header name"
                valuePlaceholder="Value"
                cmTheme={cmTheme}
                autocompleteExt={autocompleteExt}
              />
            </Tabs.Content>

            {showBody && (
              <Tabs.Content value="body" p={0} pt={2}>
                <CodeMirror
                  value={step.body}
                  onChange={(v) => onChange({ ...step, body: v })}
                  extensions={[json(), cmTransparentBg, ...referenceHighlight, ...(autocompleteExt ?? [])]}
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: false,
                    autocompletion: false,
                    highlightActiveLine: false,
                  }}
                  theme={cmTheme}
                  height="auto"
                  minHeight="60px"
                  maxHeight="200px"
                  placeholder='{"key": "value"}'
                  style={{ fontFamily: "var(--chakra-fonts-mono)", fontSize: "12px" }}
                />
              </Tabs.Content>
            )}
          </Tabs.Root>

          {/* Assertions tabs: Expect / Extract */}
          <Tabs.Root defaultValue="expect" size="sm" variant="line">
            <Tabs.List>
              <Tabs.Trigger value="expect" fontSize="xs">
                Expect
                {expectCount > 0 && (
                  <Badge size="sm" variant="subtle" colorPalette="blue" fontFamily="mono" ml={1}>
                    {expectCount}
                  </Badge>
                )}
              </Tabs.Trigger>
              <Tabs.Trigger value="extract" fontSize="xs">
                Extract
                {step.extract.length > 0 && (
                  <Badge size="sm" variant="subtle" colorPalette="purple" fontFamily="mono" ml={1}>
                    {step.extract.length}
                  </Badge>
                )}
              </Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content value="expect" p={0} pt={2}>
              <Box mb={2}>
                <Text fontSize="2xs" color="fg.muted" mb={1}>Status</Text>
                <Input
                  size="xs"
                  type="number"
                  placeholder="200"
                  value={step.expect.status ?? ""}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value) : undefined;
                    onChange({ ...step, expect: { ...step.expect, status: val } });
                  }}
                  fontFamily="mono"
                  fontSize="xs"
                  maxW="80px"
                />
              </Box>
              <Box mb={2}>
                <Text fontSize="2xs" color="fg.muted" mb={1}>JSON Match</Text>
                <KVEditor
                  items={step.expect.json}
                  onChange={(j) => onChange({ ...step, expect: { ...step.expect, json: j } })}
                  addLabel="Add match"
                  keyPlaceholder="JSON path"
                  valuePlaceholder="Expected value"
                  cmTheme={cmTheme}
                />
              </Box>
              <Box>
                <Text fontSize="2xs" color="fg.muted" mb={1}>Body Contains</Text>
                <StringListEditor
                  items={step.expect.bodyContains}
                  onChange={(bc) => onChange({ ...step, expect: { ...step.expect, bodyContains: bc } })}
                  addLabel="Add string"
                  placeholder="String to find..."
                  cmTheme={cmTheme}
                />
              </Box>
            </Tabs.Content>

            <Tabs.Content value="extract" p={0} pt={2}>
              <KVEditor
                items={step.extract.map((e) => ({ key: e.name, value: e.path }))}
                onChange={(items) =>
                  onChange({
                    ...step,
                    extract: items.map((i) => ({ name: i.key, path: i.value })),
                  })
                }
                addLabel="Add extraction"
                keyPlaceholder="Variable name"
                valuePlaceholder="JSON path"
                cmTheme={cmTheme}
              />
            </Tabs.Content>
          </Tabs.Root>
        </Box>
      )}
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/*  Step Result Card (output)                                          */
/* ------------------------------------------------------------------ */
function StepResultCard({ result }: { result: E2eStepResult }) {
  const [expanded, setExpanded] = useState(!result.passed);

  let bodyString: string;
  if (typeof result.response_body === "string") {
    bodyString = result.response_body;
  } else {
    bodyString = JSON.stringify(result.response_body, null, 2);
  }

  let highlightedBody: string | null = null;
  try {
    const tree = lowlight.highlight("json", bodyString);
    highlightedBody = treeToHtml(tree);
  } catch {
    // fallback
  }

  return (
    <Box
      border="1px solid"
      borderColor={result.passed ? "green.muted" : "red.muted"}
      rounded="md"
      overflow="hidden"
      mb={2}
    >
      <Flex
        align="center"
        gap={2}
        px={2}
        py={1}
        bg="bg.subtle"
        cursor="pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {result.passed ? (
          <LuCheck color="var(--chakra-colors-green-fg)" size={14} />
        ) : (
          <LuCircleX color="var(--chakra-colors-red-fg)" size={14} />
        )}
        <Text fontSize="xs" fontWeight="medium" flex={1}>
          {result.name || "Unnamed step"}
        </Text>
        {result.status_code > 0 && (
          <Badge
            size="sm"
            colorPalette={result.status_code < 400 ? "green" : "red"}
            variant="subtle"
          >
            {result.status_code}
          </Badge>
        )}
        <Text fontSize="2xs" color="fg.muted">
          {result.elapsed_ms}ms
        </Text>
        {expanded ? <LuChevronDown size={12} /> : <LuChevronRight size={12} />}
      </Flex>

      {expanded && (
        <Box px={3} py={2} fontSize="xs">
          {/* Errors / Assertion failures */}
          {result.errors.length > 0 && (
            <Box mb={2}>
              <Text fontWeight="medium" color="red.fg" mb={1}>Assertion Failures</Text>
              {result.errors.map((err, i) => (
                <Box key={i} bg="red.subtle" px={2} py={1} rounded="sm" mb={1} fontFamily="mono" fontSize="2xs">
                  {err}
                </Box>
              ))}
            </Box>
          )}

          {/* Extractions */}
          {Object.keys(result.extractions).length > 0 && (
            <Box mb={2}>
              <Text fontWeight="medium" color="purple.fg" mb={1}>Extracted Variables</Text>
              {Object.entries(result.extractions).map(([key, value]) => (
                <Flex key={key} gap={2} fontFamily="mono" fontSize="2xs" mb={0.5}>
                  <Text color="purple.fg">{key}</Text>
                  <Text color="fg.muted">=</Text>
                  <Text>{typeof value === "string" ? value : JSON.stringify(value)}</Text>
                </Flex>
              ))}
            </Box>
          )}

          {/* Response body */}
          <Section title="Response Body" defaultOpen={!result.passed}>
            <Box
              maxH="200px"
              overflow="auto"
              fontFamily="mono"
              fontSize="2xs"
              bg="bg.subtle"
              p={2}
              rounded="sm"
            >
              {highlightedBody ? (
                <pre dangerouslySetInnerHTML={{ __html: highlightedBody }} />
              ) : (
                <pre>{bodyString}</pre>
              )}
            </Box>
          </Section>
        </Box>
      )}
    </Box>
  );
}

/** Convert lowlight tree to HTML string */
function treeToHtml(tree: ReturnType<typeof lowlight.highlight>): string {
  function renderNode(node: (typeof tree.children)[number]): string {
    if (node.type === "text") return escapeHtml(node.value);
    if (node.type === "element") {
      const classes = (node.properties?.className as string[])?.join(" ") ?? "";
      const inner = (node.children || []).map(renderNode).join("");
      return classes ? `<span class="${classes}">${inner}</span>` : inner;
    }
    return "";
  }
  return tree.children.map(renderNode).join("");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ------------------------------------------------------------------ */
/*  Main E2E Block View                                                */
/* ------------------------------------------------------------------ */
function E2eBlockViewInner({ node, editor, getPos, updateAttributes, selected }: NodeViewProps) {
  const { filePath } = useBlockContext();
  const { colorMode } = useColorMode();
  const cmTheme = colorMode === "dark" ? "dark" : "light";
  const { getActiveVariables } = useEnvironmentContext();

  // Parse block data
  const [data, setData] = useState<E2eBlockData>(() => {
    try {
      const parsed = JSON.parse(node.attrs.content || "{}");
      return {
        baseUrl: parsed.baseUrl ?? "",
        headers: parsed.headers ?? [],
        steps: (parsed.steps ?? []).map((s: Partial<E2eStep>) => ({
          ...DEFAULT_STEP,
          ...s,
          expect: { ...DEFAULT_STEP.expect, ...s.expect },
        })),
      };
    } catch {
      return { ...DEFAULT_E2E_DATA };
    }
  });

  const [result, setResult] = useState<E2eResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [depStatus, setDepStatus] = useState<string | null>(null);

  const alias = (node.attrs.alias as string) || "";
  const displayMode = (node.attrs.displayMode as DisplayMode) || "input";
  const executionState = (node.attrs.executionState as ExecutionState) || "idle";

  // Debounced content sync
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  const syncContent = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateAttributes({ content: JSON.stringify(dataRef.current) });
    }, 300);
  }, [updateAttributes]);

  const updateData = useCallback(
    (updater: (prev: E2eBlockData) => E2eBlockData) => {
      setData((prev) => {
        const next = updater(prev);
        return next;
      });
    },
    [],
  );

  // Sync content whenever data changes
  useEffect(() => {
    syncContent();
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [data, syncContent]);

  // Load cached result on mount / content change
  useEffect(() => {
    (async () => {
      try {
        const content = node.attrs.content as string;
        if (!content || !filePath) return;
        const hash = await hashBlockContent(content);
        const cached = await getBlockResult(filePath, hash);
        if (cached) {
          const parsed = JSON.parse(cached.response);
          setResult(parsed);
          if (executionState === "idle") {
            updateAttributes({ executionState: "cached" });
          }
        }
      } catch {
        // no cache
      }
    })();
  }, [node.attrs.content, filePath]);

  // Refs for autocomplete data
  const blocksRef = useRef<BlockContext[]>([]);
  const envKeysRef = useRef<string[]>([]);
  const envVarsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    getActiveVariables().then((vars) => {
      if (!cancelled) {
        envKeysRef.current = Object.keys(vars);
        envVarsRef.current = vars;
      }
    });
    return () => { cancelled = true; };
  }, [getActiveVariables]);

  useEffect(() => {
    if (!filePath || !editor) return;
    let cancelled = false;
    const currentPos = (typeof getPos === "function" ? getPos() : 0) ?? 0;
    collectBlocksAbove(editor, currentPos, filePath).then((blocks) => {
      if (!cancelled) blocksRef.current = blocks;
    });
    return () => { cancelled = true; };
  }, [filePath, editor, getPos]);

  const refTooltip = useMemo(
    () => createReferenceTooltip(
      () => blocksRef.current ?? [],
      () => (typeof getPos === "function" ? getPos() : 0) ?? 0,
      () => envVarsRef.current ?? {},
    ),
    [blocksRef, envVarsRef, getPos],
  );

  const autocompleteExt = useMemo(
    () => [createReferenceAutocomplete(
      () => blocksRef.current ?? [],
      () => envKeysRef.current ?? [],
    ), refTooltip],
    [blocksRef, envKeysRef, refTooltip],
  );

  // Execution handler
  const handleRun = useCallback(async () => {
    if (!filePath) return;
    setError(null);
    setResult(null);
    updateAttributes({ executionState: "running" });

    try {
      const pos = (typeof getPos === "function" ? getPos() : 0) ?? 0;

      // Resolve dependencies (other blocks referenced in baseUrl, step urls, etc.)
      const blockContent = JSON.stringify(dataRef.current);
      const depResult = await resolveAndExecuteDependencies(
        editor,
        pos,
        filePath,
        blockContent,
        (status) => setDepStatus(status),
      );
      setDepStatus(null);

      // Resolve {{...}} references in block fields
      const envVars = await getActiveVariables();
      const resolveField = (text: string) => {
        const r = resolveAllReferences(text, depResult.blocks, pos, envVars);
        return r.resolved;
      };

      const resolvedData = {
        base_url: resolveField(dataRef.current.baseUrl),
        headers: dataRef.current.headers.map((h) => ({
          key: h.key,
          value: resolveField(h.value),
        })),
        steps: dataRef.current.steps.map((s) => ({
          name: s.name,
          method: s.method,
          url: resolveField(s.url),
          params: s.params.map((p) => ({
            key: p.key,
            value: resolveField(p.value),
          })),
          headers: s.headers.map((h) => ({
            key: h.key,
            value: resolveField(h.value),
          })),
          body: resolveField(s.body),
          expect: {
            status: s.expect.status,
            json: s.expect.json.map((j) => ({
              key: j.key,
              value: resolveField(j.value),
            })),
            body_contains: s.expect.bodyContains.map(resolveField),
          },
          extract: s.extract.map((e) => ({
            name: e.name,
            path: e.path,
          })),
        })),
      };

      const blockResult = await executeBlock("e2e", resolvedData);
      const resultData = blockResult.data as unknown as E2eResult;
      setResult(resultData);

      // Cache result
      const hash = await hashBlockContent(JSON.stringify(dataRef.current));
      await saveBlockResult(
        filePath,
        hash,
        blockResult.status,
        JSON.stringify(resultData),
        blockResult.duration_ms,
      );

      updateAttributes({
        executionState: blockResult.status === "success" ? "success" : "error",
        displayMode: "split",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      updateAttributes({ executionState: "error" });
    }
  }, [editor, filePath, getPos, updateAttributes, getActiveVariables]);

  const handleCancel = useCallback(() => {
    updateAttributes({ executionState: "idle" });
  }, [updateAttributes]);

  // Step manipulation
  const updateStep = useCallback(
    (idx: number, step: E2eStep) => {
      updateData((prev) => {
        const steps = [...prev.steps];
        steps[idx] = step;
        return { ...prev, steps };
      });
    },
    [updateData],
  );

  const removeStep = useCallback(
    (idx: number) => {
      updateData((prev) => ({
        ...prev,
        steps: prev.steps.filter((_, i) => i !== idx),
      }));
    },
    [updateData],
  );

  const moveStep = useCallback(
    (idx: number, direction: "up" | "down") => {
      updateData((prev) => {
        const steps = [...prev.steps];
        const targetIdx = direction === "up" ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= steps.length) return prev;
        [steps[idx], steps[targetIdx]] = [steps[targetIdx], steps[idx]];
        return { ...prev, steps };
      });
    },
    [updateData],
  );

  const addStep = useCallback(() => {
    updateData((prev) => ({
      ...prev,
      steps: [...prev.steps, { ...DEFAULT_STEP, name: `Step ${prev.steps.length + 1}` }],
    }));
  }, [updateData]);

  /* ---------- Input Slot ---------- */
  const inputSlot = (
    <Box p={3}>
      {/* Base URL */}
      <Box mb={3}>
        <Text fontSize="xs" fontWeight="medium" color="fg.muted" mb={1}>Base URL</Text>
        <Box border="1px solid" borderColor="border" rounded="sm">
          <InlineCM
            value={data.baseUrl}
            onChange={(v) => updateData((prev) => ({ ...prev, baseUrl: v }))}
            placeholder="https://api.example.com"
            cmTheme={cmTheme}
            extensions={autocompleteExt}
          />
        </Box>
      </Box>

      {/* Default Headers */}
      <Section
        title="Default Headers"
        badge={
          data.headers.length > 0 ? (
            <Badge size="sm" variant="subtle" colorPalette="gray">{data.headers.length}</Badge>
          ) : undefined
        }
      >
        <KVEditor
          items={data.headers}
          onChange={(headers) => updateData((prev) => ({ ...prev, headers }))}
          addLabel="Add header"
          keyPlaceholder="Header name"
          valuePlaceholder="Value"
          cmTheme={cmTheme}
          autocompleteExt={autocompleteExt}
        />
      </Section>

      {/* Steps */}
      <Box mt={3}>
        <Text fontSize="xs" fontWeight="medium" color="fg.muted" mb={2}>
          Steps ({data.steps.length})
        </Text>
        {data.steps.map((step, idx) => (
          <StepCard
            key={idx}
            step={step}
            index={idx}
            totalSteps={data.steps.length}
            onChange={(s) => updateStep(idx, s)}
            onRemove={() => removeStep(idx)}
            onMove={(dir) => moveStep(idx, dir)}
            cmTheme={cmTheme}
            autocompleteExt={autocompleteExt}
          />
        ))}
        <IconButton
          aria-label="Add step"
          size="sm"
          variant="outline"
          colorPalette="gray"
          width="100%"
          onClick={addStep}
        >
          <LuPlus />
          <Text fontSize="xs" ml={1}>Add Step</Text>
        </IconButton>
      </Box>
    </Box>
  );

  /* ---------- Output Slot ---------- */
  const outputSlot = (
    <Box p={3}>
      {error && (
        <Box bg="red.subtle" color="red.fg" p={2} rounded="md" mb={2} fontSize="xs" fontFamily="mono">
          {error}
        </Box>
      )}
      {result && (
        <>
          {/* Summary */}
          <Flex align="center" gap={2} mb={3}>
            <Text fontSize="sm" fontWeight="bold">
              {result.passed}/{result.total} passed
            </Text>
            <Box flex={1} bg="bg.emphasized" rounded="full" h="6px" overflow="hidden">
              <Box
                h="100%"
                bg={result.passed === result.total ? "green.solid" : "red.solid"}
                width={`${(result.passed / Math.max(result.total, 1)) * 100}%`}
                transition="width 0.3s"
                rounded="full"
              />
            </Box>
          </Flex>

          {/* Step results */}
          {result.steps?.map((stepResult, idx) => (
            <StepResultCard key={idx} result={stepResult} />
          ))}
        </>
      )}
    </Box>
  );

  return (
    <NodeViewWrapper data-type="e2e-block">
      <ExecutableBlockShell
        blockType="e2e"
        alias={alias}
        displayMode={displayMode}
        executionState={executionState}
        onAliasChange={(v) => updateAttributes({ alias: v })}
        onDisplayModeChange={(m) => updateAttributes({ displayMode: m })}
        onRun={handleRun}
        onCancel={handleCancel}
        inputSlot={inputSlot}
        outputSlot={outputSlot}
        selected={selected}
        statusText={depStatus}
      />
    </NodeViewWrapper>
  );
}

export const E2eBlockView = memo(E2eBlockViewInner, (prev, next) =>
  prev.selected === next.selected && prev.node === next.node,
);
