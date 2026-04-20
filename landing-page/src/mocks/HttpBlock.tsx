import { useState } from "react";
import { Box, Flex, Badge, HStack, Text } from "@chakra-ui/react";
import { ExecutableBlockShell } from "@/components/blocks/ExecutableBlockShell";
import type { DisplayMode, ExecutionState } from "@/components/blocks/ExecutableBlock";
import { CodeBlock } from "./SyntaxHighlight";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: "green",
  POST: "blue",
  PUT: "yellow",
  PATCH: "orange",
  DELETE: "red",
};

interface KeyValue {
  key: string;
  value: string;
}

interface MockHttpBlockProps {
  alias: string;
  method: HttpMethod;
  url: string;
  headers?: KeyValue[];
  body?: string;
  response?: {
    status: number;
    statusText: string;
    elapsed: string;
    size: string;
    body: string;
  };
  activeTab?: string;
  defaultMode?: DisplayMode;
}


function Tabs({ items, active, onSelect }: { items: string[]; active: string; onSelect: (t: string) => void }) {
  return (
    <Flex borderBottom="1px solid" borderColor="border">
      {items.map((item) => (
        <Text
          key={item}
          px={3}
          py={1.5}
          fontSize="xs"
          color={item === active ? "brand.400" : "fg.muted"}
          borderBottom="2px solid"
          borderColor={item === active ? "brand.400" : "transparent"}
          cursor="pointer"
          onClick={() => onSelect(item)}
          _hover={{ color: "brand.400" }}
          transition="color 0.15s"
        >
          {item}
        </Text>
      ))}
    </Flex>
  );
}

function KeyValueRows({ items }: { items: KeyValue[] }) {
  return (
    <Box>
      {items.map((item, i) => (
        <Flex
          key={i}
          borderBottom="1px solid"
          borderColor="border"
          fontSize="xs"
          fontFamily="mono"
        >
          <Text px={3} py={1.5} color="fg.muted" w="40%" borderRight="1px solid" borderColor="border">
            {item.key}
          </Text>
          <Text px={3} py={1.5} color="fg">
            {item.value}
          </Text>
        </Flex>
      ))}
    </Box>
  );
}

export function MockHttpBlock({
  alias: initialAlias,
  method,
  url,
  headers,
  body,
  response,
  activeTab: initialTab = "Body",
  defaultMode = "split",
}: MockHttpBlockProps) {
  const [alias, setAlias] = useState(initialAlias);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(defaultMode);
  const [activeTab, setActiveTab] = useState(initialTab);

  const executionState: ExecutionState = response ? "success" : "idle";

  const inputSlot = (
    <Box>
      <Flex align="center" gap={2} px={3} py={2} borderBottom="1px solid" borderColor="border">
        <Badge size="sm" colorPalette={METHOD_COLORS[method]} variant="solid" fontFamily="mono" fontSize="xs">
          {method}
        </Badge>
        <Text fontFamily="mono" fontSize="xs" color="fg.muted" flex={1}>
          {url}
        </Text>
      </Flex>
      <Tabs items={["Params", "Headers", "Body", "Settings"]} active={activeTab} onSelect={setActiveTab} />
      {activeTab === "Headers" && headers && <KeyValueRows items={headers} />}
      {activeTab === "Body" && body && <CodeBlock language="json">{body}</CodeBlock>}
      {activeTab === "Params" && (
        <Box px={3} py={3}><Text fontSize="xs" color="fg.muted">No query parameters</Text></Box>
      )}
      {activeTab === "Settings" && (
        <Box px={3} py={3}><Text fontSize="xs" color="fg.muted">Timeout: 30s (default)</Text></Box>
      )}
    </Box>
  );

  const outputSlot = response ? (
    <Box>
      <HStack gap={3} px={3} py={2} borderBottom="1px solid" borderColor="border">
        <Badge
          size="sm"
          variant="subtle"
          colorPalette={response.status < 300 ? "green" : response.status < 400 ? "yellow" : "red"}
          fontFamily="mono"
          fontSize="xs"
        >
          {response.status} {response.statusText}
        </Badge>
        <Text fontSize="xs" color="fg.muted">{response.elapsed}</Text>
        <Text fontSize="xs" color="fg.muted">{response.size}</Text>
      </HStack>
      <CodeBlock language="json">{response.body}</CodeBlock>
    </Box>
  ) : undefined;

  return (
    <ExecutableBlockShell
      blockType="http"
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
