import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/core";
import { Box, Flex, HStack, Badge } from "@chakra-ui/react";
import { NativeSelectRoot, NativeSelectField } from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useColorMode } from "@/components/ui/color-mode";
import CodeMirror from "@uiw/react-codemirror";
import { sql, type SQLConfig, PostgreSQL, MySQL, SQLite as SQLiteDialect, keywordCompletionSource } from "@codemirror/lang-sql";
import { autocompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { EditorView, tooltips } from "@codemirror/view";
import { ExecutableBlockShell } from "../ExecutableBlockShell";
import { useBlockContext } from "../BlockContext";
import type { DisplayMode, ExecutionState } from "../ExecutableBlock";
import type { DbBlockData, DbResponse } from "./types";
import { DEFAULT_DB_DATA, isSelectResponse } from "./types";
import { executeBlock, getBlockResult, saveBlockResult } from "@/lib/tauri/commands";
import { hashBlockContent } from "@/lib/blocks/hash";
import { resolveAllReferences } from "@/lib/blocks/references";
import { collectBlocksAbove } from "@/lib/blocks/document";
import { resolveAndExecuteDependencies } from "@/lib/blocks/dependencies";
import { referenceHighlight } from "@/lib/blocks/cm-references";
import { createReferenceCompletionSource } from "@/lib/blocks/cm-autocomplete";
import type { BlockContext } from "@/lib/blocks/references";
import type { Connection, SchemaEntry } from "@/lib/tauri/connections";
import { listConnections, getCachedSchema, introspectSchema } from "@/lib/tauri/connections";
import { ResultTable } from "./ResultTable";

const cmTransparentBg = EditorView.theme({
  "&": { backgroundColor: "transparent !important" },
  "& .cm-gutters": {
    backgroundColor: "transparent !important",
    border: "none",
  },
  "& .cm-activeLineGutter, & .cm-activeLine": {
    backgroundColor: "transparent !important",
  },
});

const autocompleteTheme = EditorView.theme({
  ".cm-tooltip": {
    zIndex: "9999 !important",
  },
  ".cm-tooltip-autocomplete": {
    background: "var(--chakra-colors-bg) !important",
    border: "1px solid var(--chakra-colors-border) !important",
    borderRadius: "8px !important",
    overflow: "hidden",
    boxShadow: "0 8px 24px rgba(0,0,0,0.4) !important",
    padding: "4px !important",
  },
  ".cm-tooltip-autocomplete ul": {
    fontFamily: "var(--chakra-fonts-mono)",
    fontSize: "12px",
    maxHeight: "200px",
  },
  ".cm-tooltip-autocomplete li": {
    padding: "4px 10px !important",
    lineHeight: "1.5",
    borderRadius: "4px",
    margin: "1px 0",
  },
  ".cm-tooltip-autocomplete li[aria-selected]": {
    background: "rgba(139, 92, 246, 0.2) !important",
    color: "inherit !important",
  },
  ".cm-completionIcon": {
    fontSize: "10px",
    fontFamily: "var(--chakra-fonts-mono)",
    fontWeight: "700",
    width: "auto !important",
    paddingRight: "6px",
    opacity: "0.6",
  },
  ".cm-completionIcon-table::after": {
    content: "'TBL'",
    color: "rgb(96, 165, 250)",
  },
  ".cm-completionIcon-column::after": {
    content: "'COL'",
    color: "rgb(74, 222, 128)",
  },
  ".cm-completionIcon-keyword::after": {
    content: "'SQL'",
    color: "rgb(192, 132, 252)",
  },
  ".cm-completionIcon-variable::after": {
    content: "'REF'",
    color: "rgb(251, 146, 60)",
  },
  ".cm-completionIcon-property::after": {
    content: "'KEY'",
    color: "rgb(148, 163, 184)",
  },
  ".cm-completionLabel": {
    fontWeight: "600",
  },
  ".cm-completionDetail": {
    opacity: "0.5",
    marginLeft: "12px",
    fontStyle: "normal !important",
    fontSize: "11px",
  },
  ".cm-completionMatchedText": {
    textDecoration: "none !important",
    fontWeight: "700",
    color: "rgb(167, 139, 250)",
  },
});

function parseBlockData(raw: string): DbBlockData {
  if (!raw) return { ...DEFAULT_DB_DATA };
  try {
    return { ...DEFAULT_DB_DATA, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_DB_DATA };
  }
}

function serializeBlockData(data: DbBlockData): string {
  return JSON.stringify(data);
}

/**
 * Convert {{ref}} placeholders in SQL to `?` bind params.
 * Returns the parameterized SQL and the resolved values array.
 */
function resolveRefsToBindParams(
  query: string,
  blocks: BlockContext[],
  currentPos: number,
): { sql: string; bindValues: unknown[]; errors: string[] } {
  const refPattern = /\{\{([^}]+)\}\}/g;
  const bindValues: unknown[] = [];
  const errors: string[] = [];

  const parameterizedSql = query.replace(refPattern, (match, refPath: string) => {
    const result = resolveAllReferences(`{{${refPath}}}`, blocks, currentPos);
    if (result.errors.length > 0) {
      errors.push(...result.errors.map((e) => e.message));
      return match; // keep original on error
    }
    // Try to parse as number/boolean
    const resolved = result.resolved;
    let value: unknown = resolved;
    if (resolved === "true") value = true;
    else if (resolved === "false") value = false;
    else if (resolved === "null") value = null;
    else {
      const num = Number(resolved);
      if (!isNaN(num) && resolved.trim() !== "") value = num;
    }
    bindValues.push(value);
    return "?";
  });

  return { sql: parameterizedSql, bindValues, errors };
}

// --- Sub-components ---

/**
 * Create a custom completion source from schema entries.
 * Provides table and column completions with custom icons.
 */
function createSchemaCompletionSource(entries: SchemaEntry[]) {
  // Build table -> columns map
  const tableMap: Record<string, string[]> = {};
  for (const entry of entries) {
    if (!tableMap[entry.table_name]) {
      tableMap[entry.table_name] = [];
    }
    tableMap[entry.table_name].push(entry.column_name);
  }

  const tableNames = Object.keys(tableMap);

  // Build column -> tables map for detail display
  const columnTables: Record<string, string[]> = {};
  for (const entry of entries) {
    if (!columnTables[entry.column_name]) {
      columnTables[entry.column_name] = [];
    }
    if (!columnTables[entry.column_name].includes(entry.table_name)) {
      columnTables[entry.column_name].push(entry.table_name);
    }
  }

  return (ctx: CompletionContext): CompletionResult | null => {
    const word = ctx.matchBefore(/[\w.]*/);
    if (!word || (word.from === word.to && !ctx.explicit)) return null;

    const text = word.text;

    // After "tableName." -> suggest columns of that table
    if (text.includes(".")) {
      const parts = text.split(".");
      const table = parts[0];
      const cols = tableMap[table];
      if (!cols) return null;
      return {
        from: word.from + parts[0].length + 1,
        to: word.to,
        options: cols.map((col) => ({
          label: col,
          type: "column",
          detail: table,
        })),
        filter: true,
      };
    }

    // Detect referenced tables from FROM/JOIN clauses
    const referencedTables = new Set<string>();
    const tableRefRegex = /(?:FROM|JOIN)\s+(\w+)/gi;
    const rawSql = ctx.state.doc.toString();
    let m: RegExpExecArray | null;
    while ((m = tableRefRegex.exec(rawSql)) !== null) {
      const t = m[1];
      if (tableMap[t]) referencedTables.add(t);
    }

    // If tables are referenced, show only their columns; otherwise show all
    const columnOptions = referencedTables.size > 0
      ? [...referencedTables].flatMap((t) =>
          (tableMap[t] ?? []).map((col) => ({
            label: col,
            type: "column" as const,
            detail: t,
          })),
        )
      : Object.entries(columnTables).map(([col, tables]) => ({
          label: col,
          type: "column" as const,
          detail: tables.join(", "),
        }));

    const options = [
      ...tableNames.map((t) => ({
        label: t,
        type: "table" as const,
        detail: `${tableMap[t].length} cols`,
      })),
      ...columnOptions,
    ];

    return {
      from: word.from,
      to: word.to,
      options,
      filter: true,
    };
  };
}

function DbInput({
  data,
  onChange,
  cmTheme,
  connections,
  blocksRef,
}: {
  data: DbBlockData;
  onChange: (data: DbBlockData) => void;
  cmTheme: "light" | "dark";
  connections: Connection[];
  blocksRef: React.RefObject<BlockContext[]>;
}) {
  const [schema, setSchema] = useState<SchemaEntry[]>([]);

  const refCompletionSource = useMemo(
    () => createReferenceCompletionSource(() => blocksRef.current ?? []),
    [blocksRef],
  );

  // Load schema when connection changes
  useEffect(() => {
    if (!data.connectionId) {
      setSchema([]);
      return;
    }

    let cancelled = false;

    (async () => {
      // Try cache first
      const cached = await getCachedSchema(data.connectionId).catch(() => null);
      if (cancelled) return;
      if (cached) {
        setSchema(cached);
        return;
      }
      // Introspect fresh
      const fresh = await introspectSchema(data.connectionId).catch(() => []);
      if (!cancelled) setSchema(fresh);
    })();

    return () => { cancelled = true; };
  }, [data.connectionId]);

  // Determine dialect from selected connection
  const selectedConn = connections.find((c) => c.id === data.connectionId);
  const dialect = useMemo(() => {
    switch (selectedConn?.driver) {
      case "postgres": return PostgreSQL;
      case "mysql": return MySQL;
      case "sqlite": return SQLiteDialect;
      default: return undefined;
    }
  }, [selectedConn?.driver]);

  const schemaSource = useMemo(
    () => createSchemaCompletionSource(schema),
    [schema],
  );

  const sqlExtensions = useMemo(() => {
    const d = dialect ?? PostgreSQL;
    const config: SQLConfig = { dialect: d };
    return [
      sql(config),
      autocompletion({
        override: [
          schemaSource,
          keywordCompletionSource(d),
          refCompletionSource,
        ],
        activateOnTyping: true,
        icons: false,
      }),
      tooltips({ parent: document.body }),
      autocompleteTheme,
      EditorView.lineWrapping,
      cmTransparentBg,
      ...referenceHighlight,
    ];
  }, [dialect, schemaSource, refCompletionSource]);

  return (
    <Box p={2} display="flex" flexDirection="column" gap={1.5}>
      {/* Connection selector */}
      <Flex gap={2} align="center">
        <NativeSelectRoot size="xs" flex={1}>
          <NativeSelectField
            value={data.connectionId}
            onChange={(e) => onChange({ ...data, connectionId: e.target.value })}
            fontFamily="mono"
            fontSize="xs"
          >
            <option value="">Select connection...</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.driver})
              </option>
            ))}
          </NativeSelectField>
        </NativeSelectRoot>
      </Flex>

      {/* SQL editor */}
      <Box
        border="1px solid"
        borderColor="border"
        rounded="md"
        overflow="hidden"
        bg="bg.subtle"
      >
        <CodeMirror
          value={data.query}
          onChange={(val) => onChange({ ...data, query: val })}
          extensions={sqlExtensions}
          basicSetup={{
            lineNumbers: true,
            foldGutter: false,
            autocompletion: false,
          }}
          theme={cmTheme}
          height="80px"
          style={{ fontSize: "12px" }}
        />
      </Box>
    </Box>
  );
}

function DbOutput({
  response,
  error,
  onPageChange,
}: {
  response: DbResponse | null;
  error: string | null;
  onPageChange: (page: number, pageSize: number) => void;
}) {
  if (error) {
    return (
      <Box p={3} color="red.500" fontSize="sm" fontFamily="mono">
        {error}
      </Box>
    );
  }
  if (!response) return null;

  if (isSelectResponse(response)) {
    return (
      <Box p={2} display="flex" flexDirection="column" gap={1}>
        <HStack gap={2}>
          <Badge colorPalette="green" variant="subtle" fontFamily="mono" size="sm">
            {response.total_rows} rows
          </Badge>
        </HStack>
        <ResultTable
          columns={response.columns}
          rows={response.rows}
          totalRows={response.total_rows}
          page={response.page}
          pageSize={response.page_size}
          onPageChange={onPageChange}
        />
      </Box>
    );
  }

  // Mutation response
  return (
    <Box p={3}>
      <Badge colorPalette="blue" variant="subtle" fontFamily="mono" size="sm">
        {response.rows_affected} rows affected
      </Badge>
    </Box>
  );
}

// --- Main view ---

export function DbBlockView({
  node,
  editor,
  getPos,
  updateAttributes,
  selected,
}: NodeViewProps) {
  const { colorMode } = useColorMode();
  const { filePath } = useBlockContext();
  const cmTheme = colorMode === "dark" ? "dark" : "light";
  const alias = (node.attrs.alias as string) ?? "";
  const displayMode = (node.attrs.displayMode as DisplayMode) ?? "input";
  const executionState = (node.attrs.executionState as ExecutionState) ?? "idle";
  const rawContent = (node.attrs.content as string) ?? "";

  const [response, setResponse] = useState<DbResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [depStatus, setDepStatus] = useState<string | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const cancelRef = useRef<(() => void) | null>(null);
  const lastHashRef = useRef<string>("");
  const blocksRef = useRef<BlockContext[]>([]);

  // Load connections
  useEffect(() => {
    listConnections().then(setConnections).catch(() => {});
  }, []);

  // Keep blocksRef updated for autocomplete
  useEffect(() => {
    if (!filePath || !editor) return;
    let cancelled = false;
    const currentPos = (typeof getPos === "function" ? getPos() : 0) ?? 0;

    collectBlocksAbove(editor, currentPos, filePath).then((blocks) => {
      if (!cancelled) blocksRef.current = blocks;
    });

    return () => {
      cancelled = true;
    };
  }, [filePath, editor, getPos]);

  // Local state for responsive editing
  const [data, setData] = useState(() => parseBlockData(rawContent));
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDataChange = useCallback(
    (updated: DbBlockData) => {
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
          setResponse(parsed);
          setError(null);
          updateAttributes({ executionState: "cached", displayMode: "split" });
        } else if (executionState === "cached") {
          setResponse(null);
          updateAttributes({ executionState: "idle" });
        }
      } catch {
        // Cache lookup failed
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filePath, rawContent]); // eslint-disable-line react-hooks/exhaustive-deps

  const executeQuery = useCallback(
    async (page = 1, pageSize = 100) => {
      setError(null);
      if (page === 1) {
        setResponse(null);
        setDepStatus(null);
        updateAttributes({ executionState: "running" });
      }

      let cancelled = false;
      cancelRef.current = () => {
        cancelled = true;
      };

      try {
        const currentPos =
          (typeof getPos === "function" ? getPos() : 0) ?? 0;

        // Resolve dependencies
        let blocks: BlockContext[] = [];
        if (filePath) {
          const depResult = await resolveAndExecuteDependencies(
            editor,
            currentPos,
            filePath,
            rawContent,
            (status) => setDepStatus(status),
          );
          blocks = depResult.blocks;
          if (depResult.executed.length > 0) {
            setDepStatus(null);
          }
        }

        if (cancelled) return;

        // Resolve refs to bind params
        const { sql, bindValues, errors } = resolveRefsToBindParams(
          data.query,
          blocks,
          currentPos,
        );

        if (errors.length > 0) {
          setError(`Reference errors:\n${errors.join("\n")}`);
          updateAttributes({ executionState: "error" });
          return;
        }

        setDepStatus(null);
        const result = await executeBlock("db", {
          connection_id: data.connectionId,
          query: sql,
          bind_values: bindValues,
          page,
          page_size: pageSize,
          ...(data.timeoutMs ? { timeout_ms: data.timeoutMs } : {}),
        });

        if (cancelled) return;

        const resultData = result.data as unknown as DbResponse;
        setResponse(resultData);
        updateAttributes({
          executionState:
            result.status === "success" ? "success" : "error",
          displayMode: "split",
        });

        // Save to cache (only first page)
        if (filePath && page === 1) {
          const hash = await hashBlockContent(rawContent);
          lastHashRef.current = hash;
          const totalRows = isSelectResponse(resultData)
            ? resultData.total_rows
            : null;
          await saveBlockResult(
            filePath,
            hash,
            result.status,
            JSON.stringify(resultData),
            result.duration_ms,
            totalRows,
          );
        }
      } catch (err) {
        if (cancelled) return;
        setDepStatus(null);
        setError(err instanceof Error ? err.message : String(err));
        updateAttributes({ executionState: "error" });
      }
    },
    [data, rawContent, filePath, editor, getPos, updateAttributes],
  );

  const handleRun = useCallback(() => {
    executeQuery(1, 100);
  }, [executeQuery]);

  const handlePageChange = useCallback(
    (page: number, pageSize: number) => {
      executeQuery(page, pageSize);
    },
    [executeQuery],
  );

  const handleCancel = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
    updateAttributes({ executionState: "idle" });
  }, [updateAttributes]);

  return (
    <NodeViewWrapper data-type="db-block">
      <ExecutableBlockShell
        blockType="db"
        alias={alias}
        displayMode={displayMode}
        executionState={executionState}
        onAliasChange={(a) => updateAttributes({ alias: a })}
        onDisplayModeChange={(m) => updateAttributes({ displayMode: m })}
        onRun={handleRun}
        onCancel={handleCancel}
        selected={selected}
        statusText={depStatus}
        inputSlot={
          <DbInput
            data={data}
            onChange={handleDataChange}
            cmTheme={cmTheme}
            connections={connections}
            blocksRef={blocksRef}
          />
        }
        outputSlot={
          <DbOutput
            response={response}
            error={error}
            onPageChange={handlePageChange}
          />
        }
      />
    </NodeViewWrapper>
  );
}
