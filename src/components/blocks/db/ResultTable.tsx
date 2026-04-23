import { Box, Button, Flex, HStack, Spinner, Table } from "@chakra-ui/react";
import { Fragment, useCallback, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { CellValue } from "./types";

interface ResultTableProps {
  columns: { name: string; type: string }[];
  rows: Record<string, CellValue>[];
  durationMs?: number | null;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
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

function JsonBlock({ value }: { value: unknown }) {
  return (
    <Box
      as="pre"
      m={0}
      p={2}
      bg="bg.subtle"
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
  // Already a structured value (JSON column, array) — render directly.
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

const ROW_HEIGHT = 24;

export function ResultTable({
  columns,
  rows,
  durationMs,
  hasMore,
  loadingMore,
  onLoadMore,
}: ResultTableProps) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || loadingMore || !hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      onLoadMore();
    }
  }, [loadingMore, hasMore, onLoadMore]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      expandedRow === index ? ROW_HEIGHT + 120 : ROW_HEIGHT,
    overscan: 10,
  });

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
        maxH="300px"
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
          css={{
            userSelect: "text",
            cursor: "text",
            "& td, & th": {
              whiteSpace: "nowrap",
              maxWidth: "300px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              padding: "2px 10px",
              lineHeight: "20px",
            },
            "& thead th": {
              background: "var(--chakra-colors-blackAlpha-200)",
              fontWeight: 600,
              borderBottom: "1px solid var(--chakra-colors-border)",
            },
            "& tbody tr:nth-of-type(even) td": {
              background: "var(--chakra-colors-blackAlpha-50)",
            },
            "& tbody tr:hover td": {
              background: "var(--chakra-colors-blackAlpha-200)",
            },
          }}
        >
          <Table.Header>
            <Table.Row>
              {columns.map((col, i) => (
                <Table.ColumnHeader key={i} title={`${col.name} (${col.type})`}>
                  <HStack gap={1} align="baseline">
                    <Box as="span">{col.name}</Box>
                    <Box
                      as="span"
                      fontSize="2xs"
                      color="fg.muted"
                      opacity={0.7}
                      fontWeight="normal"
                    >
                      {col.type}
                    </Box>
                  </HStack>
                </Table.ColumnHeader>
              ))}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.length === 0 ? (
              <Table.Row>
                <Table.Cell
                  colSpan={columns.length}
                  textAlign="center"
                  color="fg.muted"
                >
                  No rows
                </Table.Cell>
              </Table.Row>
            ) : (
              <>
                {/* Top spacer */}
                {virtualizer.getVirtualItems()[0]?.start > 0 && (
                  <Table.Row>
                    <Table.Cell
                      colSpan={columns.length}
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
                  return (
                    <Fragment key={rowIdx}>
                      <Table.Row
                        data-index={virtualRow.index}
                        _hover={{ bg: "bg.subtle" }}
                        onClick={() => {
                          const sel = window.getSelection();
                          if (sel && sel.toString().length > 0) return;
                          setExpandedRow(isExpanded ? null : rowIdx);
                        }}
                      >
                        {columns.map((col, colIdx) => {
                          const cell = row[col.name] ?? null;
                          const { text, isNull } = formatCellValue(cell);
                          return (
                            <Table.Cell
                              key={colIdx}
                              title={text}
                              fontStyle={isNull ? "italic" : undefined}
                              color={isNull ? "fg.muted" : undefined}
                              opacity={isNull ? 0.6 : undefined}
                            >
                              {text}
                            </Table.Cell>
                          );
                        })}
                      </Table.Row>
                      {isExpanded && (
                        <Table.Row>
                          <Table.Cell
                            colSpan={columns.length}
                            p={0}
                            bg="bg.subtle"
                          >
                            <Box
                              display="grid"
                              gridTemplateColumns="auto 1fr"
                              gap={0}
                              px={3}
                              py={2}
                              fontSize="xs"
                              fontFamily="mono"
                              css={{
                                "& > *": {
                                  py: "4px",
                                  borderBottom:
                                    "1px solid var(--chakra-colors-border)",
                                },
                              }}
                            >
                              {columns.map((col) => {
                                const value = row[col.name] ?? null;
                                return (
                                  <Fragment key={col.name}>
                                    <Box
                                      fontWeight="semibold"
                                      color="fg.muted"
                                      pr={4}
                                      whiteSpace="nowrap"
                                    >
                                      {col.name}
                                      <Box
                                        as="span"
                                        ml={1}
                                        fontSize="2xs"
                                        opacity={0.5}
                                      >
                                        {col.type}
                                      </Box>
                                    </Box>
                                    <Box>
                                      <DetailValue value={value} />
                                    </Box>
                                  </Fragment>
                                );
                              })}
                            </Box>
                          </Table.Cell>
                        </Table.Row>
                      )}
                    </Fragment>
                  );
                })}
                {/* Bottom spacer */}
                {(() => {
                  const items = virtualizer.getVirtualItems();
                  const lastItem = items[items.length - 1];
                  const remaining = lastItem
                    ? virtualizer.getTotalSize() - lastItem.end
                    : 0;
                  return remaining > 0 ? (
                    <Table.Row>
                      <Table.Cell
                        colSpan={columns.length}
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

      {/* Footer */}
      <Flex
        align="center"
        justify="space-between"
        px={2}
        py={1.5}
        fontSize="xs"
        color="fg.muted"
      >
        <HStack gap={1}>
          <Box as="span">{rows.length} rows fetched</Box>
          {durationMs != null && (
            <>
              <Box as="span" opacity={0.4}>·</Box>
              <Box as="span">{durationMs}ms</Box>
            </>
          )}
          {loadingMore && <Spinner size="xs" />}
        </HStack>

        {hasMore && !loadingMore && (
          <Button size="xs" variant="ghost" onClick={onLoadMore}>
            Load more
          </Button>
        )}
      </Flex>
    </Box>
  );
}
