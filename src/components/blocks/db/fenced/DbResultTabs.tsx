import { useEffect, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Spinner,
  Tabs,
  Text,
} from "@chakra-ui/react";
import {
  type CellValue,
  type DbResponse,
} from "@/components/blocks/db/types";
import { ResultTable } from "@/components/blocks/db/ResultTable";
import {
  formatElapsed,
  isPlainObject,
  type ExecutionState,
} from "./shared";

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

export function DbResult({
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
  // yanks the scroll position on every re-run.
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

  // Auto-switch to Plan when EXPLAIN fills it in.
  const [activeTab, setActiveTab] = useState<string>(
    plan !== undefined ? "plan" : "results",
  );
  useEffect(() => {
    setActiveTab(plan !== undefined ? "plan" : "results");
  }, [plan]);

  return (
    <Tabs.Root
      value={activeTab}
      onValueChange={(e) => setActiveTab(e.value)}
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

      <Tabs.Content value="plan" p={0}>
        <DbPlanView plan={plan} />
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

function DbPlanView({ plan }: { plan: unknown }) {
  if (plan === null || plan === undefined) {
    return (
      <Box px={3} py={3}>
        <Text fontSize="xs" color="fg.muted" fontFamily="mono">
          Use the EXPLAIN button to populate this panel.
        </Text>
      </Box>
    );
  }

  if (Array.isArray(plan) && plan.length > 0 && plan.every(isPlainObject)) {
    const columnSet = new Set<string>();
    for (const row of plan as Record<string, unknown>[]) {
      for (const key of Object.keys(row)) columnSet.add(key);
    }
    const columns = Array.from(columnSet).map((name) => ({ name, type: "" }));
    const rows = plan as Record<string, CellValue>[];
    return <ResultTable columns={columns} rows={rows} hasMore={false} />;
  }

  return (
    <Box
      as="pre"
      m={3}
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
