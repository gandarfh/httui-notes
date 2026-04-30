// Canvas §5 — center column of the Connections refined page.
//
// This slice ships the header (H1 + status text), action buttons
// ("▶ Test all" + "+ Nova"), the search box, and the
// no-connection-selected empty state. Compact list rows + row
// selection wire up in the next slice (Story 01 follow-up).
//
// Pure presentational; counts come from the consumer.

import { Box, Flex, HStack, Heading, Stack, Text } from "@chakra-ui/react";

import { Btn } from "@/components/atoms";

export interface ListStatusCounts {
  total: number;
  ok: number;
  slow: number;
  down: number;
}

export interface ConnectionsListPanelProps {
  status: ListStatusCounts;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onTestAll: () => void;
  onCreateNew: () => void;
  /** Slice 1 ships an empty state inline. Slice 2 will replace
   * this region with the compact list rows. */
  emptyHint?: string;
}

const SEARCH_PLACEHOLDER = "Buscar por nome, host, env… ⌘K";

export function ConnectionsListPanel({
  status,
  searchValue,
  onSearchChange,
  onTestAll,
  onCreateNew,
  emptyHint = "Select a connection or create a new one",
}: ConnectionsListPanelProps) {
  return (
    <Stack
      data-testid="connections-list-panel"
      flex={1}
      h="full"
      gap={3}
      px={5}
      py={4}
      align="stretch"
      overflowY="auto"
    >
      <Flex align="flex-start" justify="space-between" gap={4}>
        <Box>
          <Heading
            as="h1"
            fontFamily="serif"
            fontSize="26px"
            fontWeight={500}
            lineHeight={1.1}
          >
            Connections
          </Heading>
          <HStack
            gap={1}
            mt={1}
            data-testid="connections-list-status"
            fontFamily="mono"
            fontSize="11px"
          >
            <Text color="fg.2">{status.total}</Text>
            <Text color="fg.3">·</Text>
            <Text color="green.fg">{status.ok} ok</Text>
            <Text color="fg.3">·</Text>
            <Text color="yellow.fg">{status.slow} slow</Text>
            <Text color="fg.3">·</Text>
            <Text color="red.fg">{status.down} down</Text>
          </HStack>
        </Box>
        <HStack gap={2} flexShrink={0}>
          <Btn
            variant="ghost"
            data-testid="connections-test-all"
            onClick={onTestAll}
          >
            ▶ Test all
          </Btn>
          <Btn
            variant="primary"
            data-testid="connections-create-new"
            onClick={onCreateNew}
          >
            + Nova
          </Btn>
        </HStack>
      </Flex>

      <Box
        as="input"
        data-testid="connections-search"
        type="text"
        value={searchValue}
        placeholder={SEARCH_PLACEHOLDER}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onSearchChange(e.target.value)
        }
        h="32px"
        px={3}
        fontSize="12px"
        fontFamily="mono"
        bg="bg.2"
        color="fg"
        borderWidth="1px"
        borderColor="line"
        borderRadius="6px"
        outline="none"
        _focus={{ borderColor: "accent" }}
      />

      <Flex
        flex={1}
        align="center"
        justify="center"
        data-testid="connections-list-empty"
      >
        <Text fontSize="13px" color="fg.3">
          {emptyHint}
        </Text>
      </Flex>

      <Text
        data-testid="connections-list-footer"
        fontSize="10px"
        color="fg.3"
        textAlign="center"
        mt={1}
      >
        ⌘P abre quick-edit · ⌘⇧N nova · ⌘⌥T testar todas
      </Text>
    </Stack>
  );
}
