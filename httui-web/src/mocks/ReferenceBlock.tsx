import { useState } from "react";
import { Box, Flex, Badge, Text } from "@chakra-ui/react";
import { LuArrowDown } from "react-icons/lu";
import { ExecutableBlockShell } from "@/components/blocks/ExecutableBlockShell";
import type { DisplayMode } from "@/components/blocks/ExecutableBlock";
import { CodeBlock } from "./SyntaxHighlight";

interface MockReferenceBlockProps {
  httpAlias: string;
  httpMethod: string;
  httpUrl: string;
  httpResponse: string;
  dbAlias: string;
  dbConnection: string;
  dbQuery: string;
  referenceHighlight: string;
  dbColumns: { name: string }[];
  dbRows: Record<string, string | number>[];
}

export function MockReferenceBlock({
  httpAlias,
  httpMethod,
  httpUrl,
  httpResponse,
  dbAlias: initialDbAlias,
  dbConnection,
  dbQuery,
  referenceHighlight,
  dbColumns,
  dbRows,
}: MockReferenceBlockProps) {
  const [httpDisplayMode, setHttpDisplayMode] = useState<DisplayMode>("output");
  const [dbDisplayMode, setDbDisplayMode] = useState<DisplayMode>("split");
  const [httpAliasState, setHttpAliasState] = useState(httpAlias);
  const [dbAliasState, setDbAliasState] = useState(initialDbAlias);

  return (
    <Flex direction="column" gap={0}>
      {/* HTTP Block */}
      <ExecutableBlockShell
        blockType="http"
        alias={httpAliasState}
        displayMode={httpDisplayMode}
        executionState="success"
        onAliasChange={setHttpAliasState}
        onDisplayModeChange={setHttpDisplayMode}
        onRun={() => {}}
        onCancel={() => {}}
        splitDirection="column"
        inputSlot={
          <Flex align="center" gap={2} px={3} py={2}>
            <Badge
              size="sm"
              colorPalette="blue"
              variant="solid"
              fontFamily="mono"
              fontSize="xs"
            >
              {httpMethod}
            </Badge>
            <Text fontFamily="mono" fontSize="xs" color="fg.muted">
              {httpUrl}
            </Text>
          </Flex>
        }
        outputSlot={
          <Box>
            <Flex
              align="center"
              gap={2}
              px={3}
              py={2}
              borderBottom="1px solid"
              borderColor="border"
            >
              <Badge
                size="sm"
                colorPalette="blue"
                variant="solid"
                fontFamily="mono"
                fontSize="xs"
              >
                {httpMethod}
              </Badge>
              <Text fontFamily="mono" fontSize="xs" color="fg.muted">
                {httpUrl}
              </Text>
            </Flex>
            <CodeBlock language="json">{httpResponse}</CodeBlock>
          </Box>
        }
      />

      {/* Arrow */}
      <Flex justify="center" py={1} color="brand.400">
        <LuArrowDown size={20} />
      </Flex>

      {/* DB Block referencing the HTTP result */}
      <ExecutableBlockShell
        blockType="db"
        alias={dbAliasState}
        displayMode={dbDisplayMode}
        executionState="success"
        onAliasChange={setDbAliasState}
        onDisplayModeChange={setDbDisplayMode}
        onRun={() => {}}
        onCancel={() => {}}
        splitDirection="column"
        inputSlot={
          <Box>
            <Flex
              align="center"
              gap={2}
              px={3}
              py={2}
              borderBottom="1px solid"
              borderColor="border"
            >
              <Badge
                size="sm"
                colorPalette="purple"
                variant="solid"
                fontFamily="mono"
                fontSize="xs"
              >
                SQL
              </Badge>
              <Text fontFamily="mono" fontSize="xs" color="fg.muted">
                {dbConnection}
              </Text>
            </Flex>
            <Box
              as="pre"
              fontFamily="mono"
              fontSize="xs"
              color="purple.300"
              p={3}
              m={0}
              lineHeight="1.6"
              whiteSpace="pre-wrap"
            >
              {dbQuery.split(referenceHighlight).map((part, i, arr) =>
                i < arr.length - 1 ? (
                  <Text as="span" key={i}>
                    {part}
                    <Text
                      as="span"
                      bg="brand.400/15"
                      color="brand.400"
                      px={1}
                      rounded="sm"
                    >
                      {referenceHighlight}
                    </Text>
                  </Text>
                ) : (
                  <Text as="span" key={i}>
                    {part}
                  </Text>
                ),
              )}
            </Box>
          </Box>
        }
        outputSlot={
          <Box overflowX="auto">
            <Box
              as="table"
              w="100%"
              css={{ borderCollapse: "collapse" }}
              fontSize="xs"
              fontFamily="mono"
            >
              <Box as="thead">
                <Box as="tr">
                  {dbColumns.map((col) => (
                    <Box
                      as="th"
                      key={col.name}
                      textAlign="left"
                      px={3}
                      py={1.5}
                      color="fg.muted"
                      fontWeight="600"
                      borderBottom="1px solid"
                      borderColor="border"
                      bg="bg.subtle"
                    >
                      {col.name}
                    </Box>
                  ))}
                </Box>
              </Box>
              <Box as="tbody">
                {dbRows.map((row, i) => (
                  <Box as="tr" key={i}>
                    {dbColumns.map((col) => (
                      <Box
                        as="td"
                        key={col.name}
                        px={3}
                        py={1.5}
                        color="fg"
                        borderBottom="1px solid"
                        borderColor="border"
                      >
                        {String(row[col.name])}
                      </Box>
                    ))}
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        }
      />
    </Flex>
  );
}
