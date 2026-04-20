import { useState } from "react";
import { Box, Flex, Badge, Text } from "@chakra-ui/react";
import { ExecutableBlockShell } from "@/components/blocks/ExecutableBlockShell";
import { ResultTable } from "@/components/blocks/db/ResultTable";
import type { DisplayMode, ExecutionState } from "@/components/blocks/ExecutableBlock";
import { CodeBlock } from "./SyntaxHighlight";

interface Column {
  name: string;
  type: string;
}

interface MockDbBlockProps {
  alias: string;
  connection: string;
  query: string;
  columns?: Column[];
  rows?: Record<string, string | number | null>[];
  totalRows?: number;
  defaultMode?: DisplayMode;
}

export function MockDbBlock({
  alias: initialAlias,
  connection,
  query,
  columns,
  rows,
  totalRows,
  defaultMode = "split",
}: MockDbBlockProps) {
  const [alias, setAlias] = useState(initialAlias);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(defaultMode);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  const executionState: ExecutionState = rows ? "success" : "idle";

  const inputSlot = (
    <Box>
      <Flex align="center" gap={2} px={3} py={2} borderBottom="1px solid" borderColor="border">
        <Badge size="sm" colorPalette="purple" variant="solid" fontFamily="mono" fontSize="xs">
          SQL
        </Badge>
        <Text fontFamily="mono" fontSize="xs" color="fg.muted">
          {connection}
        </Text>
      </Flex>
      <CodeBlock language="sql">{query}</CodeBlock>
    </Box>
  );

  const outputSlot = columns && rows ? (
    <ResultTable
      columns={columns}
      rows={rows}
      totalRows={totalRows ?? rows.length}
      page={page}
      pageSize={pageSize}
      onPageChange={(p, ps) => { setPage(p); setPageSize(ps); }}
    />
  ) : undefined;

  return (
    <ExecutableBlockShell
      blockType="db"
      alias={alias}
      displayMode={displayMode}
      executionState={executionState}
      onAliasChange={setAlias}
      onDisplayModeChange={setDisplayMode}
      onRun={() => {}}
      onCancel={() => {}}
      splitDirection="column"
      inputSlot={inputSlot}
      outputSlot={outputSlot}
    />
  );
}
