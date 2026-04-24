import {
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Spinner,
  Table,
} from "@chakra-ui/react";
import { Fragment, useCallback, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { LuCopy, LuX } from "react-icons/lu";
import type { CellValue } from "./types";

interface ResultTableProps {
  columns: { name: string; type: string }[];
  rows: Record<string, CellValue>[];
  durationMs?: number | null;
  hasMore: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

function formatCellValue(value: CellValue): {
  text: string;
  isNull: boolean;
} {
  if (value === null) return { text: "NULL", isNull: true };
  if (typeof value === "boolean")
    return { text: value.toString(), isNull: false };
  if (typeof value === "object")
    return { text: JSON.stringify(value), isNull: false };
  return { text: String(value), isNull: false };
}

function tryParseJson(value: CellValue): { parsed: unknown; isJson: boolean } {
  if (typeof value !== "string") return { parsed: value, isJson: false };
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return { parsed: JSON.parse(trimmed), isJson: true };
    } catch {
      return { parsed: value, isJson: false };
    }
  }
  return { parsed: value, isJson: false };
}

function isNumericType(type: string): boolean {
  const t = type.toUpperCase();
  return (
    t.includes("INT") ||
    t.includes("FLOAT") ||
    t.includes("DECIMAL") ||
    t.includes("NUMERIC") ||
    t.includes("REAL") ||
    t.includes("DOUBLE")
  );
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <Box
      as="pre"
      m={0}
      p={2}
      bg="bg"
      border="1px solid"
      borderColor="border"
      rounded="sm"
      fontSize="xs"
      fontFamily="mono"
      whiteSpace="pre-wrap"
      wordBreak="break-all"
      maxH="200px"
      overflowY="auto"
    >
      {JSON.stringify(value, null, 2)}
    </Box>
  );
}

function DetailValue({ value }: { value: CellValue }) {
  if (value === null) {
    return (
      <Box as="span" fontStyle="italic" color="fg.muted" opacity={0.6}>
        NULL
      </Box>
    );
  }
  if (typeof value === "object") {
    return <JsonBlock value={value} />;
  }
  const { parsed, isJson } = tryParseJson(value);
  if (isJson) {
    return <JsonBlock value={parsed} />;
  }
  return (
    <Box as="span" wordBreak="break-all">
      {String(value)}
    </Box>
  );
}

const ROW_HEIGHT = 26;
const EXPANDED_OVERHEAD = 140;

// CSS as a static constant — Emotion will not re-compute on every render.
// Uses semantic Chakra tokens via `var(--chakra-colors-*)` so the table
// adapts to light/dark themes without branching here.
//
// Design intent: match the editor's flat aesthetic. No filled header or
// footer backgrounds — hierarchy comes from typography (weight, case,
// letterspacing) and minimal hairline borders. Zebra and hover stay as
// the lowest-contrast signal that rows are separable.
const tableCss = {
  userSelect: "text",
  cursor: "text",
  borderCollapse: "separate",
  borderSpacing: 0,
  "& th, & td": {
    whiteSpace: "nowrap",
    maxWidth: "320px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    padding: "4px 12px",
    lineHeight: "18px",
    borderBottom: "1px solid color-mix(in srgb, var(--chakra-colors-border) 45%, transparent)",
    borderRight: "none",
  },
  "& thead th": {
    background: "transparent",
    color: "var(--chakra-colors-fg-muted)",
    fontSize: "10px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontWeight: 600,
    paddingTop: "6px",
    paddingBottom: "6px",
    borderBottom: "1px solid color-mix(in srgb, var(--chakra-colors-border) 70%, transparent)",
  },
  "& tbody tr:nth-of-type(even):not([data-selected='true']) td": {
    background:
      "color-mix(in srgb, var(--chakra-colors-fg) 2.5%, transparent)",
  },
  "& tbody tr:hover:not([data-selected='true']) td": {
    background:
      "color-mix(in srgb, var(--chakra-colors-fg) 5%, transparent)",
  },
  "& tbody tr[data-selected='true'] td": {
    background:
      "color-mix(in srgb, var(--chakra-colors-brand-500) 10%, transparent) !important",
  },
  "& tbody tr[data-selected='true'] td:first-of-type": {
    boxShadow: "inset 2px 0 0 var(--chakra-colors-brand-500)",
  },
  "& .row-gutter": {
    color: "var(--chakra-colors-fg-muted)",
    opacity: 0.4,
    fontVariantNumeric: "tabular-nums",
    textAlign: "right",
    width: "44px",
    minWidth: "44px",
    paddingLeft: "10px",
    paddingRight: "10px",
    fontSize: "10px",
    userSelect: "none",
    cursor: "pointer",
  },
  "& thead .row-gutter": {
    opacity: 0.3,
  },
  "& .cell-numeric": {
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  },
  "& .cell-null": {
    fontStyle: "italic",
    color: "var(--chakra-colors-fg-muted)",
    opacity: 0.55,
  },
  "& .type-label": {
    fontSize: "9px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--chakra-colors-fg-muted)",
    opacity: 0.5,
    fontWeight: 500,
    paddingLeft: "6px",
  },
} as const;

export function ResultTable({
  columns,
  rows,
  durationMs,
  hasMore,
  loadingMore,
  onLoadMore,
}: ResultTableProps) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [copiedRow, setCopiedRow] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || loadingMore || !hasMore || !onLoadMore) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      onLoadMore();
    }
  }, [loadingMore, hasMore, onLoadMore]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      expandedRow === index ? ROW_HEIGHT + EXPANDED_OVERHEAD : ROW_HEIGHT,
    overscan: 10,
  });

  const copyRowAsJson = useCallback(
    (rowIdx: number) => {
      const row = rows[rowIdx];
      if (!row) return;
      const payload: Record<string, CellValue> = {};
      for (const col of columns) {
        payload[col.name] = row[col.name] ?? null;
      }
      const text = JSON.stringify(payload, null, 2);
      void navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopiedRow(rowIdx);
          window.setTimeout(() => setCopiedRow((v) => (v === rowIdx ? null : v)), 1200);
        })
        .catch(() => {});
    },
    [columns, rows],
  );

  if (columns.length === 0) {
    return (
      <Box p={3} color="fg.muted" fontSize="sm">
        No columns returned
      </Box>
    );
  }

  return (
    <Box>
      <Box
        ref={scrollRef}
        maxH="340px"
        overflowY="auto"
        overflowX="auto"
        onScroll={handleScroll}
        onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
        onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
        onCopy={(e: React.ClipboardEvent) => e.stopPropagation()}
        tabIndex={0}
      >
        <Table.Root
          size="sm"
          stickyHeader
          fontSize="xs"
          fontFamily="mono"
          css={tableCss}
        >
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader className="row-gutter" title="Row index">
                #
              </Table.ColumnHeader>
              {columns.map((col, i) => {
                const numeric = isNumericType(col.type);
                return (
                  <Table.ColumnHeader
                    key={i}
                    title={`${col.name} (${col.type})`}
                    className={numeric ? "cell-numeric" : undefined}
                  >
                    <HStack gap={0} align="baseline" justify={numeric ? "flex-end" : undefined}>
                      <Box as="span">{col.name}</Box>
                      <Box as="span" className="type-label">
                        {col.type}
                      </Box>
                    </HStack>
                  </Table.ColumnHeader>
                );
              })}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.length === 0 ? (
              <Table.Row>
                <Table.Cell
                  colSpan={columns.length + 1}
                  textAlign="center"
                  color="fg.muted"
                  py={6}
                >
                  <Box
                    fontSize="10px"
                    textTransform="uppercase"
                    letterSpacing="0.08em"
                    opacity={0.55}
                  >
                    No rows returned
                  </Box>
                </Table.Cell>
              </Table.Row>
            ) : (
              <>
                {virtualizer.getVirtualItems()[0]?.start > 0 && (
                  <Table.Row>
                    <Table.Cell
                      colSpan={columns.length + 1}
                      h={`${virtualizer.getVirtualItems()[0].start}px`}
                      p={0}
                      borderBottom="none"
                    />
                  </Table.Row>
                )}
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const rowIdx = virtualRow.index;
                  const row = rows[rowIdx];
                  const isExpanded = expandedRow === rowIdx;
                  const wasCopied = copiedRow === rowIdx;
                  return (
                    <Fragment key={rowIdx}>
                      <Table.Row
                        data-index={virtualRow.index}
                        data-selected={isExpanded ? "true" : undefined}
                        onClick={() => {
                          const sel = window.getSelection();
                          if (sel && sel.toString().length > 0) return;
                          setExpandedRow(isExpanded ? null : rowIdx);
                        }}
                      >
                        <Table.Cell
                          className="row-gutter"
                          title={`Row ${rowIdx + 1}`}
                        >
                          {rowIdx + 1}
                        </Table.Cell>
                        {columns.map((col, colIdx) => {
                          const cell = row[col.name] ?? null;
                          const { text, isNull } = formatCellValue(cell);
                          const numeric = isNumericType(col.type);
                          const className = [
                            numeric ? "cell-numeric" : "",
                            isNull ? "cell-null" : "",
                          ]
                            .filter(Boolean)
                            .join(" ");
                          return (
                            <Table.Cell
                              key={colIdx}
                              title={text}
                              className={className || undefined}
                            >
                              {text}
                            </Table.Cell>
                          );
                        })}
                      </Table.Row>
                      {isExpanded && (
                        <Table.Row>
                          <Table.Cell
                            colSpan={columns.length + 1}
                            p={0}
                            bg="bg.subtle"
                            borderBottom="1px solid"
                            borderColor="border"
                          >
                            <Box
                              px={3}
                              py={2.5}
                              borderLeft="2px solid"
                              borderColor="brand.500"
                            >
                              <Flex
                                align="center"
                                justify="space-between"
                                mb={2}
                                gap={2}
                              >
                                <Box
                                  fontSize="10px"
                                  textTransform="uppercase"
                                  letterSpacing="0.08em"
                                  fontWeight="600"
                                  color="fg.muted"
                                >
                                  Row {rowIdx + 1}
                                  <Box
                                    as="span"
                                    ml={2}
                                    opacity={0.5}
                                    fontWeight="400"
                                    textTransform="none"
                                    letterSpacing="normal"
                                  >
                                    {columns.length} field
                                    {columns.length === 1 ? "" : "s"}
                                  </Box>
                                </Box>
                                <HStack gap={0}>
                                  <IconButton
                                    size="2xs"
                                    variant="ghost"
                                    aria-label="Copy row as JSON"
                                    title={
                                      wasCopied ? "Copied" : "Copy as JSON"
                                    }
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      copyRowAsJson(rowIdx);
                                    }}
                                    colorPalette={wasCopied ? "green" : "gray"}
                                  >
                                    <LuCopy />
                                  </IconButton>
                                  <IconButton
                                    size="2xs"
                                    variant="ghost"
                                    aria-label="Close row"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedRow(null);
                                    }}
                                  >
                                    <LuX />
                                  </IconButton>
                                </HStack>
                              </Flex>
                              <Box
                                display="grid"
                                gridTemplateColumns="max-content 1fr"
                                columnGap={4}
                                rowGap={1}
                                fontSize="xs"
                                fontFamily="mono"
                              >
                                {columns.map((col) => {
                                  const value = row[col.name] ?? null;
                                  return (
                                    <Fragment key={col.name}>
                                      <Box
                                        py="3px"
                                        whiteSpace="nowrap"
                                        minW={0}
                                      >
                                        <Box
                                          as="span"
                                          color="fg"
                                          fontWeight="600"
                                        >
                                          {col.name}
                                        </Box>
                                        <Box
                                          as="span"
                                          className="type-label"
                                        >
                                          {col.type}
                                        </Box>
                                      </Box>
                                      <Box py="3px" minW={0}>
                                        <DetailValue value={value} />
                                      </Box>
                                    </Fragment>
                                  );
                                })}
                              </Box>
                            </Box>
                          </Table.Cell>
                        </Table.Row>
                      )}
                    </Fragment>
                  );
                })}
                {(() => {
                  const items = virtualizer.getVirtualItems();
                  const lastItem = items[items.length - 1];
                  const remaining = lastItem
                    ? virtualizer.getTotalSize() - lastItem.end
                    : 0;
                  return remaining > 0 ? (
                    <Table.Row>
                      <Table.Cell
                        colSpan={columns.length + 1}
                        h={`${remaining}px`}
                        p={0}
                        borderBottom="none"
                      />
                    </Table.Row>
                  ) : null;
                })()}
              </>
            )}
          </Table.Body>
        </Table.Root>
      </Box>

      {/* Footer — rendered only when the caller provides stats (durationMs)
          or there is actionable state (truncation / loading). For the fenced
          panel (which has its own document-level statusbar) the caller
          omits durationMs, keeping this surface silent. For the legacy
          DbBlockView (no external statusbar) the footer carries the count
          + duration in a single unobtrusive line. */}
      {(durationMs != null || hasMore || loadingMore) && (
        <Flex
          align="center"
          justify="space-between"
          px={3}
          py={1.5}
          fontSize="xs"
          fontFamily="mono"
          color="fg.muted"
        >
          <HStack gap={2}>
            {durationMs != null && (
              <>
                <Box as="span" color="fg" opacity={0.85}>
                  {rows.length.toLocaleString()}
                </Box>
                <Box as="span" opacity={0.6}>
                  row{rows.length === 1 ? "" : "s"}
                </Box>
                <Box as="span" opacity={0.3}>·</Box>
                <Box as="span" opacity={0.6}>
                  {formatElapsed(durationMs)}
                </Box>
              </>
            )}
            {hasMore && (
              <>
                {durationMs != null && <Box as="span" opacity={0.3}>·</Box>}
                <Box as="span" color="yellow.500" opacity={0.85}>
                  truncated
                </Box>
              </>
            )}
            {loadingMore && <Spinner size="xs" />}
          </HStack>

          {hasMore && onLoadMore && !loadingMore && (
            <Button
              size="xs"
              variant="ghost"
              onClick={onLoadMore}
              fontFamily="mono"
              color="fg.muted"
              _hover={{ color: "fg", bg: "transparent" }}
            >
              Load more →
            </Button>
          )}
        </Flex>
      )}
    </Box>
  );
}
