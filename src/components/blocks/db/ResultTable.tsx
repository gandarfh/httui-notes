import { Box, Flex, HStack, Text, IconButton, Input } from "@chakra-ui/react";
import { NativeSelectRoot, NativeSelectField } from "@chakra-ui/react";
import {
  LuChevronsLeft,
  LuChevronLeft,
  LuChevronRight,
  LuChevronsRight,
} from "react-icons/lu";
import { useCallback, useState } from "react";

interface ResultTableProps {
  columns: { name: string; type: string }[];
  rows: (string | number | boolean | null)[][];
  totalRows: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number, pageSize: number) => void;
}

const PAGE_SIZES = [25, 50, 100, 500];

function formatCellValue(value: string | number | boolean | null): {
  text: string;
  isNull: boolean;
} {
  if (value === null) return { text: "NULL", isNull: true };
  if (typeof value === "boolean") return { text: value.toString(), isNull: false };
  return { text: String(value), isNull: false };
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
        <Box as="table" w="100%" fontSize="xs" fontFamily="mono" css={{
          borderCollapse: "collapse",
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
        }}>
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
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {row.map((cell, colIdx) => {
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
            ))}
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
