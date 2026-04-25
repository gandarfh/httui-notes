/**
 * React panel for an `http` fenced block (stage 4 of the redesign).
 *
 * Lives outside CM6's document flow: the CM extension `cm-http-block.tsx`
 * registers three container divs per block (toolbar, result, statusbar),
 * and this component mounts React into each via `createPortal`. The
 * settings drawer uses a Chakra Portal anchored to document.body (not
 * Dialog — would trap focus away from CM6).
 *
 * Execution runs through `executeHttpStreamed` (stage 2 plumbing). Results
 * are persisted to the SQLite block-result cache hashed by method + URL +
 * headers + body + env-snapshot. Mutation methods (POST/PUT/PATCH/DELETE)
 * are NEVER served from cache — they always re-execute.
 */

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Badge,
  Box,
  Button,
  Field,
  Flex,
  HStack,
  IconButton,
  Input,
  Menu,
  NativeSelectField,
  NativeSelectRoot,
  Portal,
  Spinner,
  Tabs,
  Text,
} from "@chakra-ui/react";
import {
  LuClipboard,
  LuDownload,
  LuPlay,
  LuSettings,
  LuSquare,
  LuTrash2,
  LuX,
} from "react-icons/lu";
import type { EditorView } from "@codemirror/view";

import {
  setHttpBlockActions,
  type HttpPortalEntry,
} from "@/lib/codemirror/cm-http-block";
import {
  parseHttpMessageBody,
  parseLegacyHttpBody,
  legacyToHttpMessage,
  stringifyHttpFenceInfo,
  stringifyHttpMessageBody,
  type HttpBlockMetadata,
  type HttpDisplayMode,
  type HttpMessageParsed,
  type HttpMethod,
} from "@/lib/blocks/http-fence";
import {
  cancelBlockExecution,
  executeHttpStreamed,
  normalizeHttpResponse,
  type HttpCookieRaw,
  type HttpResponseFull,
  type HttpTimingBreakdown,
} from "@/lib/tauri/streamedExecution";
import { resolveAllReferences } from "@/lib/blocks/references";
import { collectBlocksAboveCM } from "@/lib/blocks/document";
import { computeHttpCacheHash } from "@/lib/blocks/hash";
import {
  toCurl,
  toFetch,
  toHTTPie,
  toHttpFile,
  toPython,
} from "@/lib/blocks/http-codegen";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import {
  getBlockResult,
  insertBlockHistory,
  listBlockHistory,
  purgeBlockHistory,
  saveBlockResult,
  type HistoryEntry,
} from "@/lib/tauri/commands";
import { useEnvironmentStore } from "@/stores/environment";

interface HttpFencedPanelProps {
  blockId: string;
  block: HttpPortalEntry["block"];
  entry: HttpPortalEntry;
  view: EditorView;
  filePath: string;
}

type ExecutionState = "idle" | "running" | "success" | "error" | "cancelled";

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: "green.500",
  POST: "blue.500",
  PUT: "orange.500",
  PATCH: "yellow.500",
  DELETE: "red.500",
  HEAD: "purple.500",
  OPTIONS: "gray.500",
};

const MUTATION_METHODS: ReadonlySet<HttpMethod> = new Set([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

function parseBody(body: string): HttpMessageParsed {
  const legacy = parseLegacyHttpBody(body);
  if (legacy) return legacyToHttpMessage(legacy);
  return parseHttpMessageBody(body);
}

function deriveHost(rawUrl: string): string | null {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl);
    return u.host;
  } catch {
    return null;
  }
}

function statusDotColor(code: number | null | undefined): string {
  if (!code) return "gray.400";
  if (code >= 200 && code < 300) return "green.500";
  if (code >= 300 && code < 400) return "blue.500";
  if (code >= 400 && code < 500) return "orange.500";
  if (code >= 500) return "red.500";
  return "gray.400";
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function relativeTimeAgo(date: Date | null): string | null {
  if (!date) return null;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

// RFC 7230 header-name token characters. Reqwest rejects anything outside
// this set (notably whitespace, control chars, `{`, `}`, `(`, `)`, `,`,
// `:`, `;`, `<`, `>`, `=`, `@`, `[`, `\`, `]`, `?`, `/`, `"`, etc).
const HTTP_TOKEN_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function isValidHeaderName(name: string): boolean {
  return HTTP_TOKEN_RE.test(name);
}

/** Build the executor params from the parsed-and-resolved request.
 *
 * `{{ref}}` is resolved in BOTH the key and the value of every header /
 * query param — keys must be resolvable too, otherwise a header name like
 * `{{auth.header_name}}` would reach reqwest verbatim and fail with
 * `builder error` (reqwest rejects `{` in header names per RFC 7230).
 *
 * Rows whose key resolves to empty are dropped as a safety net so a stray
 * `headers:` label or an unresolved ref doesn't generate an invalid request.
 *
 * Returns the executor params plus a list of validation errors collected
 * along the way (e.g. a header name that resolves to a value containing
 * whitespace — invalid per RFC 7230). The caller surfaces these to the
 * user instead of letting reqwest emit a generic `builder error`.
 */
function buildExecutorParams(
  parsed: HttpMessageParsed,
  resolveText: (s: string) => string,
  timeoutMs: number | undefined,
): { params: Record<string, unknown>; errors: string[] } {
  const errors: string[] = [];

  const resolveHeaders = (rows: HttpMessageParsed["headers"]) =>
    rows
      .filter((r) => r.enabled)
      .map((r) => ({
        rawKey: r.key,
        key: resolveText(r.key).trim(),
        value: resolveText(r.value),
      }))
      .filter((r) => {
        if (r.key.length === 0) return false;
        if (!isValidHeaderName(r.key)) {
          errors.push(
            `Invalid header name "${r.key}"` +
              (r.rawKey !== r.key ? ` (resolved from "${r.rawKey}")` : "") +
              " — header names cannot contain spaces or special characters.",
          );
          return false;
        }
        return true;
      })
      .map(({ key, value }) => ({ key, value }));

  const resolveQueryParams = (rows: HttpMessageParsed["params"]) =>
    rows
      .filter((r) => r.enabled)
      .map((r) => ({
        key: resolveText(r.key).trim(),
        value: resolveText(r.value),
      }))
      .filter((r) => r.key.length > 0);

  const params: Record<string, unknown> = {
    method: parsed.method,
    url: resolveText(parsed.url),
    params: resolveQueryParams(parsed.params),
    headers: resolveHeaders(parsed.headers),
    body: parsed.body ? resolveText(parsed.body) : "",
  };
  if (timeoutMs !== undefined) params.timeout_ms = timeoutMs;
  return { params, errors };
}

// ─────────────────────── Sub-components ───────────────────────

type SendAsFormat = "curl" | "fetch" | "python" | "httpie" | "http-file";

function HttpToolbar({
  alias,
  method,
  host,
  mode,
  executionState,
  onRun,
  onCancel,
  onOpenSettings,
  onToggleMode,
}: {
  alias: string | undefined;
  method: HttpMethod;
  host: string | null;
  mode: "raw" | "form";
  executionState: ExecutionState;
  onRun: () => void;
  onCancel: () => void;
  onOpenSettings: () => void;
  onToggleMode: (next: "raw" | "form") => void;
}) {
  const running = executionState === "running";
  return (
    <Flex
      align="center"
      gap={2}
      px={3}
      py={1.5}
      bg="bg.subtle"
      borderTopRadius="md"
      fontSize="sm"
      minH="36px"
    >
      <Badge colorPalette="blue" variant="subtle" textTransform="uppercase">
        HTTP
      </Badge>
      {alias && (
        <Text
          fontFamily="mono"
          color="fg.muted"
          truncate
          maxW="14ch"
          aria-label="alias"
        >
          {alias}
        </Text>
      )}
      <Box
        px={1.5}
        py={0.5}
        borderRadius="sm"
        bg="bg.muted"
        fontSize="xs"
        fontFamily="mono"
        color={METHOD_COLORS[method]}
        fontWeight="semibold"
      >
        {method}
      </Box>
      {host && (
        <Text
          fontFamily="mono"
          color="fg.muted"
          fontSize="xs"
          truncate
          maxW="32ch"
        >
          {host}
        </Text>
      )}
      <Box flex={1} />
      <HStack
        gap={0}
        borderRadius="sm"
        borderWidth="1px"
        borderColor="border.muted"
        overflow="hidden"
        aria-label="View mode"
      >
        <Button
          size="2xs"
          variant={mode === "raw" ? "solid" : "ghost"}
          borderRadius="0"
          onClick={() => onToggleMode("raw")}
          aria-pressed={mode === "raw"}
        >
          raw
        </Button>
        <Button
          size="2xs"
          variant={mode === "form" ? "solid" : "ghost"}
          borderRadius="0"
          onClick={() => onToggleMode("form")}
          aria-pressed={mode === "form"}
        >
          form
        </Button>
      </HStack>
      {running ? (
        <IconButton
          aria-label="Cancel request"
          size="xs"
          variant="ghost"
          colorPalette="red"
          onClick={onCancel}
        >
          <LuSquare />
        </IconButton>
      ) : (
        <IconButton
          aria-label="Run request"
          size="xs"
          variant="ghost"
          colorPalette="green"
          onClick={onRun}
        >
          <LuPlay />
        </IconButton>
      )}
      <IconButton
        aria-label="Block settings"
        size="xs"
        variant="ghost"
        onClick={onOpenSettings}
      >
        <LuSettings />
      </IconButton>
    </Flex>
  );
}

function bodyAsText(body: unknown): string {
  if (body === null || body === undefined) return "";
  if (typeof body === "string") return body;
  if (
    typeof body === "object" &&
    body !== null &&
    "encoding" in body &&
    (body as { encoding: string }).encoding === "base64"
  ) {
    return "[binary content — base64 encoded]";
  }
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return String(body);
  }
}

// ─────────────────────── Form mode panel ───────────────────────

/**
 * Local-state input committed on blur — mirrors the `EnvironmentManager`
 * pattern. Typing into the form must not pay the round-trip cost of
 * (1) re-stringify the whole body, (2) dispatch a CM6 change, (3) scanner
 * re-runs, (4) `parsed` re-derives, (5) the panel re-mounts. Without local
 * state every keystroke would land that pipeline and the input would feel
 * laggy + lose focus / cursor.
 */
const CommitOnBlurInput = memo(function CommitOnBlurInput({
  value,
  placeholder,
  flex,
  ariaLabel,
  onCommit,
}: {
  value: string;
  placeholder: string;
  flex: number;
  ariaLabel?: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  // Re-sync when the canonical value changes (e.g. raw edit, mode flip,
  // row reorder/delete) and the user is NOT actively editing this field.
  // We treat "actively editing" as "draft differs from the committed
  // value" — the input keeps its in-flight text instead of being reset.
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (draft !== value) onCommit(draft);
  };

  return (
    <Input
      size="xs"
      fontFamily="mono"
      placeholder={placeholder}
      value={draft}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      flex={flex}
    />
  );
});

const CommitOnBlurTextarea = memo(function CommitOnBlurTextarea({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      placeholder="Request body (raw)"
      style={{
        width: "100%",
        minHeight: "120px",
        padding: "8px",
        fontFamily: "var(--chakra-fonts-mono)",
        fontSize: "12px",
        background: "var(--chakra-colors-bg)",
        border:
          "1px solid color-mix(in srgb, var(--chakra-colors-border) 55%, transparent)",
        borderRadius: "var(--chakra-radii-sm)",
        resize: "vertical",
      }}
    />
  );
});

/**
 * Tabular Params/Headers editor shown when `mode=form` and the cursor is
 * outside the block. Each input maintains a local draft and only re-emits
 * the canonical raw body on blur (matching the `EnvironmentManager`
 * pattern in this codebase). Toggles, add, and delete commit immediately
 * — those are infrequent and not on the keystroke path.
 */
function HttpFormPanel({
  parsed,
  onChange,
}: {
  parsed: HttpMessageParsed;
  onChange: (next: HttpMessageParsed) => void;
}) {
  const updateRow = useCallback(
    (
      kind: "params" | "headers",
      index: number,
      patch: Partial<HttpMessageParsed["params"][number]>,
    ) => {
      const rows = parsed[kind].slice();
      rows[index] = { ...rows[index], ...patch };
      onChange({ ...parsed, [kind]: rows });
    },
    [parsed, onChange],
  );

  const addRow = useCallback(
    (kind: "params" | "headers") => {
      const rows = [
        ...parsed[kind],
        { key: "", value: "", enabled: true },
      ];
      onChange({ ...parsed, [kind]: rows });
    },
    [parsed, onChange],
  );

  const deleteRow = useCallback(
    (kind: "params" | "headers", index: number) => {
      const rows = parsed[kind].filter((_, i) => i !== index);
      onChange({ ...parsed, [kind]: rows });
    },
    [parsed, onChange],
  );

  const onBodyCommit = useCallback(
    (next: string) => onChange({ ...parsed, body: next }),
    [parsed, onChange],
  );

  const renderTable = (kind: "params" | "headers") => {
    const rows = parsed[kind];
    return (
      <Box>
        {rows.length === 0 && (
          <Text fontSize="xs" color="fg.muted" px={3} py={2}>
            (no {kind})
          </Text>
        )}
        {rows.map((row, i) => (
          <Flex
            key={`${kind}-${i}`}
            align="center"
            gap={1}
            px={2}
            py={1}
            borderBottomWidth="1px"
            borderColor="border.muted"
            _last={{ borderBottomWidth: 0 }}
          >
            <input
              type="checkbox"
              aria-label={`Toggle ${kind} row ${i}`}
              checked={row.enabled}
              onChange={(e) =>
                updateRow(kind, i, { enabled: e.target.checked })
              }
            />
            <CommitOnBlurInput
              ariaLabel={`${kind} key ${i}`}
              placeholder="key"
              value={row.key}
              flex={1}
              onCommit={(next) => updateRow(kind, i, { key: next })}
            />
            <CommitOnBlurInput
              ariaLabel={`${kind} value ${i}`}
              placeholder="value"
              value={row.value}
              flex={2}
              onCommit={(next) => updateRow(kind, i, { value: next })}
            />
            <CommitOnBlurInput
              ariaLabel={`${kind} description ${i}`}
              placeholder="description"
              value={row.description ?? ""}
              flex={1}
              onCommit={(next) =>
                updateRow(kind, i, { description: next || undefined })
              }
            />
            <IconButton
              aria-label={`Delete ${kind} row ${i}`}
              size="xs"
              variant="ghost"
              onClick={() => deleteRow(kind, i)}
            >
              <LuX />
            </IconButton>
          </Flex>
        ))}
        <Box px={2} py={1}>
          <Button
            size="2xs"
            variant="ghost"
            onClick={() => addRow(kind)}
          >
            + add {kind === "params" ? "param" : "header"}
          </Button>
        </Box>
      </Box>
    );
  };

  return (
    <Box px={2} py={2}>
      <Tabs.Root defaultValue="params" size="sm" variant="line">
        <Tabs.List>
          <Tabs.Trigger value="params">
            Params ({parsed.params.length})
          </Tabs.Trigger>
          <Tabs.Trigger value="headers">
            Headers ({parsed.headers.length})
          </Tabs.Trigger>
          <Tabs.Trigger value="body">Body</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="params" px={0} pt={2}>
          {renderTable("params")}
        </Tabs.Content>
        <Tabs.Content value="headers" px={0} pt={2}>
          {renderTable("headers")}
        </Tabs.Content>
        <Tabs.Content value="body" px={0} pt={2}>
          <CommitOnBlurTextarea value={parsed.body} onCommit={onBodyCommit} />
        </Tabs.Content>
      </Tabs.Root>
    </Box>
  );
}

// ─────────────────────── Body pretty/raw view ───────────────────────

function HttpBodyView({
  rawBody,
  prettyBody,
}: {
  rawBody: string;
  prettyBody: string;
}) {
  const [view, setView] = useState<"pretty" | "raw">("pretty");
  const text = view === "pretty" ? prettyBody : rawBody;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* noop */
    }
  };

  return (
    <>
      <HStack gap={1} mb={1}>
        <Button
          size="2xs"
          variant={view === "pretty" ? "solid" : "ghost"}
          onClick={() => setView("pretty")}
        >
          pretty
        </Button>
        <Button
          size="2xs"
          variant={view === "raw" ? "solid" : "ghost"}
          onClick={() => setView("raw")}
        >
          raw
        </Button>
        <Box flex={1} />
        <IconButton
          aria-label="Copy body"
          size="2xs"
          variant="ghost"
          onClick={onCopy}
        >
          <LuClipboard />
        </IconButton>
      </HStack>
      <Box
        as="pre"
        fontFamily="mono"
        fontSize="xs"
        whiteSpace="pre-wrap"
        wordBreak="break-word"
        maxH="320px"
        overflowY="auto"
      >
        {text || "(empty body)"}
      </Box>
    </>
  );
}

// ─────────────────────── Cookies + Timing tabs ───────────────────────

function HttpCookiesTab({ cookies }: { cookies: HttpCookieRaw[] }) {
  if (cookies.length === 0) {
    return (
      <Text fontSize="xs" color="fg.muted">
        (no Set-Cookie headers in this response)
      </Text>
    );
  }
  return (
    <Box as="table" fontFamily="mono" fontSize="xs" w="100%">
      <Box as="thead">
        <Box as="tr" color="fg.muted">
          {["Name", "Value", "Domain", "Path", "Expires", "Flags"].map((h) => (
            <Box
              as="th"
              key={h}
              pr={3}
              py={1}
              textAlign="left"
              fontWeight="semibold"
            >
              {h}
            </Box>
          ))}
        </Box>
      </Box>
      <Box as="tbody">
        {cookies.map((c, i) => (
          <Box as="tr" key={`${c.name}-${i}`}>
            <Box as="td" pr={3} py={0.5}>
              {c.name}
            </Box>
            <Box as="td" pr={3} py={0.5} wordBreak="break-all">
              {c.value}
            </Box>
            <Box as="td" pr={3} py={0.5}>
              {c.domain ?? "—"}
            </Box>
            <Box as="td" pr={3} py={0.5}>
              {c.path ?? "—"}
            </Box>
            <Box as="td" pr={3} py={0.5}>
              {c.expires ?? "—"}
            </Box>
            <Box as="td" pr={3} py={0.5} color="fg.muted">
              {[c.secure && "Secure", c.http_only && "HttpOnly"]
                .filter(Boolean)
                .join(" · ") || "—"}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function HttpTimingTab({ timing }: { timing: HttpTimingBreakdown }) {
  // V1 ships only `total_ms`; sub-fields are reserved for a follow-up that
  // wires reqwest connect/TLS/TTFB hooks. Show them when present, otherwise
  // an explanatory line.
  const segments: Array<{ label: string; ms: number | null | undefined }> = [
    { label: "DNS", ms: timing.dns_ms },
    { label: "Connect", ms: timing.connect_ms },
    { label: "TLS", ms: timing.tls_ms },
    { label: "TTFB", ms: timing.ttfb_ms },
  ];
  const hasBreakdown = segments.some((s) => s.ms != null);
  const total = timing.total_ms || 0;
  return (
    <Box>
      <Flex align="center" gap={2} mb={2}>
        <Text fontFamily="mono" fontSize="xs" color="fg.muted">
          Total
        </Text>
        <Box
          flex={1}
          h="6px"
          borderRadius="sm"
          bg="blue.500"
          minW="6px"
        />
        <Text fontFamily="mono" fontSize="xs">
          {total}ms
        </Text>
      </Flex>
      {hasBreakdown ? (
        segments
          .filter((s) => s.ms != null)
          .map((s) => {
            const w = total > 0 ? Math.max(2, (s.ms! / total) * 100) : 0;
            return (
              <Flex key={s.label} align="center" gap={2} mb={1}>
                <Text
                  fontFamily="mono"
                  fontSize="xs"
                  color="fg.muted"
                  minW="56px"
                >
                  {s.label}
                </Text>
                <Box
                  h="4px"
                  borderRadius="sm"
                  bg="cyan.400"
                  w={`${w}%`}
                  minW="4px"
                />
                <Text fontFamily="mono" fontSize="xs" color="fg.muted">
                  {s.ms}ms
                </Text>
              </Flex>
            );
          })
      ) : (
        <Text fontSize="xs" color="fg.subtle" mt={2}>
          DNS / Connect / TLS / TTFB breakdown will appear here once the
          executor exposes them. Total time only for now.
        </Text>
      )}
    </Box>
  );
}

function HttpResult({
  executionState,
  response,
  error,
  cached,
  onSaveBodyAsVariable,
}: {
  executionState: ExecutionState;
  response: HttpResponseFull | null;
  error: string | null;
  cached: boolean;
  onSaveBodyAsVariable: () => void;
}) {
  if (executionState === "running") {
    return (
      <Flex align="center" justify="center" py={6} gap={2}>
        <Spinner size="sm" />
        <Text fontSize="sm" color="fg.muted">
          Running request...
        </Text>
      </Flex>
    );
  }
  if (executionState === "error" && error) {
    return (
      <Box px={3} py={3} bg="red.subtle" color="red.fg" fontSize="sm">
        <Text fontWeight="semibold" mb={1}>
          Request failed
        </Text>
        <Text fontFamily="mono" fontSize="xs" whiteSpace="pre-wrap">
          {error}
        </Text>
      </Box>
    );
  }
  if (executionState === "cancelled") {
    return (
      <Box px={3} py={3} fontSize="sm" color="fg.muted">
        <Text>Cancelled</Text>
      </Box>
    );
  }
  if (executionState === "idle" || !response) {
    return (
      <Box px={3} py={3} fontSize="sm" color="fg.subtle">
        <Text>No response yet — press ⌘↵ to run</Text>
      </Box>
    );
  }

  const prettyBody = bodyAsText(response.body);
  const rawBody =
    typeof response.body === "string"
      ? response.body
      : prettyBody; // For parsed JSON we don't have the original raw text, so reuse pretty.
  const headerEntries = Object.entries(response.headers);

  return (
    <Box px={2} py={2}>
      <Flex align="center" gap={2} mb={2}>
        {cached && (
          <Badge colorPalette="purple" variant="subtle">
            cached
          </Badge>
        )}
        <Box flex={1} />
        <Button size="2xs" variant="ghost" onClick={onSaveBodyAsVariable}>
          Save body as variable
        </Button>
      </Flex>
      <Tabs.Root defaultValue="body" size="sm" variant="line">
        <Tabs.List>
          <Tabs.Trigger value="body">Body</Tabs.Trigger>
          <Tabs.Trigger value="headers">
            Headers ({headerEntries.length})
          </Tabs.Trigger>
          <Tabs.Trigger value="cookies">
            Cookies ({response.cookies.length})
          </Tabs.Trigger>
          <Tabs.Trigger value="timing">Timing</Tabs.Trigger>
          <Tabs.Trigger value="raw">Raw</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="body" px={0} pt={2}>
          <HttpBodyView rawBody={rawBody} prettyBody={prettyBody} />
        </Tabs.Content>
        <Tabs.Content value="headers" px={0} pt={2}>
          {headerEntries.length === 0 ? (
            <Text fontSize="xs" color="fg.muted">
              (no headers)
            </Text>
          ) : (
            <Box as="table" fontFamily="mono" fontSize="xs" w="100%">
              <Box as="tbody">
                {headerEntries.map(([k, v]) => (
                  <Box as="tr" key={k}>
                    <Box
                      as="td"
                      pr={3}
                      py={0.5}
                      color="fg.muted"
                      verticalAlign="top"
                      whiteSpace="nowrap"
                    >
                      {k}
                    </Box>
                    <Box as="td" py={0.5} wordBreak="break-all">
                      {v}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Tabs.Content>
        <Tabs.Content value="cookies" px={0} pt={2}>
          <HttpCookiesTab cookies={response.cookies} />
        </Tabs.Content>
        <Tabs.Content value="timing" px={0} pt={2}>
          <HttpTimingTab timing={response.timing} />
        </Tabs.Content>
        <Tabs.Content value="raw" px={0} pt={2}>
          <Box
            as="pre"
            fontFamily="mono"
            fontSize="xs"
            whiteSpace="pre-wrap"
            wordBreak="break-word"
            maxH="320px"
            overflowY="auto"
          >
            {`${response.status_code} ${response.status_text}\n` +
              headerEntries.map(([k, v]) => `${k}: ${v}`).join("\n") +
              "\n\n" +
              prettyBody}
          </Box>
        </Tabs.Content>
      </Tabs.Root>
    </Box>
  );
}

function HttpStatusBar({
  alias,
  host,
  executionState,
  response,
  durationMs,
  cached,
  lastRunAt,
  onSendAs,
}: {
  alias: string | undefined;
  host: string | null;
  executionState: ExecutionState;
  response: HttpResponseFull | null;
  durationMs: number | null;
  cached: boolean;
  lastRunAt: Date | null;
  onSendAs: (format: SendAsFormat) => void;
}) {
  const status = response?.status_code;
  const dotColor = statusDotColor(status);
  const ago = relativeTimeAgo(lastRunAt);

  let label: string;
  if (executionState === "running") label = "running";
  else if (executionState === "cancelled") label = "cancelled";
  else if (executionState === "error") label = "error";
  else if (status) label = `${status}`;
  else label = "idle";

  return (
    <Flex
      align="center"
      gap={2}
      px={3}
      py={1}
      bg="bg.subtle"
      borderBottomRadius="md"
      fontFamily="mono"
      fontSize="xs"
      color="fg.subtle"
      minH="24px"
    >
      <HStack gap={1.5}>
        <Box w={1.5} h={1.5} borderRadius="full" bg={dotColor} />
        <Text>{label}</Text>
      </HStack>
      {host && <Text>· {host}</Text>}
      {durationMs !== null && executionState !== "running" && (
        <Text>· {durationMs}ms</Text>
      )}
      {response && executionState !== "running" && (
        <Text>· {formatBytes(response.size_bytes)}</Text>
      )}
      {ago && executionState !== "running" && <Text>· ran {ago}</Text>}
      {cached && <Text>· cached</Text>}
      {alias && <Text>· {alias}</Text>}
      <Box flex={1} />
      <Text>⌘↵ to run · ⌘. to cancel</Text>
      <Menu.Root positioning={{ placement: "top-end" }}>
        <Menu.Trigger asChild>
          <IconButton
            aria-label="Send as / copy snippet"
            size="2xs"
            variant="ghost"
            title="Send as / copy snippet"
          >
            <LuDownload />
          </IconButton>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content minW="200px" py={1}>
              <Menu.Item value="curl" onSelect={() => onSendAs("curl")}>
                Copy as cURL
              </Menu.Item>
              <Menu.Item value="fetch" onSelect={() => onSendAs("fetch")}>
                Copy as fetch (JS)
              </Menu.Item>
              <Menu.Item value="python" onSelect={() => onSendAs("python")}>
                Copy as Python (requests)
              </Menu.Item>
              <Menu.Item value="httpie" onSelect={() => onSendAs("httpie")}>
                Copy as HTTPie
              </Menu.Item>
              <Menu.Separator />
              <Menu.Item
                value="http-file"
                onSelect={() => onSendAs("http-file")}
              >
                Save as .http file…
              </Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
    </Flex>
  );
}

function HttpDrawer({
  metadata,
  history,
  onClose,
  onUpdateMetadata,
  onDelete,
  onPurgeHistory,
}: {
  metadata: HttpBlockMetadata;
  history: HistoryEntry[];
  onClose: () => void;
  onUpdateMetadata: (patch: Partial<HttpBlockMetadata>) => void;
  onDelete: () => void;
  onPurgeHistory: () => void;
}) {
  return (
    <Portal>
      <Box
        position="fixed"
        top={0}
        right={0}
        bottom={0}
        w="320px"
        bg="bg.panel"
        borderLeftWidth="1px"
        borderColor="border"
        boxShadow="lg"
        zIndex={1500}
        overflowY="auto"
      >
        <Flex
          align="center"
          justify="space-between"
          px={4}
          py={3}
          borderBottomWidth="1px"
          borderColor="border.muted"
        >
          <Text fontSize="sm" fontWeight="semibold">
            HTTP block settings
          </Text>
          <IconButton
            aria-label="Close settings"
            size="xs"
            variant="ghost"
            onClick={onClose}
          >
            <LuX />
          </IconButton>
        </Flex>

        <Box px={4} py={3}>
          <Text
            fontSize="xs"
            color="fg.muted"
            textTransform="uppercase"
            letterSpacing="wide"
            mb={2}
          >
            Identity
          </Text>
          <Field.Root mb={3}>
            <Field.Label fontSize="xs">Alias</Field.Label>
            <Input
              size="sm"
              value={metadata.alias ?? ""}
              placeholder="e.g. createUser"
              onChange={(e) =>
                onUpdateMetadata({ alias: e.target.value || undefined })
              }
            />
          </Field.Root>
          <Field.Root mb={3}>
            <Field.Label fontSize="xs">Display</Field.Label>
            <NativeSelectRoot size="sm">
              <NativeSelectField
                value={metadata.displayMode ?? "input"}
                onChange={(e) =>
                  onUpdateMetadata({
                    displayMode: e.target.value as HttpDisplayMode,
                  })
                }
              >
                <option value="input">input</option>
                <option value="split">split</option>
                <option value="output">output</option>
              </NativeSelectField>
            </NativeSelectRoot>
          </Field.Root>

          <Text
            fontSize="xs"
            color="fg.muted"
            textTransform="uppercase"
            letterSpacing="wide"
            mt={4}
            mb={2}
          >
            Settings
          </Text>
          <Field.Root mb={3}>
            <Field.Label fontSize="xs">Timeout (ms)</Field.Label>
            <Input
              size="sm"
              type="number"
              value={metadata.timeoutMs ?? ""}
              placeholder="30000"
              onChange={(e) => {
                const v = e.target.value.trim();
                if (v === "") {
                  onUpdateMetadata({ timeoutMs: undefined });
                  return;
                }
                const n = Number(v);
                if (Number.isFinite(n) && n >= 0) {
                  onUpdateMetadata({ timeoutMs: Math.trunc(n) });
                }
              }}
            />
          </Field.Root>

          <Text
            fontSize="xs"
            color="fg.muted"
            textTransform="uppercase"
            letterSpacing="wide"
            mt={4}
            mb={2}
          >
            History (last {history.length})
          </Text>
          {!metadata.alias ? (
            <Text fontSize="xs" color="fg.subtle">
              Set an alias to start tracking run history.
            </Text>
          ) : history.length === 0 ? (
            <Text fontSize="xs" color="fg.subtle">
              No runs yet.
            </Text>
          ) : (
            <>
              <Box>
                {history.map((entry) => {
                  const dot =
                    entry.outcome === "success" && entry.status
                      ? statusDotColor(entry.status)
                      : entry.outcome === "cancelled"
                        ? "gray.400"
                        : "red.500";
                  return (
                    <Flex
                      key={entry.id}
                      align="center"
                      gap={2}
                      py={1}
                      fontSize="xs"
                      fontFamily="mono"
                      color="fg.muted"
                      borderBottomWidth="1px"
                      borderColor="border.muted"
                      _last={{ borderBottomWidth: 0 }}
                    >
                      <Box w={1.5} h={1.5} borderRadius="full" bg={dot} />
                      <Text>{entry.method}</Text>
                      <Text>{entry.status ?? "—"}</Text>
                      <Text>{entry.elapsed_ms ?? 0}ms</Text>
                      <Box flex={1} />
                      <Text color="fg.subtle">
                        {relativeTimeAgo(new Date(entry.ran_at)) ?? ""}
                      </Text>
                    </Flex>
                  );
                })}
              </Box>
              <Box mt={2}>
                <Button
                  size="2xs"
                  variant="ghost"
                  onClick={onPurgeHistory}
                >
                  Clear history
                </Button>
              </Box>
            </>
          )}

          <Box mt={6} pt={4} borderTopWidth="1px" borderColor="border.muted">
            <Button
              size="sm"
              colorPalette="red"
              variant="outline"
              w="full"
              onClick={onDelete}
            >
              <LuTrash2 /> Delete block
            </Button>
          </Box>
        </Box>
      </Box>
    </Portal>
  );
}

// ─────────────────────── Main panel ───────────────────────

export const HttpFencedPanel = memo(function HttpFencedPanel({
  blockId,
  block,
  entry,
  view,
  filePath,
}: HttpFencedPanelProps) {
  const parsed = useMemo(() => parseBody(block.body), [block.body]);
  const host = useMemo(() => deriveHost(parsed.url), [parsed.url]);

  const [executionState, setExecutionState] = useState<ExecutionState>("idle");
  const [response, setResponse] = useState<HttpResponseFull | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [cached, setCached] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  // Tick incremented on every successful insert + on drawer-open so the
  // drawer's `useEffect` re-fetches without us coupling its dependency
  // array to a fast-changing array reference.
  const [historyRefreshTick, setHistoryRefreshTick] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  // Hydrate from cache on mount / body change. Mutations are skipped:
  // re-running a destructive POST without a fresh user click is unsafe.
  useEffect(() => {
    if (MUTATION_METHODS.has(parsed.method)) return;
    if (!parsed.url || !parsed.url.trim()) return;
    let cancelled = false;
    void (async () => {
      try {
        const envVars = await useEnvironmentStore
          .getState()
          .getActiveVariables();
        const hash = await computeHttpCacheHash(
          {
            method: parsed.method,
            url: parsed.url,
            params: parsed.params
              .filter((p) => p.enabled)
              .map((p) => ({ key: p.key, value: p.value })),
            headers: parsed.headers
              .filter((h) => h.enabled)
              .map((h) => ({ key: h.key, value: h.value })),
            body: parsed.body,
          },
          envVars,
        );
        const hit = await getBlockResult(filePath, hash);
        if (cancelled || !hit) return;
        try {
          const stored = JSON.parse(hit.response) as unknown;
          const norm = normalizeHttpResponse(stored);
          setResponse(norm);
          setExecutionState("success");
          setDurationMs(norm.elapsed_ms || hit.elapsed_ms);
          setLastRunAt(hit.executed_at ? new Date(hit.executed_at) : null);
          setCached(true);
        } catch {
          // Ignore corrupt cache entries.
        }
      } catch {
        // Cache lookup is best-effort.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [parsed, filePath]);

  /** Persist a row in `block_run_history`. Best-effort: a write failure
   * (e.g. SQLite locked momentarily) doesn't block the user from seeing
   * the response. The drawer history list is the only consumer; missing
   * a row is at most an aesthetic miss. */
  const recordHistory = useCallback(
    async (info: {
      method: string;
      url: string;
      status: number | null;
      requestSize: number | null;
      responseSize: number | null;
      elapsedMs: number;
      outcome: "success" | "error" | "cancelled";
    }) => {
      const alias = block.metadata.alias;
      if (!alias) return; // No alias → no stable key to bucket history under.
      try {
        await insertBlockHistory({
          file_path: filePath,
          block_alias: alias,
          method: info.method,
          url_canonical: info.url,
          status: info.status,
          request_size: info.requestSize,
          response_size: info.responseSize,
          elapsed_ms: info.elapsedMs,
          outcome: info.outcome,
        });
        setHistoryRefreshTick((t) => t + 1);
      } catch {
        /* Best-effort. */
      }
    },
    [block.metadata.alias, filePath],
  );

  const runBlock = useCallback(async () => {
    if (executionState === "running") return;
    if (!parsed.url || !parsed.url.trim()) {
      setError("URL is required");
      setExecutionState("error");
      return;
    }

    setError(null);
    setCached(false);
    setExecutionState("running");
    const abort = new AbortController();
    abortRef.current = abort;

    const executionId = `http_${blockId}_${Date.now()}`;
    const startedAt = performance.now();

    try {
      const blocksAbove = await collectBlocksAboveCM(
        view.state.doc,
        block.from,
        filePath,
      );
      const envVars = await useEnvironmentStore
        .getState()
        .getActiveVariables();

      const resolveText = (text: string) =>
        resolveAllReferences(text, blocksAbove, block.from, envVars).resolved;

      const { params, errors: paramErrors } = buildExecutorParams(
        parsed,
        resolveText,
        block.metadata.timeoutMs,
      );

      if (paramErrors.length > 0) {
        setError(paramErrors.join("\n"));
        setExecutionState("error");
        setDurationMs(Math.round(performance.now() - startedAt));
        return;
      }

      const outcome = await executeHttpStreamed({
        executionId,
        params,
        signal: abort.signal,
      });
      const elapsed = Math.round(performance.now() - startedAt);

      if (outcome.status === "cancelled") {
        setExecutionState("cancelled");
        setDurationMs(elapsed);
        // History: record cancelled runs too so the drawer reflects reality.
        void recordHistory({
          method: parsed.method,
          url: parsed.url,
          status: null,
          requestSize: parsed.body.length || null,
          responseSize: null,
          elapsedMs: elapsed,
          outcome: "cancelled",
        });
        return;
      }
      if (outcome.status === "error") {
        setError(outcome.message);
        setExecutionState("error");
        setDurationMs(elapsed);
        void recordHistory({
          method: parsed.method,
          url: parsed.url,
          status: null,
          requestSize: parsed.body.length || null,
          responseSize: null,
          elapsedMs: elapsed,
          outcome: "error",
        });
        return;
      }

      setResponse(outcome.response);
      setDurationMs(outcome.response.elapsed_ms || elapsed);
      setExecutionState("success");
      setLastRunAt(new Date());

      void recordHistory({
        method: parsed.method,
        url: parsed.url,
        status: outcome.response.status_code,
        requestSize: parsed.body.length || null,
        responseSize: outcome.response.size_bytes,
        elapsedMs: outcome.response.elapsed_ms || elapsed,
        outcome: "success",
      });

      // Persist to cache. Mutations re-execute every time, so we never
      // store them — saves disk and avoids serving a stale POST result.
      if (!MUTATION_METHODS.has(parsed.method)) {
        try {
          const hash = await computeHttpCacheHash(
            {
              method: parsed.method,
              url: parsed.url,
              params: parsed.params
                .filter((p) => p.enabled)
                .map((p) => ({ key: p.key, value: p.value })),
              headers: parsed.headers
                .filter((h) => h.enabled)
                .map((h) => ({ key: h.key, value: h.value })),
              body: parsed.body,
            },
            envVars,
          );
          await saveBlockResult(
            filePath,
            hash,
            "success",
            JSON.stringify(outcome.response),
            outcome.response.elapsed_ms || elapsed,
            null,
          );
        } catch {
          // Cache write is best-effort.
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setExecutionState("error");
    } finally {
      abortRef.current = null;
    }
  }, [
    block.from,
    block.metadata.timeoutMs,
    blockId,
    executionState,
    filePath,
    parsed,
    recordHistory,
    view,
  ]);

  const cancelBlock = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const onOpenSettings = useCallback(() => {
    setDrawerOpen(true);
    setHistoryRefreshTick((t) => t + 1);
  }, []);

  // Load history rows when the drawer is open or a fresh row is inserted.
  useEffect(() => {
    if (!drawerOpen) return;
    const alias = block.metadata.alias;
    if (!alias) {
      setHistoryEntries([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listBlockHistory(filePath, alias);
        if (!cancelled) setHistoryEntries(rows);
      } catch {
        if (!cancelled) setHistoryEntries([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [drawerOpen, filePath, block.metadata.alias, historyRefreshTick]);

  /**
   * Pre-computed snippets per format, refreshed whenever the parsed body
   * or environment context changes. We have to pre-compute because the
   * browser's clipboard API requires a *user gesture* — `await`-ing on
   * `collectBlocksAboveCM` / `getActiveVariables` inside the click handler
   * loses that gesture context and the call silently fails. Holding the
   * resolved snippets in state lets the click handler call `writeText`
   * synchronously inside the gesture window.
   */
  const [snippets, setSnippets] = useState<Record<SendAsFormat, string> | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const blocksAbove = await collectBlocksAboveCM(
          view.state.doc,
          block.from,
          filePath,
        );
        const envVars = await useEnvironmentStore
          .getState()
          .getActiveVariables();
        if (cancelled) return;
        const resolveText = (text: string) =>
          resolveAllReferences(text, blocksAbove, block.from, envVars).resolved;
        const resolved = {
          method: parsed.method,
          url: resolveText(parsed.url),
          params: parsed.params.map((p) => ({
            ...p,
            key: resolveText(p.key),
            value: resolveText(p.value),
          })),
          headers: parsed.headers.map((h) => ({
            ...h,
            key: resolveText(h.key),
            value: resolveText(h.value),
          })),
          body: parsed.body ? resolveText(parsed.body) : "",
        };
        if (cancelled) return;
        setSnippets({
          curl: toCurl(resolved),
          fetch: toFetch(resolved),
          python: toPython(resolved),
          httpie: toHTTPie(resolved),
          "http-file": toHttpFile(resolved),
        });
      } catch {
        if (!cancelled) setSnippets(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [block.from, filePath, parsed, view.state.doc]);

  const handleSendAs = useCallback(
    (format: SendAsFormat) => {
      const snippet = snippets?.[format];
      if (!snippet) return;

      if (format === "http-file") {
        // Save dialog flow can run async — no clipboard gesture to preserve.
        void (async () => {
          try {
            const defaultName = `${block.metadata.alias ?? "request"}.http`;
            const path = await saveDialog({
              defaultPath: defaultName,
              filters: [
                { name: "HTTP request", extensions: ["http", "rest"] },
              ],
            });
            if (!path) return;
            await writeFile(path, new TextEncoder().encode(snippet));
          } catch (e) {
            window.alert(
              `Failed to save: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        })();
        return;
      }

      // Synchronous call from inside the click handler — gesture context
      // is still active here.
      navigator.clipboard.writeText(snippet).catch(() => {
        /* clipboard denied — user can retry */
      });
    },
    [block.metadata.alias, snippets],
  );

  const copyAsCurl = useCallback(() => {
    handleSendAs("curl");
  }, [handleSendAs]);

  useEffect(() => {
    setHttpBlockActions(blockId, {
      onRun: () => void runBlock(),
      onCancel: cancelBlock,
      onOpenSettings,
      onCopyAsCurl: copyAsCurl,
    });
  }, [blockId, runBlock, cancelBlock, onOpenSettings, copyAsCurl]);

  // Cancel any in-flight run if the panel unmounts or the abort controller
  // is reset (e.g. block id changes after a doc-level edit).
  useEffect(() => {
    return () => {
      const abort = abortRef.current;
      if (abort) abort.abort();
      void cancelBlockExecution(`http_${blockId}`);
    };
  }, [blockId]);

  // ── Drawer actions ──
  const updateMetadata = useCallback(
    (patch: Partial<HttpBlockMetadata>) => {
      const next: HttpBlockMetadata = { ...block.metadata, ...patch };
      const infoText = stringifyHttpFenceInfo(next);
      const openLine = view.state.doc.lineAt(block.openLineFrom);
      view.dispatch({
        changes: {
          from: openLine.from,
          to: openLine.to,
          insert: "```" + infoText,
        },
      });
    },
    [block.metadata, block.openLineFrom, view],
  );

  const deleteBlockFromDoc = useCallback(() => {
    const from = block.from;
    const to = Math.min(block.to + 1, view.state.doc.length);
    view.dispatch({ changes: { from, to, insert: "" } });
    setDrawerOpen(false);
  }, [block.from, block.to, view]);

  /** Save the current response body as a variable in the active environment.
   * Uses `window.prompt` to ask for a key; default suggestion is the block
   * alias + `_response`. Body is stringified — JSON values become indented
   * JSON, scalars become their text. No-op if there's no active env. */
  const saveBodyAsVariable = useCallback(async () => {
    if (!response) return;
    const env = useEnvironmentStore.getState().activeEnvironment;
    if (!env) {
      window.alert(
        "No active environment. Create or activate one before saving.",
      );
      return;
    }
    const suggested = `${block.metadata.alias ?? "response"}_body`;
    const key = window.prompt("Variable name:", suggested);
    if (!key) return;
    const value =
      typeof response.body === "string"
        ? response.body
        : JSON.stringify(response.body);
    try {
      await useEnvironmentStore.getState().setVariable(env.id, key, value);
    } catch (e) {
      window.alert(
        `Failed to save variable: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }, [block.metadata.alias, response]);

  // ── Form-mode editing: re-emit raw body whenever the form changes ──
  const replaceBody = useCallback(
    (nextRaw: string) => {
      // bodyFrom is the start of the first body line; bodyTo is end of the
      // last body line. Replace the whole range with the new canonical raw.
      view.dispatch({
        changes: {
          from: block.bodyFrom,
          to: block.bodyTo,
          insert: nextRaw,
        },
      });
    },
    [block.bodyFrom, block.bodyTo, view],
  );

  const onFormChange = useCallback(
    (next: HttpMessageParsed) => {
      replaceBody(stringifyHttpMessageBody(next));
    },
    [replaceBody],
  );

  const onToggleMode = useCallback(
    (next: "raw" | "form") => {
      if (next === (block.metadata.mode ?? "raw")) return;
      // Persist mode in the info string. Default raw is omitted; form is
      // explicit. Re-stringify the body too so toggling raw → form → raw
      // is a fixed point (canonical reformat).
      const reformatted = stringifyHttpMessageBody(parsed);
      // If the mode changed, also reformat the body to keep the contract
      // "form re-parses raw on each flip" idempotent.
      if (reformatted !== block.body) {
        replaceBody(reformatted);
      }
      const meta: HttpBlockMetadata = {
        ...block.metadata,
        mode: next === "raw" ? undefined : "form",
      };
      const infoText = stringifyHttpFenceInfo(meta);
      const openLine = view.state.doc.lineAt(block.openLineFrom);
      view.dispatch({
        changes: {
          from: openLine.from,
          to: openLine.to,
          insert: "```" + infoText,
        },
      });
    },
    [
      block.body,
      block.metadata,
      block.openLineFrom,
      parsed,
      replaceBody,
      view,
    ],
  );

  const toolbarNode = entry.toolbar;
  const formNode = entry.form;
  const resultNode = entry.result;
  const statusbarNode = entry.statusbar;
  const currentMode: "raw" | "form" = block.metadata.mode === "form" ? "form" : "raw";

  return (
    <>
      {toolbarNode &&
        createPortal(
          <HttpToolbar
            alias={block.metadata.alias}
            method={parsed.method}
            host={host}
            mode={currentMode}
            executionState={executionState}
            onRun={() => void runBlock()}
            onCancel={cancelBlock}
            onOpenSettings={onOpenSettings}
            onToggleMode={onToggleMode}
          />,
          toolbarNode,
        )}

      {formNode &&
        createPortal(
          <HttpFormPanel parsed={parsed} onChange={onFormChange} />,
          formNode,
        )}

      {resultNode &&
        createPortal(
          <HttpResult
            executionState={executionState}
            response={response}
            error={error}
            cached={cached}
            onSaveBodyAsVariable={saveBodyAsVariable}
          />,
          resultNode,
        )}

      {statusbarNode &&
        createPortal(
          <HttpStatusBar
            alias={block.metadata.alias}
            host={host}
            executionState={executionState}
            response={response}
            durationMs={durationMs}
            cached={cached}
            lastRunAt={lastRunAt}
            onSendAs={handleSendAs}
          />,
          statusbarNode,
        )}

      {drawerOpen && (
        <HttpDrawer
          metadata={block.metadata}
          history={historyEntries}
          onClose={() => setDrawerOpen(false)}
          onUpdateMetadata={updateMetadata}
          onDelete={deleteBlockFromDoc}
          onPurgeHistory={async () => {
            const alias = block.metadata.alias;
            if (!alias) return;
            try {
              await purgeBlockHistory(filePath, alias);
              setHistoryRefreshTick((t) => t + 1);
            } catch {
              /* Best-effort. */
            }
          }}
        />
      )}
    </>
  );
});
