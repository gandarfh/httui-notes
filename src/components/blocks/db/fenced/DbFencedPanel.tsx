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
  NativeSelectField,
  NativeSelectRoot,
  Portal,
  Spinner,
  Text,
} from "@chakra-ui/react";
import {
  LuChartBar,
  LuDownload,
  LuPlay,
  LuSettings,
  LuSquare,
  LuX,
  LuZap,
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
  type DbSessionMode,
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
  type Connection,
} from "@/lib/tauri/connections";
import { resolveRefsToBindParams } from "@/lib/blocks/references";
import { collectBlocksAboveCM } from "@/lib/blocks/document";
import { useEnvironmentStore } from "@/stores/environment";

interface DbFencedPanelProps {
  blockId: string;
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

// ───── Connection resolution ─────

/**
 * Resolve a connection identifier from the info string (`connection=<x>`)
 * to the connection UUID used by the backend. Order: exact slug/name
 * match → exact UUID match → null.
 */
function resolveConnection(
  connections: Connection[],
  identifier: string | undefined,
): Connection | null {
  if (!identifier) return null;
  // Slug first — but our connection model has only `name`, not a separate
  // slug column. Treat name as the slug for now.
  const byName = connections.find((c) => c.name === identifier);
  if (byName) return byName;
  const byId = connections.find((c) => c.id === identifier);
  return byId ?? null;
}

// ───── Main panel ─────

export const DbFencedPanel = memo(function DbFencedPanel({
  blockId,
  entry,
  view,
  filePath,
}: DbFencedPanelProps) {
  const block = entry.block;
  const [executionState, setExecutionState] =
    useState<ExecutionState>("idle");
  const [response, setResponse] = useState<DbResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [cached, setCached] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  /**
   * Last-execution bindings: `{{ref.raw}} → resolved value`. Shown in the
   * drawer's Resolved bindings panel so users can debug what the driver
   * actually received.
   */
  const [resolvedBindings, setResolvedBindings] = useState<
    { placeholder: string; raw: string; value: unknown }[]
  >([]);
  const abortRef = useRef<AbortController | null>(null);

  const activeConnection = useMemo(
    () => resolveConnection(connections, block.metadata.connection),
    [connections, block.metadata.connection],
  );

  // Load connections once
  useEffect(() => {
    listConnections().then(setConnections).catch(() => {});
  }, []);

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
  const runBlock = useCallback(async () => {
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

  const cancelBlock = useCallback(() => {
    const abort = abortRef.current;
    if (abort) {
      abort.abort();
      abortRef.current = null;
    }
    // Best-effort: also tell the backend (in case abort raced).
    void cancelBlockExecution(`db_${blockId}`);
  }, [blockId]);

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
          />,
          statusbarNode,
        )}

      {drawerOpen && (
        <DbDrawer
          metadata={block.metadata}
          connections={connections}
          resolvedBindings={resolvedBindings}
          onClose={() => setDrawerOpen(false)}
          onUpdate={updateMetadata}
          onDelete={deleteBlockFromDoc}
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
  const dialectLabel = metadata.dialect.toUpperCase();
  const connLabel =
    activeConnection?.name ??
    metadata.connection ??
    (metadata.connection ? metadata.connection : undefined);

  return (
    <HStack
      className="cm-db-toolbar"
      gap={2}
      align="center"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Badge colorPalette="blue" variant="solid" size="xs">
        DB
      </Badge>
      {metadata.alias && (
        <Text fontSize="xs" fontFamily="mono" fontWeight="bold">
          {metadata.alias}
        </Text>
      )}
      {connLabel && (
        <Text fontSize="xs" fontFamily="mono" color="fg.muted">
          {connLabel}
        </Text>
      )}
      <Text
        fontSize="9px"
        fontFamily="mono"
        color="fg.muted"
        textTransform="uppercase"
        letterSpacing="0.05em"
      >
        {dialectLabel}
      </Text>

      <HStack gap={1}>
        {running ? (
          <IconButton
            size="xs"
            variant="ghost"
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
          aria-label="AI"
          disabled
          title="AI — coming soon"
        >
          <LuZap />
        </IconButton>
        <IconButton
          size="xs"
          variant="ghost"
          aria-label="Explain"
          disabled
          title="EXPLAIN — coming soon"
        >
          <LuChartBar />
        </IconButton>
        <IconButton
          size="xs"
          variant="ghost"
          aria-label="Export"
          disabled
          title="Export — coming soon"
        >
          <LuDownload />
        </IconButton>
        <IconButton
          size="xs"
          variant="ghost"
          aria-label="Settings"
          onClick={onOpenSettings}
          title="Settings"
        >
          <LuSettings />
        </IconButton>
      </HStack>
    </HStack>
  );
}

// ───── Result panel ─────

interface DbResultProps {
  executionState: ExecutionState;
  response: DbResponse | null;
  error: string | null;
  cached: boolean;
}

function DbResult({ executionState, response, error, cached }: DbResultProps) {
  if (executionState === "running") {
    return (
      <Flex
        className="cm-db-result"
        p={4}
        align="center"
        justify="center"
        gap={2}
        color="fg.muted"
      >
        <Spinner size="sm" />
        <Text fontSize="sm" fontFamily="mono">
          Running…
        </Text>
      </Flex>
    );
  }

  if (error) {
    return (
      <Box
        className="cm-db-result"
        p={3}
        color="red.500"
        fontSize="sm"
        fontFamily="mono"
      >
        {error}
      </Box>
    );
  }

  if (!response) {
    return (
      <Box className="cm-db-result" p={3} color="fg.muted" fontSize="xs" fontFamily="mono">
        Run (⌘↵) to see results.
      </Box>
    );
  }

  const first = response.results[0];
  if (!first) {
    return (
      <Box className="cm-db-result" p={3} color="fg.muted" fontSize="xs">
        No results returned.
      </Box>
    );
  }

  if (first.kind === "select") {
    return (
      <Box className="cm-db-result" p={2}>
        {cached && (
          <Badge size="xs" colorPalette="gray" variant="subtle" mb={1}>
            cached
          </Badge>
        )}
        <ResultTable
          columns={first.columns}
          rows={first.rows}
          hasMore={first.has_more}
          loadingMore={false}
          onLoadMore={() => {}}
        />
      </Box>
    );
  }

  if (first.kind === "mutation") {
    return (
      <Box className="cm-db-result" p={3}>
        <Badge colorPalette="blue" variant="subtle" fontFamily="mono" size="sm">
          {first.rows_affected} rows affected
        </Badge>
      </Box>
    );
  }

  // Error variant
  return (
    <Box
      className="cm-db-result"
      p={3}
      color="red.500"
      fontSize="sm"
      fontFamily="mono"
    >
      {first.message}
    </Box>
  );
}

// ───── Status bar ─────

interface DbStatusBarProps {
  connection: string | undefined;
  durationMs: number | null;
  executionState: ExecutionState;
  response: DbResponse | null;
  cached: boolean;
}

function DbStatusBar({
  connection,
  durationMs,
  executionState,
  response,
  cached,
}: DbStatusBarProps) {
  const parts: string[] = [];
  if (connection) parts.push(connection);

  const first = response?.results[0];
  if (first?.kind === "select") parts.push(`${first.rows.length} rows`);
  else if (first?.kind === "mutation")
    parts.push(`${first.rows_affected} affected`);

  if (durationMs !== null) parts.push(`${durationMs}ms`);
  if (cached) parts.push("cached");
  if (executionState === "running") parts.push("running");
  if (executionState === "cancelled") parts.push("cancelled");
  if (executionState === "idle" && !response) parts.push("⌘↵ to run");

  return (
    <Box
      className="cm-db-statusbar"
      px={2}
      py="2px"
      fontFamily="mono"
      fontSize="10px"
      color="fg.muted"
      opacity={0.75}
    >
      {parts.join(" · ")}
    </Box>
  );
}

// ───── Drawer ─────

interface DbDrawerProps {
  metadata: DbBlockMetadata;
  connections: Connection[];
  resolvedBindings: { placeholder: string; raw: string; value: unknown }[];
  onClose: () => void;
  onUpdate: (patch: Partial<DbBlockMetadata>) => void;
  onDelete: () => void;
}

function DbDrawer({
  metadata,
  connections,
  resolvedBindings,
  onClose,
  onUpdate,
  onDelete,
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

          <DrawerSessionField
            session={metadata.session}
            onChange={(s) => onUpdate({ session: s })}
          />

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
                fontSize="11px"
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

interface DrawerSessionFieldProps {
  session: DbSessionMode | undefined;
  onChange: (s: DbSessionMode | undefined) => void;
}

function DrawerSessionField({ session, onChange }: DrawerSessionFieldProps) {
  const kind = session?.kind ?? "doc"; // doc is the default
  const namedId = session?.kind === "named" ? session.id : "";

  return (
    <Box>
      <Text fontSize="xs" color="fg.muted" mb={1}>
        Session
      </Text>
      <HStack gap={2} mb={kind === "named" ? 2 : 0}>
        {(["none", "doc", "named"] as const).map((k) => (
          <Button
            key={k}
            size="xs"
            variant={kind === k ? "solid" : "outline"}
            onClick={() => {
              if (k === "none") onChange({ kind: "none" });
              else if (k === "doc") onChange(undefined); // doc is default → omit
              else onChange({ kind: "named", id: namedId || "shared" });
            }}
          >
            {k}
          </Button>
        ))}
      </HStack>
      {kind === "named" && (
        <Input
          size="sm"
          fontFamily="mono"
          placeholder="session id"
          value={namedId}
          onChange={(e) => {
            const id = e.target.value.trim();
            if (id) onChange({ kind: "named", id });
          }}
        />
      )}
    </Box>
  );
}
