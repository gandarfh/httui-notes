// Canvas §5 — right column of the Connections refined page (420px).
//
// Slice 1 ships only the empty / no-selection state. Subsequent
// slices fill the credentials section (Story 02), schema preview
// (Story 03), used-in-runbooks (Story 04), and footer actions
// (Story 05).

import { Box, Stack, Text } from "@chakra-ui/react";

export interface ConnectionsDetailPanelProps {
  /** Currently-selected connection name, or `null` for no
   * selection. Slice 1 only renders the empty state; selection
   * routes to the populated panel in slice 2+. */
  selectedConnectionName: string | null;
}

export function ConnectionsDetailPanel({
  selectedConnectionName,
}: ConnectionsDetailPanelProps) {
  return (
    <Box
      data-testid="connections-detail-panel"
      w="420px"
      h="full"
      borderLeftWidth="1px"
      borderLeftColor="line"
      bg="bg.subtle"
      overflowY="auto"
      p={5}
    >
      {selectedConnectionName === null ? (
        <Stack
          h="full"
          align="center"
          justify="center"
          gap={2}
          data-testid="connections-detail-empty"
        >
          <Text fontSize="13px" color="fg.3">
            Nothing selected
          </Text>
          <Text fontSize="11px" color="fg.3" textAlign="center">
            Pick a connection on the left to see credentials,
            schema preview, and where it's used.
          </Text>
        </Stack>
      ) : (
        <Stack gap={3} data-testid="connections-detail-placeholder">
          <Text fontSize="13px" fontWeight={600}>
            {selectedConnectionName}
          </Text>
          <Text fontSize="11px" color="fg.3">
            Detail sections (credentials / schema / used in runbooks)
            land in the Story 02-04 slices.
          </Text>
        </Stack>
      )}
    </Box>
  );
}
