/**
 * React panel for a db-* fenced block (stage 5 of the redesign).
 *
 * Lives outside CM6's document flow: the CM extension `cm-db-block.tsx`
 * registers three container divs per block (toolbar, result, statusbar),
 * and this component mounts React into each via `createPortal`. The
 * settings drawer uses a Chakra Portal anchored to document.body (not
 * Dialog — would trap focus away from CM6).
 *
 * Execution runs through `executeDbStreamed` from stage 3. Results are
 * persisted to the SQLite block-result cache (hashed by query + connection
 * + limit + env-snapshot placeholder) so block references
 * (`{{alias.response.col}}`) continue to work across reloads.
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
  LuDownload,
  LuPlay,
  LuSettings,
  LuSquare,
  LuX,
} from "react-icons/lu";
import { EditorView } from "@codemirror/view";

import {
  setDbBlockActions,
  type DbPortalEntry,
} from "@/lib/codemirror/cm-db-block";
import {
  parseLegacyDbBody,
  stringifyDbFenceInfo,
  type DbBlockMetadata,
  type DbDisplayMode,
} from "@/lib/blocks/db-fence";
import {
  executeDbStreamed,
  cancelBlockExecution,
} from "@/lib/tauri/streamedExecution";
import {
  firstSelectResult,
  type DbResponse,
} from "@/components/blocks/db/types";
import { ResultTable } from "@/components/blocks/db/ResultTable";
import { hashBlockContent } from "@/lib/blocks/hash";
import {
  getBlockResult,
  saveBlockResult,
} from "@/lib/tauri/commands";
import {
  listConnections,
  updateConnection,
  type Connection,
} from "@/lib/tauri/connections";
import { resolveRefsToBindParams } from "@/lib/blocks/references";
import { collectBlocksAboveCM } from "@/lib/blocks/document";
import { resolveConnectionIdentifier } from "@/lib/blocks/connection-resolve";
import { describeDangerousQuery } from "@/lib/blocks/sql-mutation";
import {
  toCsv,
  toJson,
  toMarkdown,
  toInserts,
  inferTableName,
  hasExportableRows,
} from "@/lib/blocks/db-export";
import { useEnvironmentStore } from "@/stores/environment";
import { useSchemaCacheStore } from "@/stores/schemaCache";

interface DbFencedPanelProps {
  blockId: string;
  /** Current block metadata — read from the registry each render.
   *  Passed separately from `entry` so React.memo can detect updates. */
  block: DbPortalEntry["block"];
  entry: DbPortalEntry;
  view: EditorView;
  filePath: string;
}

type ExecutionState = "idle" | "running" | "success" | "error" | "cancelled";

// ───── Cache hash helper ─────

/**
 * Build the cache hash key for a db block run. Includes an env snapshot of
 * only the env vars actually referenced by the query, so two different
 * active environments never share a cached row — and so a query that
 * doesn't use any envs has the same hash across environments.
 */
async function computeDbCacheHash(
  body: string,
  connectionId: string,
  envVars: Record<string, string>,
): Promise<string> {
  const usedEnvEntries = Object.entries(envVars)
    .filter(([k]) => body.includes(`{{${k}}}`))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const keyed = usedEnvEntries
    ? `${body}\n__ENV__\n${usedEnvEntries}`
    : body;
  return hashBlockContent(keyed, connectionId);
}

// ───── Main panel ─────

export const DbFencedPanel = memo(function DbFencedPanel({
  blockId,
  block,
  entry,
  view,
  filePath,
}: DbFencedPanelProps) {
  const [executionState, setExecutionState] =
    useState<ExecutionState>("idle");
  const [response, setResponse] = useState<DbResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [cached, setCached] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  /** When set, blocks execution behind a user confirmation. The stored
   *  `continueRun` callback runs the query for real if the user accepts. */
  const [pendingConfirm, setPendingConfirm] = useState<{
    reason: string;
    continueRun: () => void;
  } | null>(null);
  /** Milliseconds elapsed since the current run started; drives the live
   *  timer shown in the result panel during execution. Reset to 0 when
   *  not running. */
  const [liveElapsedMs, setLiveElapsedMs] = useState(0);
  /**
   * Last-execution bindings: `{{ref.raw}} → resolved value`. Shown in the
   * drawer's Resolved bindings panel so users can debug what the driver
   * actually received.
   */
  const [resolvedBindings, setResolvedBindings] = useState<
    { placeholder: string; raw: string; value: unknown }[]
  >([]);
  // Load-more dedup guard. A ref (not state) so clicking the button does
  // not trigger a re-render of the panel — the setResponse that appends
  // the new rows is the only render needed.
  const loadingMoreRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const activeConnection = useMemo(
    () => resolveConnectionIdentifier(connections, block.metadata.connection),
    [connections, block.metadata.connection],
  );

  // Load connections once
  useEffect(() => {
    listConnections().then(setConnections).catch(() => {});
  }, []);

  // Warm the schema cache so SQL autocomplete (tables/columns) is ready
  // without the user having to wait for the first keystroke to fire.
  useEffect(() => {
    if (!activeConnection?.id) return;
    void useSchemaCacheStore.getState().ensureLoaded(activeConnection.id);
  }, [activeConnection?.id]);

  // Live elapsed timer for running state. Ticks every 100ms; stops when
  // the execution leaves the running state. Cheap since only one block
  // can be running per panel instance.
  useEffect(() => {
    if (executionState !== "running") {
      setLiveElapsedMs(0);
      return;
    }
    const startedAt = performance.now();
    const id = window.setInterval(() => {
      setLiveElapsedMs(Math.round(performance.now() - startedAt));
    }, 100);
    return () => {
      window.clearInterval(id);
    };
  }, [executionState]);

  // ── Legacy JSON body conversion ──
  // Vaults written before stage 4 store a JSON object in the body instead
  // of raw SQL. Convert the block in-place on the document: replace the
  // body with the extracted query and merge connection/limit/timeout into
  // the info string. This runs at most once per (blockId + body-hash)
  // combination to prevent re-entry after the dispatch mutates the doc.
  const migratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (migratedRef.current === block.body) return;
    const legacy = parseLegacyDbBody(block.body);
    if (!legacy) return;
    migratedRef.current = block.body;

    const mergedMetadata: DbBlockMetadata = { ...block.metadata };
    if (legacy.connectionId && !mergedMetadata.connection) {
      mergedMetadata.connection = legacy.connectionId;
    }
    if (legacy.limit !== undefined && mergedMetadata.limit === undefined) {
      mergedMetadata.limit = legacy.limit;
    }
    if (
      legacy.timeoutMs !== undefined &&
      mergedMetadata.timeoutMs === undefined
    ) {
      mergedMetadata.timeoutMs = legacy.timeoutMs;
    }

    const newInfoLine = "```" + stringifyDbFenceInfo(mergedMetadata);
    const openLine = view.state.doc.lineAt(block.openLineFrom);

    // Replace the open fence (to update info) AND the body (to turn JSON
    // into raw SQL), leaving fence close untouched.
    view.dispatch({
      changes: [
        {
          from: openLine.from,
          to: openLine.to,
          insert: newInfoLine,
        },
        {
          from: block.bodyFrom,
          to: block.bodyTo,
          insert: legacy.query,
        },
      ],
    });
  }, [block.body, block.bodyFrom, block.bodyTo, block.metadata, block.openLineFrom, view]);

  // Load cached result on mount / when block body + connection change
  useEffect(() => {
    if (!filePath) return;
    const connId = activeConnection?.id ?? block.metadata.connection ?? "";
    if (!connId || !block.body.trim()) return;

    let cancelled = false;
    (async () => {
      try {
        const envVars = await useEnvironmentStore
          .getState()
          .getActiveVariables();
        const hash = await computeDbCacheHash(block.body, connId, envVars);
        const row = await getBlockResult(filePath, hash);
        if (cancelled || !row) return;
        const parsed = JSON.parse(row.response) as DbResponse;
        setResponse(parsed);
        setDurationMs(row.elapsed_ms ?? null);
        setCached(true);
        if (row.status === "success") setExecutionState("success");
        else setExecutionState("error");
      } catch {
        // Cache miss or corrupt — stay idle.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filePath, block.body, activeConnection?.id, block.metadata.connection]);

  // ── Execution ──
  // Internal: actually dispatches the backend call. `runBlock` (below)
  // applies read-only / unscoped-mutation gating before calling this.
  const executeRun = useCallback(async () => {
    if (executionState === "running") return;
    const connId = activeConnection?.id;
    if (!connId) {
      setError("No connection selected — open settings and pick one.");
      setExecutionState("error");
      return;
    }
    if (!block.body.trim()) {
      setError("Query is empty.");
      setExecutionState("error");
      return;
    }

    setError(null);
    setCached(false);
    setExecutionState("running");
    const abort = new AbortController();
    abortRef.current = abort;

    const executionId = `db_${blockId}_${Date.now()}`;
    const startedAt = performance.now();

    try {
      // ── Resolve {{ref}} references into bind params ──
      // Collect blocks above (for {{alias.response.col}} resolution) and
      // the active environment's variables (for {{ENV_KEY}}).
      const blocksAbove = await collectBlocksAboveCM(
        view.state.doc,
        block.from,
        filePath,
      );
      const envVars = await useEnvironmentStore
        .getState()
        .getActiveVariables();

      const { sql, bindValues, errors: refErrors } = resolveRefsToBindParams(
        block.body,
        blocksAbove,
        block.from,
        envVars,
      );
      if (refErrors.length > 0) {
        setError(`Reference errors:\n${refErrors.join("\n")}`);
        setExecutionState("error");
        return;
      }

      // Capture the resolved mapping so the drawer can display it.
      const rawRefs = Array.from(block.body.matchAll(/\{\{([^}]+)\}\}/g));
      const bindingsForDrawer = rawRefs.map((m, i) => ({
        placeholder: `$${i + 1}`,
        raw: m[0],
        value: bindValues[i],
      }));
      setResolvedBindings(bindingsForDrawer);

      const params: Record<string, unknown> = {
        connection_id: connId,
        query: sql,
        bind_values: bindValues,
        offset: 0,
        fetch_size: block.metadata.limit ?? 100,
      };
      if (block.metadata.timeoutMs !== undefined) {
        params.timeout_ms = block.metadata.timeoutMs;
      }

      const outcome = await executeDbStreamed({
        executionId,
        params,
        signal: abort.signal,
      });
      const elapsed = Math.round(performance.now() - startedAt);

      if (outcome.status === "cancelled") {
        setExecutionState("cancelled");
        setDurationMs(elapsed);
        return;
      }
      if (outcome.status === "error") {
        setError(outcome.message);
        setExecutionState("error");
        setDurationMs(elapsed);
        return;
      }

      setResponse(outcome.response);
      setDurationMs(outcome.response.stats.elapsed_ms || elapsed);
      setExecutionState("success");

      // Persist to cache. Hash key includes env snapshot so different
      // environments don't share cache entries for the same query.
      try {
        const hash = await computeDbCacheHash(block.body, connId, envVars);
        const sel = firstSelectResult(outcome.response);
        await saveBlockResult(
          filePath,
          hash,
          "success",
          JSON.stringify(outcome.response),
          outcome.response.stats.elapsed_ms || elapsed,
          sel ? sel.rows.length : null,
        );
      } catch {
        // Cache write is best-effort.
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setExecutionState("error");
    } finally {
      abortRef.current = null;
    }
  }, [
    activeConnection?.id,
    block.body,
    block.from,
    block.metadata.limit,
    block.metadata.timeoutMs,
    blockId,
    executionState,
    filePath,
    view,
  ]);

  /**
   * Guard the execute with a confirmation prompt when the query is a
   * mutation on a read-only connection, or an UPDATE/DELETE with no
   * WHERE. The prompt UI is a Portal + Box rendered below.
   */
  const runBlock = useCallback(() => {
    const reason = describeDangerousQuery(
      block.body,
      activeConnection?.is_readonly ?? false,
    );
    if (reason) {
      setPendingConfirm({
        reason,
        continueRun: () => {
          setPendingConfirm(null);
          void executeRun();
        },
      });
      return;
    }
    void executeRun();
  }, [block.body, activeConnection?.is_readonly, executeRun]);

  const cancelBlock = useCallback(() => {
    const abort = abortRef.current;
    if (abort) {
      abort.abort();
      abortRef.current = null;
    }
    // Best-effort: also tell the backend (in case abort raced).
    void cancelBlockExecution(`db_${blockId}`);
  }, [blockId]);

  // ── Load more: append the next page of rows to the current select
  // result. Uses the same query + bindings as the initial run, but with
  // offset = rows already fetched. The in-flight guard is a ref (not
  // state); ResultTable runs its own local loading state for the button
  // spinner so this callback doesn't force a panel re-render on click.
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current) return;
    const connId = activeConnection?.id;
    if (!connId || !response) return;
    const first = firstSelectResult(response);
    if (!first || !first.has_more) return;

    loadingMoreRef.current = true;
    try {
      const blocksAbove = await collectBlocksAboveCM(
        view.state.doc,
        block.from,
        filePath,
      );
      const envVars = await useEnvironmentStore
        .getState()
        .getActiveVariables();
      const { sql, bindValues } = resolveRefsToBindParams(
        block.body,
        blocksAbove,
        block.from,
        envVars,
      );

      const params: Record<string, unknown> = {
        connection_id: connId,
        query: sql,
        bind_values: bindValues,
        offset: first.rows.length,
        fetch_size: block.metadata.limit ?? 100,
      };
      if (block.metadata.timeoutMs !== undefined) {
        params.timeout_ms = block.metadata.timeoutMs;
      }

      const outcome = await executeDbStreamed({
        executionId: `db_${blockId}_more_${Date.now()}`,
        params,
      });
      if (outcome.status !== "success") return;

      const next = firstSelectResult(outcome.response);
      if (!next) return;

      setResponse((prev) => {
        if (!prev) return outcome.response;
        const prevFirst = firstSelectResult(prev);
        if (!prevFirst) return outcome.response;
        const idx = prev.results.findIndex((r) => r.kind === "select");
        const mergedFirst = {
          ...prevFirst,
          rows: [...prevFirst.rows, ...next.rows],
          has_more: next.has_more,
        };
        const mergedResults = [...prev.results];
        mergedResults[idx] = mergedFirst;
        return { ...prev, results: mergedResults };
      });
    } finally {
      loadingMoreRef.current = false;
    }
  }, [
    activeConnection?.id,
    block.body,
    block.from,
    block.metadata.limit,
    block.metadata.timeoutMs,
    blockId,
    filePath,
    response,
    view,
  ]);

  // Register actions with the registry so ⌘↵ / ⌘. can dispatch
  useEffect(() => {
    setDbBlockActions(blockId, {
      onRun: runBlock,
      onCancel: cancelBlock,
      onOpenSettings: () => setDrawerOpen(true),
    });
  }, [blockId, runBlock, cancelBlock]);

  // ── Info-string editing (drawer) ──
  const updateMetadata = useCallback(
    (patch: Partial<DbBlockMetadata>) => {
      const next: DbBlockMetadata = { ...block.metadata, ...patch };
      // Re-stringify and dispatch a change that rewrites only the info string
      // portion of the open fence line.
      const infoText = stringifyDbFenceInfo(next);
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
    // Remove the entire block range plus its trailing newline (if any) so
    // we don't leave a blank line in its place.
    const from = block.from;
    const to = Math.min(block.to + 1, view.state.doc.length);
    view.dispatch({ changes: { from, to, insert: "" } });
    setDrawerOpen(false);
  }, [block.from, block.to, view]);

  // ── Portals ──

  const toolbarNode = entry.toolbar;
  const resultNode = entry.result;
  const statusbarNode = entry.statusbar;

  return (
    <>
      {toolbarNode &&
        createPortal(
          <DbToolbar
            metadata={block.metadata}
            activeConnection={activeConnection}
            executionState={executionState}
            onRun={runBlock}
            onCancel={cancelBlock}
            onOpenSettings={() => setDrawerOpen(true)}
          />,
          toolbarNode,
        )}

      {resultNode &&
        createPortal(
          <DbResult
            executionState={executionState}
            response={response}
            error={error}
            cached={cached}
            liveElapsedMs={liveElapsedMs}
            connection={activeConnection?.name ?? block.metadata.connection}
            onCancel={cancelBlock}
            onLoadMore={loadMore}
          />,
          resultNode,
        )}

      {statusbarNode &&
        createPortal(
          <DbStatusBar
            connection={activeConnection?.name ?? block.metadata.connection}
            durationMs={durationMs}
            executionState={executionState}
            response={response}
            cached={cached}
            query={block.body}
            alias={block.metadata.alias}
          />,
          statusbarNode,
        )}

      {drawerOpen && (
        <DbDrawer
          metadata={block.metadata}
          connections={connections}
          activeConnection={activeConnection}
          resolvedBindings={resolvedBindings}
          onClose={() => setDrawerOpen(false)}
          onUpdate={updateMetadata}
          onDelete={deleteBlockFromDoc}
          onConnectionsChanged={setConnections}
        />
      )}

      {pendingConfirm && (
        <ConfirmRunDialog
          reason={pendingConfirm.reason}
          onCancel={() => setPendingConfirm(null)}
          onConfirm={pendingConfirm.continueRun}
        />
      )}
    </>
  );
});

// ───── Toolbar ─────

interface DbToolbarProps {
  metadata: DbBlockMetadata;
  activeConnection: Connection | null;
  executionState: ExecutionState;
  onRun: () => void;
  onCancel: () => void;
  onOpenSettings: () => void;
}

function DbToolbar({
  metadata,
  activeConnection,
  executionState,
  onRun,
  onCancel,
  onOpenSettings,
}: DbToolbarProps) {
  const running = executionState === "running";
  const dialectLabel = metadata.dialect.toLowerCase();
  const connLabel =
    activeConnection?.name ?? metadata.connection ?? undefined;

  return (
    <Flex
      className="cm-db-toolbar"
      gap={3}
      align="center"
      justify="space-between"
      minW={0}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Identity row — [DB] alias / connection [dialect-pill]. Text stays
          at 14/13px so it never competes with the SQL below; the visual
          hierarchy (alias > connection > dialect) comes from colour +
          weight, not font size. */}
      <HStack gap={3} align="center" minW={0} flex="1" overflow="hidden">
        <Badge
          colorPalette="blue"
          variant="solid"
          size="sm"
          flexShrink={0}
          fontFamily="mono"
          letterSpacing="0.05em"
          px={2}
          py={1}
          rounded="md"
        >
          DB
        </Badge>
        {metadata.alias && (
          <Text
            fontSize="14px"
            fontFamily="heading"
            fontWeight="700"
            whiteSpace="nowrap"
            overflow="hidden"
            textOverflow="ellipsis"
            flexShrink={1}
            minW={0}
            letterSpacing="-0.01em"
          >
            {metadata.alias}
          </Text>
        )}
        {connLabel && (
          <>
            <Box
              as="span"
              flexShrink={0}
              color="fg.muted"
              opacity={0.4}
              fontSize="sm"
              fontWeight="300"
            >
              /
            </Box>
            <Text
              fontSize="13px"
              fontFamily="heading"
              fontWeight="500"
              color="fg.muted"
              whiteSpace="nowrap"
              overflow="hidden"
              textOverflow="ellipsis"
              minW={0}
              flexShrink={1}
            >
              {connLabel}
            </Text>
          </>
        )}
        <Badge
          size="xs"
          variant="subtle"
          colorPalette="gray"
          flexShrink={0}
          fontFamily="mono"
          fontWeight="500"
          textTransform="lowercase"
          letterSpacing="0.02em"
          px={2}
          py={0.5}
          rounded="md"
        >
          {dialectLabel}
        </Badge>
      </HStack>

      {/* Actions — icon-only ghost buttons matching the HTTP block pattern.
          Run is colour-only (green icon), cancel inherits red. Settings
          uses the muted fg pair so it recedes visually. */}
      <HStack gap={0} flexShrink={0}>
        {running ? (
          <IconButton
            size="xs"
            variant="ghost"
            colorPalette="red"
            aria-label="Cancel"
            onClick={onCancel}
            title="Cancel (⌘.)"
          >
            <LuSquare />
          </IconButton>
        ) : (
          <IconButton
            size="xs"
            variant="ghost"
            colorPalette="green"
            aria-label="Run"
            onClick={onRun}
            title="Run (⌘↵)"
            disabled={!activeConnection}
          >
            <LuPlay />
          </IconButton>
        )}
        <IconButton
          size="xs"
          variant="ghost"
          colorPalette="gray"
          aria-label="Settings"
          onClick={onOpenSettings}
          title="Settings"
        >
          <LuSettings />
        </IconButton>
      </HStack>
    </Flex>
  );
}

// ───── Export menu ─────

interface ExportMenuProps {
  response: DbResponse | null;
  query: string;
  alias: string | undefined;
}

type ExportFormat = "csv" | "json" | "markdown" | "insert";

function ExportMenu({ response, query, alias }: ExportMenuProps) {
  const select = response ? firstSelectResult(response) : null;
  const canExport = select !== null && hasExportableRows(select);

  const buildPayload = useCallback(
    (format: ExportFormat): { text: string; extension: string } | null => {
      if (!select) return null;
      const tableName = inferTableName(query) ?? alias ?? "";
      switch (format) {
        case "csv":
          return { text: toCsv(select), extension: "csv" };
        case "json":
          return { text: toJson(select), extension: "json" };
        case "markdown":
          return { text: toMarkdown(select), extension: "md" };
        case "insert":
          return { text: toInserts(select, tableName), extension: "sql" };
      }
    },
    [select, query, alias],
  );

  const copy = useCallback(
    async (format: ExportFormat) => {
      const payload = buildPayload(format);
      if (!payload) return;
      try {
        await navigator.clipboard.writeText(payload.text);
      } catch {
        // Clipboard denied — user can retry via "Save to file".
      }
    },
    [buildPayload],
  );

  const save = useCallback(
    async (format: ExportFormat) => {
      const payload = buildPayload(format);
      if (!payload) return;
      try {
        const [{ save: saveDialog }, { writeTextFile }] = await Promise.all([
          import("@tauri-apps/plugin-dialog"),
          import("@tauri-apps/plugin-fs"),
        ]);
        const base = alias?.trim() || "query-result";
        const path = await saveDialog({
          defaultPath: `${base}.${payload.extension}`,
          filters: [
            {
              name: payload.extension.toUpperCase(),
              extensions: [payload.extension],
            },
          ],
        });
        if (!path) return;
        await writeTextFile(path, payload.text);
      } catch {
        // User cancelled or Tauri plugin unavailable — silently drop.
      }
    },
    [buildPayload, alias],
  );

  return (
    <Menu.Root positioning={{ placement: "bottom-end" }}>
      <Menu.Trigger asChild>
        <IconButton
          size="xs"
          variant="ghost"
          colorPalette="gray"
          aria-label="Export result"
          title="Export result"
          disabled={!canExport}
        >
          <LuDownload />
        </IconButton>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content fontSize="xs" fontFamily="mono">
            <Menu.ItemGroup>
              <Menu.ItemGroupLabel fontSize="2xs" color="fg.muted">
                Copy
              </Menu.ItemGroupLabel>
              <Menu.Item value="copy-csv" onSelect={() => copy("csv")}>
                CSV
              </Menu.Item>
              <Menu.Item value="copy-json" onSelect={() => copy("json")}>
                JSON
              </Menu.Item>
              <Menu.Item value="copy-markdown" onSelect={() => copy("markdown")}>
                Markdown
              </Menu.Item>
              <Menu.Item value="copy-insert" onSelect={() => copy("insert")}>
                INSERT
              </Menu.Item>
            </Menu.ItemGroup>
            <Menu.Separator />
            <Menu.ItemGroup>
              <Menu.ItemGroupLabel fontSize="2xs" color="fg.muted">
                Save as…
              </Menu.ItemGroupLabel>
              <Menu.Item value="save-csv" onSelect={() => save("csv")}>
                CSV file
              </Menu.Item>
              <Menu.Item value="save-json" onSelect={() => save("json")}>
                JSON file
              </Menu.Item>
              <Menu.Item value="save-markdown" onSelect={() => save("markdown")}>
                Markdown file
              </Menu.Item>
              <Menu.Item value="save-insert" onSelect={() => save("insert")}>
                INSERT .sql
              </Menu.Item>
            </Menu.ItemGroup>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}

// ───── Result panel ─────

interface DbResultProps {
  executionState: ExecutionState;
  response: DbResponse | null;
  error: string | null;
  cached: boolean;
  liveElapsedMs: number;
  connection: string | undefined;
  onCancel: () => void;
  onLoadMore: () => Promise<void> | void;
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function DbResult({
  executionState,
  response,
  error,
  cached,
  liveElapsedMs,
  connection,
  onCancel,
  onLoadMore,
}: DbResultProps) {
  // ── Running (first-run only): big live timer ──
  // If a response from a prior run exists we keep the table rendered so the
  // widget height stays stable — CM6 otherwise reflows the document and
  // yanks the scroll position on every re-run (success → running → success
  // used to flip the widget between ~380px and ~180px).
  if (executionState === "running" && !response) {
    return (
      <Flex
        className="cm-db-result"
        px={6}
        py={10}
        align="center"
        justify="center"
        direction="column"
        gap={4}
      >
        <HStack gap={3} align="baseline">
          <Spinner size="md" color="blue.400" />
          <Text
            fontSize="3xl"
            fontFamily="mono"
            fontWeight="bold"
            color="blue.400"
          >
            {formatElapsed(liveElapsedMs)}
          </Text>
        </HStack>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel (⌘.)
        </Button>
      </Flex>
    );
  }

  // ── Error from runtime (not a SQL error result) ──
  if (error) {
    return (
      <Box
        className="cm-db-result"
        px={6}
        py={5}
        color="red.500"
        fontSize="sm"
        fontFamily="mono"
      >
        {error}
      </Box>
    );
  }

  // ── Empty state: nothing has been run yet ──
  // Generous padding to echo the mockup's breathing room. Single-line
  // caption with a subtly styled keyboard shortcut.
  if (!response) {
    return (
      <Flex
        className="cm-db-result"
        px={6}
        py={10}
        align="center"
        justify="center"
      >
        <Text
          fontSize="sm"
          fontFamily="mono"
          color="fg.muted"
          opacity={0.75}
        >
          {connection ? (
            <>
              Hit{" "}
              <Box
                as="span"
                px={1.5}
                py={0.5}
                mx={1}
                color="fg"
                bg="blackAlpha.200"
                rounded="sm"
                fontSize="xs"
                fontWeight="600"
              >
                ⌘↵
              </Box>{" "}
              to query{" "}
              <Box as="span" color="fg" fontWeight="600">
                {connection}
              </Box>
            </>
          ) : (
            "Pick a connection in settings to run"
          )}
        </Text>
      </Flex>
    );
  }

  return (
    <DbResultTabs
      response={response}
      cached={cached}
      onLoadMore={onLoadMore}
    />
  );
}

// ───── Result tabs (Results · Messages · Plan · Stats) ─────

/**
 * Tabbed view of a DbResponse. When `results` has more than one entry, the
 * Results tab splits into numbered sub-tabs (1: SELECT · 2: UPDATE · …).
 * Messages / Plan / Stats always show, with placeholder content when empty.
 */
function DbResultTabs({
  response,
  cached,
  onLoadMore,
}: {
  response: DbResponse;
  cached: boolean;
  onLoadMore: () => Promise<void> | void;
}) {
  const messages = response.messages ?? [];
  const plan = response.plan;
  const hasResults = response.results.length > 0;

  return (
    <Tabs.Root
      defaultValue="results"
      size="sm"
      variant="line"
      className="cm-db-result"
    >
      <Tabs.List px={3} pt={1} borderBottom="1px solid" borderColor="border">
        <Tabs.Trigger value="results" fontSize="xs">
          Result{response.results.length > 1 ? `s (${response.results.length})` : ""}
        </Tabs.Trigger>
        <Tabs.Trigger value="messages" fontSize="xs">
          Messages{messages.length > 0 ? ` (${messages.length})` : ""}
        </Tabs.Trigger>
        <Tabs.Trigger value="plan" fontSize="xs">
          Plan
        </Tabs.Trigger>
        <Tabs.Trigger value="stats" fontSize="xs">
          Stats
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="results" p={0}>
        {!hasResults ? (
          <Box px={6} py={5} color="fg.muted" fontSize="sm">
            No results returned.
          </Box>
        ) : response.results.length === 1 ? (
          <DbSingleResultView
            result={response.results[0]}
            cached={cached}
            onLoadMore={onLoadMore}
          />
        ) : (
          <DbMultiResultView
            results={response.results}
            cached={cached}
            onLoadMore={onLoadMore}
          />
        )}
      </Tabs.Content>

      <Tabs.Content value="messages" px={3} py={3}>
        {messages.length === 0 ? (
          <Text fontSize="xs" color="fg.muted" fontFamily="mono">
            No backend messages for this run.
          </Text>
        ) : (
          <Box display="flex" flexDirection="column" gap={1}>
            {messages.map((m, i) => (
              <Flex
                key={i}
                gap={2}
                fontSize="xs"
                fontFamily="mono"
                align="baseline"
              >
                <Badge
                  size="xs"
                  variant="subtle"
                  colorPalette={
                    m.severity === "error"
                      ? "red"
                      : m.severity === "warning"
                        ? "yellow"
                        : "blue"
                  }
                >
                  {m.severity}
                </Badge>
                <Text>{m.text}</Text>
                {m.code && (
                  <Text color="fg.muted" opacity={0.6}>
                    [{m.code}]
                  </Text>
                )}
              </Flex>
            ))}
          </Box>
        )}
      </Tabs.Content>

      <Tabs.Content value="plan" px={3} py={3}>
        {plan === null || plan === undefined ? (
          <Text fontSize="xs" color="fg.muted" fontFamily="mono">
            Use the EXPLAIN button to populate this panel.
          </Text>
        ) : (
          <Box
            as="pre"
            m={0}
            p={2}
            bg="bg.subtle"
            rounded="sm"
            fontSize="xs"
            fontFamily="mono"
            whiteSpace="pre-wrap"
            overflowX="auto"
          >
            {JSON.stringify(plan, null, 2)}
          </Box>
        )}
      </Tabs.Content>

      <Tabs.Content value="stats" px={3} py={3}>
        <Box
          display="grid"
          gridTemplateColumns="auto 1fr"
          columnGap={4}
          rowGap={1}
          fontSize="xs"
          fontFamily="mono"
        >
          <Text color="fg.muted">Elapsed</Text>
          <Text>{formatElapsed(response.stats.elapsed_ms)}</Text>
          {response.stats.rows_streamed !== null &&
            response.stats.rows_streamed !== undefined && (
              <>
                <Text color="fg.muted">Rows streamed</Text>
                <Text>{response.stats.rows_streamed.toLocaleString()}</Text>
              </>
            )}
          <Text color="fg.muted">Statements</Text>
          <Text>{response.results.length}</Text>
          <Text color="fg.muted">Cached</Text>
          <Text color={cached ? "blue.400" : "fg.muted"}>
            {cached ? "yes" : "no"}
          </Text>
        </Box>
      </Tabs.Content>
    </Tabs.Root>
  );
}

/** Render a single DbResult (select / mutation / error). */
function DbSingleResultView({
  result,
  cached,
  onLoadMore,
}: {
  result: DbResponse["results"][number];
  cached: boolean;
  onLoadMore: () => Promise<void> | void;
}) {
  if (result.kind === "select") {
    return (
      <ResultTable
        columns={result.columns}
        rows={result.rows}
        hasMore={result.has_more}
        onLoadMore={onLoadMore}
      />
    );
  }
  if (result.kind === "mutation") {
    return (
      <Flex px={6} py={5} align="center" gap={3}>
        <Badge colorPalette="blue" variant="subtle" fontFamily="mono" size="md">
          {result.rows_affected} row{result.rows_affected === 1 ? "" : "s"}{" "}
          affected
        </Badge>
        {cached && (
          <Badge size="sm" colorPalette="gray" variant="subtle">
            cached
          </Badge>
        )}
      </Flex>
    );
  }
  return (
    <Box px={6} py={5} color="red.500" fontSize="sm" fontFamily="mono">
      {result.message}
    </Box>
  );
}

/** Sub-tabs numbered by statement index for multi-result responses. */
function DbMultiResultView({
  results,
  cached,
  onLoadMore,
}: {
  results: DbResponse["results"];
  cached: boolean;
  onLoadMore: () => Promise<void> | void;
}) {
  return (
    <Tabs.Root defaultValue="0" size="sm" variant="subtle">
      <Tabs.List px={3} pt={1}>
        {results.map((r, i) => {
          const label =
            r.kind === "select"
              ? "SELECT"
              : r.kind === "mutation"
                ? "MUTATION"
                : "ERROR";
          return (
            <Tabs.Trigger
              key={i}
              value={String(i)}
              fontSize="2xs"
              fontFamily="mono"
            >
              {i + 1}: {label}
            </Tabs.Trigger>
          );
        })}
      </Tabs.List>
      {results.map((r, i) => (
        <Tabs.Content key={i} value={String(i)} p={0}>
          <DbSingleResultView
            result={r}
            cached={cached && i === 0}
            onLoadMore={onLoadMore}
          />
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}

// ───── Status bar ─────

interface DbStatusBarProps {
  connection: string | undefined;
  durationMs: number | null;
  executionState: ExecutionState;
  response: DbResponse | null;
  cached: boolean;
  query: string;
  alias: string | undefined;
}

function DbStatusBar({
  connection,
  durationMs,
  executionState,
  response,
  cached,
  query,
  alias,
}: DbStatusBarProps) {
  const first = response?.results[0];
  const rowCount =
    first?.kind === "select"
      ? `${first.rows.length.toLocaleString()} row${first.rows.length === 1 ? "" : "s"}`
      : first?.kind === "mutation"
        ? `${first.rows_affected} affected`
        : null;

  const duration =
    durationMs !== null && durationMs !== undefined
      ? formatElapsed(durationMs)
      : null;

  // State → user-facing label. Shown alongside the dot so the status reads
  // without needing colour-vision. Idle shows just the connection.
  const stateLabel: string | null =
    executionState === "running"
      ? "running"
      : executionState === "error"
        ? "error"
        : executionState === "cancelled"
          ? "cancelled"
          : executionState === "success"
            ? "connected"
            : connection
              ? "connected"
              : null;

  const dotColor: string =
    executionState === "running"
      ? "yellow.400"
      : executionState === "error"
        ? "red.400"
        : executionState === "cancelled"
          ? "orange.400"
          : "green.400";

  // Vertical pipe separator — inlined rather than componentised to avoid the
  // react-hooks/static-components lint (component defined during render).
  const pipe = (
    <Box
      as="span"
      width="1px"
      height="14px"
      bg="border"
      opacity={0.6}
      flexShrink={0}
      mx={1}
    />
  );

  return (
    <Flex
      className="cm-db-statusbar"
      align="center"
      gap={3}
      fontFamily="mono"
      fontSize="xs"
      color="fg.muted"
    >
      {/* Left cluster: connection state */}
      <HStack gap={2} align="center" flexShrink={0}>
        <Box
          boxSize="2"
          borderRadius="full"
          bg={dotColor}
          flexShrink={0}
        />
        {stateLabel && (
          <Text color="fg" fontWeight="500">
            {stateLabel}
          </Text>
        )}
      </HStack>

      {/* Centre cluster: data counts + load more hint */}
      {rowCount && (
        <>
          {pipe}
          <Text>{rowCount}</Text>
        </>
      )}

      {/* Filler so right-cluster pushes to the end */}
      <Flex flex={1} />

      {/* Right cluster: timing + cache badge + export */}
      {duration && (
        <>
          <Text>{duration}</Text>
        </>
      )}
      {cached && duration && pipe}
      {cached && (
        <Badge
          size="xs"
          colorPalette="gray"
          variant="subtle"
          fontFamily="mono"
          textTransform="lowercase"
          px={2}
          py={0.5}
          rounded="sm"
        >
          cached
        </Badge>
      )}
      <ExportMenu response={response} query={query} alias={alias} />
    </Flex>
  );
}

// ───── Drawer ─────

interface DbDrawerProps {
  metadata: DbBlockMetadata;
  connections: Connection[];
  /** Resolved active connection for the read-only toggle. */
  activeConnection: Connection | null;
  resolvedBindings: { placeholder: string; raw: string; value: unknown }[];
  onClose: () => void;
  onUpdate: (patch: Partial<DbBlockMetadata>) => void;
  onDelete: () => void;
  /** Callback to reflect a write-back after the user flips read-only. */
  onConnectionsChanged: (next: Connection[]) => void;
}

function DbDrawer({
  metadata,
  connections,
  activeConnection,
  resolvedBindings,
  onClose,
  onUpdate,
  onDelete,
  onConnectionsChanged,
}: DbDrawerProps) {
  // Close on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Portal>
      <Box
        position="fixed"
        top={0}
        right={0}
        bottom={0}
        w="320px"
        bg="bg"
        borderLeft="1px solid"
        borderColor="border"
        zIndex={1000}
        overflowY="auto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Flex
          px={4}
          py={3}
          borderBottom="1px solid"
          borderColor="border"
          align="center"
          justify="space-between"
        >
          <Text fontWeight="bold" fontSize="sm">
            Block settings
          </Text>
          <IconButton
            size="xs"
            variant="ghost"
            aria-label="Close"
            onClick={onClose}
          >
            <LuX />
          </IconButton>
        </Flex>

        <Box p={4} display="flex" flexDirection="column" gap={3}>
          <Box>
            <Text fontSize="xs" color="fg.muted" mb={1}>
              Alias
            </Text>
            <Input
              size="sm"
              fontFamily="mono"
              value={metadata.alias ?? ""}
              onChange={(e) =>
                onUpdate({ alias: e.target.value || undefined })
              }
            />
          </Box>

          <Box>
            <Text fontSize="xs" color="fg.muted" mb={1}>
              Connection
            </Text>
            <NativeSelectRoot size="sm">
              <NativeSelectField
                value={metadata.connection ?? ""}
                onChange={(e) =>
                  onUpdate({ connection: e.target.value || undefined })
                }
              >
                <option value="">— none —</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name} ({c.driver})
                  </option>
                ))}
              </NativeSelectField>
            </NativeSelectRoot>
          </Box>

          {activeConnection && (
            <Flex align="center" justify="space-between">
              <Box>
                <Text fontSize="xs" color="fg.muted">
                  Read-only
                </Text>
                <Text fontSize="2xs" color="fg.muted" opacity={0.7}>
                  Confirm mutations before running (per-connection)
                </Text>
              </Box>
              <Button
                size="xs"
                variant={activeConnection.is_readonly ? "solid" : "outline"}
                colorPalette={activeConnection.is_readonly ? "orange" : "gray"}
                onClick={async () => {
                  const next = !activeConnection.is_readonly;
                  try {
                    const updated = await updateConnection(activeConnection.id, {
                      is_readonly: next,
                    });
                    onConnectionsChanged(
                      connections.map((c) =>
                        c.id === updated.id ? updated : c,
                      ),
                    );
                  } catch {
                    // Silently fail — the toggle snaps back on next render.
                  }
                }}
              >
                {activeConnection.is_readonly ? "RO" : "RW"}
              </Button>
            </Flex>
          )}

          <Box>
            <Text fontSize="xs" color="fg.muted" mb={1}>
              Row limit
            </Text>
            <Input
              size="sm"
              type="number"
              min={1}
              value={metadata.limit ?? ""}
              onChange={(e) => {
                const n = Number(e.target.value);
                onUpdate({
                  limit:
                    Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined,
                });
              }}
            />
          </Box>

          <Box>
            <Text fontSize="xs" color="fg.muted" mb={1}>
              Timeout (ms)
            </Text>
            <Input
              size="sm"
              type="number"
              min={1}
              value={metadata.timeoutMs ?? ""}
              onChange={(e) => {
                const n = Number(e.target.value);
                onUpdate({
                  timeoutMs:
                    Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined,
                });
              }}
            />
          </Box>

          <Box>
            <Text fontSize="xs" color="fg.muted" mb={1}>
              Display
            </Text>
            <HStack gap={2}>
              {(["input", "split", "output"] as DbDisplayMode[]).map((m) => (
                <Button
                  key={m}
                  size="xs"
                  variant={metadata.displayMode === m ? "solid" : "outline"}
                  onClick={() => onUpdate({ displayMode: m })}
                >
                  {m}
                </Button>
              ))}
            </HStack>
          </Box>

          <Box>
            <Text fontSize="xs" color="fg.muted" mb={1}>
              Resolved bindings ({resolvedBindings.length})
            </Text>
            {resolvedBindings.length === 0 ? (
              <Text fontSize="xs" color="fg.muted" opacity={0.6}>
                Run the block to see the {"{{ref}}"} → $N mapping.
              </Text>
            ) : (
              <Box
                fontFamily="mono"
                fontSize="xs"
                display="flex"
                flexDirection="column"
                gap={1}
              >
                {resolvedBindings.map((b, i) => (
                  <Flex key={i} gap={2}>
                    <Text flexShrink={0} color="fg.muted">
                      {b.placeholder}
                    </Text>
                    <Text flexShrink={0}>{b.raw}</Text>
                    <Text color="fg.muted" truncate>
                      = {JSON.stringify(b.value)}
                    </Text>
                  </Flex>
                ))}
              </Box>
            )}
          </Box>

          <Box mt={4} pt={3} borderTop="1px solid" borderColor="border">
            <Button
              size="sm"
              variant="outline"
              colorPalette="red"
              onClick={onDelete}
            >
              Delete block
            </Button>
          </Box>
        </Box>
      </Box>
    </Portal>
  );
}

// ───── Confirm dialog (read-only / unscoped write guard) ─────

interface ConfirmRunDialogProps {
  reason: string;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmRunDialog({ reason, onCancel, onConfirm }: ConfirmRunDialogProps) {
  // Portal + Box (not Chakra Dialog) so closing the dialog doesn't steal
  // focus from ProseMirror / CM6 when the user clicks Cancel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, onConfirm]);

  return (
    <Portal>
      {/* scrim */}
      <Box
        position="fixed"
        top={0}
        right={0}
        bottom={0}
        left={0}
        bg="blackAlpha.600"
        zIndex={2000}
        onClick={onCancel}
      />
      {/* card */}
      <Box
        position="fixed"
        top="50%"
        left="50%"
        transform="translate(-50%, -50%)"
        w="420px"
        maxW="calc(100vw - 32px)"
        bg="bg"
        borderWidth="1px"
        borderColor="border"
        borderRadius="md"
        boxShadow="xl"
        zIndex={2001}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Box px={5} py={4} borderBottomWidth="1px" borderColor="border">
          <Text fontWeight="semibold" fontSize="sm">
            Run this query?
          </Text>
        </Box>
        <Box px={5} py={4}>
          <Text fontSize="sm" color="fg.muted">
            {reason}
          </Text>
        </Box>
        <Flex
          px={5}
          py={3}
          borderTopWidth="1px"
          borderColor="border"
          justify="flex-end"
          gap={2}
        >
          <Button size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" colorPalette="orange" onClick={onConfirm}>
            Run anyway
          </Button>
        </Flex>
      </Box>
    </Portal>
  );
}

