import { Box, Flex, HStack, Text, IconButton, Input } from "@chakra-ui/react";
import { NativeSelectRoot, NativeSelectField } from "@chakra-ui/react";
import {
  LuChevronsLeft,
  LuChevronLeft,
  LuChevronRight,
  LuChevronsRight,
} from "react-icons/lu";
import { Fragment, useCallback, useState } from "react";

interface ResultTableProps {
  columns: { name: string; type: string }[];
  rows: Record<string, string | number | boolean | null>[];
  totalRows: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number, pageSize: number) => void;
}

const PAGE_SIZES = [25, 50, 100, 500];

type CellValue = string | number | boolean | null;

function formatCellValue(value: CellValue): {
  text: string;
  isNull: boolean;
} {
  if (value === null) return { text: "NULL", isNull: true };
  if (typeof value === "boolean") return { text: value.toString(), isNull: false };
  return { text: String(value), isNull: false };
}

function tryParseJson(value: CellValue): { parsed: unknown; isJson: boolean } {
  if (typeof value !== "string") return { parsed: value, isJson: false };
  const trimmed = value.trim();
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return { parsed: JSON.parse(trimmed), isJson: true };
    } catch {
      return { parsed: value, isJson: false };
    }
  }
  return { parsed: value, isJson: false };
}

function DetailValue({ value }: { value: CellValue }) {
  if (value === null) {
    return <Text as="span" fontStyle="italic" color="fg.muted" opacity={0.6}>NULL</Text>;
  }
  const { parsed, isJson } = tryParseJson(value);
  if (isJson) {
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
        {JSON.stringify(parsed, null, 2)}
      </Box>
    );
  }
  return <Text as="span" wordBreak="break-all">{String(value)}</Text>;
}

export function ResultTable({
  columns,
  rows,
  totalRows,
  page,
  pageSize,
  onPageChange,
}: ResultTableProps) {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const startRow = (page - 1) * pageSize + 1;
  const endRow = Math.min(page * pageSize, totalRows);
  const [goToPage, setGoToPage] = useState("");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const handleGoToPage = useCallback(() => {
    const p = parseInt(goToPage);
    if (p >= 1 && p <= totalPages) {
      onPageChange(p, pageSize);
      setGoToPage("");
    }
  }, [goToPage, totalPages, pageSize, onPageChange]);

  if (columns.length === 0) {
    return (
      <Box p={3} color="fg.muted" fontSize="sm">
        No columns returned
      </Box>
    );
  }

  return (
    <Box>
      {/* Table */}
      <Box
        overflowX="auto"
        border="1px solid"
        borderColor="border"
        rounded="md"
        maxH="300px"
        overflowY="auto"
      >
        <Box
          as="table"
          w="100%"
          fontSize="xs"
          fontFamily="mono"
          tabIndex={0}
          onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
          onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
          onCopy={(e: React.ClipboardEvent) => e.stopPropagation()}
          css={{
            borderCollapse: "collapse",
            userSelect: "text",
            cursor: "text",
            "& th, & td": {
              px: "8px",
              py: "4px",
              borderBottom: "1px solid var(--chakra-colors-border)",
              borderRight: "1px solid var(--chakra-colors-border)",
              textAlign: "left",
              whiteSpace: "nowrap",
              maxWidth: "300px",
              overflow: "hidden",
              textOverflow: "ellipsis",
            },
            "& th": {
              bg: "var(--chakra-colors-bg-subtle)",
              fontWeight: "semibold",
              position: "sticky",
              top: 0,
              zIndex: 1,
            },
            "& tr:hover td": {
              bg: "var(--chakra-colors-bg-subtle)",
            },
          }}
        >
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th key={i} title={`${col.name} (${col.type})`}>
                  {col.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => {
              const isExpanded = expandedRow === rowIdx;
              return (
                <Fragment key={rowIdx}>
                  <tr
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
                        <td
                          key={colIdx}
                          title={text}
                          style={
                            isNull
                              ? {
                                  fontStyle: "italic",
                                  color: "var(--chakra-colors-fg-muted)",
                                  opacity: 0.6,
                                }
                              : undefined
                          }
                        >
                          {text}
                        </td>
                      );
                    })}
                  </tr>
                  {isExpanded && (
                    <tr key={`${rowIdx}-detail`}>
                      <td
                        colSpan={columns.length}
                        style={{ padding: 0, background: "var(--chakra-colors-bg-subtle)" }}
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
                              borderBottom: "1px solid var(--chakra-colors-border)",
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
                                  <Text as="span" ml={1} fontSize="2xs" opacity={0.5}>
                                    {col.type}
                                  </Text>
                                </Box>
                                <Box>
                                  <DetailValue value={value} />
                                </Box>
                              </Fragment>
                            );
                          })}
                        </Box>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{ textAlign: "center", color: "var(--chakra-colors-fg-muted)" }}
                >
                  No rows
                </td>
              </tr>
            )}
          </tbody>
        </Box>
      </Box>

      {/* Pagination bar */}
      <Flex
        align="center"
        justify="space-between"
        px={2}
        py={1.5}
        fontSize="xs"
        color="fg.muted"
        flexWrap="wrap"
        gap={2}
      >
        <Text>
          Showing {startRow}-{endRow} of {totalRows} rows
        </Text>

        <HStack gap={1}>
          {/* Page size selector */}
          <NativeSelectRoot size="xs" width="70px">
            <NativeSelectField
              value={pageSize}
              onChange={(e) => onPageChange(1, parseInt(e.target.value))}
              fontSize="xs"
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </NativeSelectField>
          </NativeSelectRoot>

          {/* Navigation */}
          <IconButton
            aria-label="First page"
            size="2xs"
            variant="ghost"
            onClick={() => onPageChange(1, pageSize)}
            disabled={page <= 1}
          >
            <LuChevronsLeft />
          </IconButton>
          <IconButton
            aria-label="Previous page"
            size="2xs"
            variant="ghost"
            onClick={() => onPageChange(page - 1, pageSize)}
            disabled={page <= 1}
          >
            <LuChevronLeft />
          </IconButton>

          <Text fontSize="xs" whiteSpace="nowrap">
            {page} / {totalPages}
          </Text>

          <IconButton
            aria-label="Next page"
            size="2xs"
            variant="ghost"
            onClick={() => onPageChange(page + 1, pageSize)}
            disabled={page >= totalPages}
          >
            <LuChevronRight />
          </IconButton>
          <IconButton
            aria-label="Last page"
            size="2xs"
            variant="ghost"
            onClick={() => onPageChange(totalPages, pageSize)}
            disabled={page >= totalPages}
          >
            <LuChevronsRight />
          </IconButton>

          {/* Go to page */}
          <Input
            size="xs"
            w="40px"
            px={1}
            textAlign="center"
            placeholder="#"
            value={goToPage}
            onChange={(e) => setGoToPage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleGoToPage();
            }}
          />
        </HStack>
      </Flex>
    </Box>
  );
}
