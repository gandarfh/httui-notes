// Canvas §5 — right column of the Connections refined page (420px).
//
// Slice 1: empty/placeholder states.
// Slice 2 (Story 01 wiring): selection cascade renders connection name.
// Slice 3 (Story 02): credentials section when a real `Connection` is
// passed in; placeholder when only the name is known (e.g. test
// fixtures or pre-load stubs).

import { Box, Stack, Text } from "@chakra-ui/react";

import { ConnectionDetailCredentials } from "./ConnectionDetailCredentials";
import type {
  Connection,
  UpdateConnectionInput,
} from "@/lib/tauri/connections";

export interface ConnectionsDetailPanelProps {
  /** Currently-selected connection name, or `null` for no
   * selection. */
  selectedConnectionName: string | null;
  /** Optional full Connection record — when present, the
   * Credentials section renders. When omitted (legacy
   * placeholder path), the panel falls back to the name-only
   * placeholder. */
  selectedConnection?: Connection | null;
  /** Save handler for the credentials Edit/Save flow (Story 02). */
  onSaveCredentials?: (input: UpdateConnectionInput) => Promise<void> | void;
  /** Rotate-password handler. The consumer should write to the
   * keychain and update the `{{keychain:…}}` ref in
   * `connections.toml` (Story 02). */
  onRotatePassword?: (newPassword: string) => Promise<void> | void;
}

export function ConnectionsDetailPanel({
  selectedConnectionName,
  selectedConnection = null,
  onSaveCredentials,
  onRotatePassword,
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
      ) : selectedConnection ? (
        <Stack gap={4} data-testid="connections-detail-loaded">
          <Text fontSize="14px" fontWeight={600} truncate>
            {selectedConnection.name}
          </Text>
          <ConnectionDetailCredentials
            connection={selectedConnection}
            onSave={onSaveCredentials ?? (() => {})}
            onRotatePassword={onRotatePassword ?? (() => {})}
          />
          <Text fontSize="11px" color="fg.3">
            Schema preview (Story 03) + used-in-runbooks (Story 04)
            + footer actions (Story 05) ship in follow-up slices.
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
