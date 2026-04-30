// Canvas §6 Variables — detail panel composer (Epic 43 Story 02 slice 1).
//
// Three sections inside the 380px detail slot: header (key + scope +
// secret chip), VALORES POR AMBIENTE list (one row per env, with
// Show/Hide for secrets), USED IN BLOCKS slot (slice 4 plugs the
// references list here). Read-only this slice; edit + is_secret toggle
// land in the next slice. Pure presentational; consumer plugs
// `fetchSecret`.

import { Box, Flex, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";

import type { VariableRow } from "./variable-derive";
import { VariableDetailHeader } from "./VariableDetailHeader";
import { VariableValueRow } from "./VariableValueRow";

export interface VariableDetailContentProps {
  row: VariableRow;
  /** All envs in the vault, in display order (one row per env). */
  envNames: ReadonlyArray<string>;
  /** Async cleartext fetch (keychain) for secret values. */
  fetchSecret?: (env: string) => Promise<string | undefined>;
  /** Slice 4 plugs the used-in-blocks reference list here. */
  usedInBlocksSlot?: ReactNode;
}

export function VariableDetailContent({
  row,
  envNames,
  fetchSecret,
  usedInBlocksSlot,
}: VariableDetailContentProps) {
  return (
    <Flex
      data-testid="variable-detail-content"
      data-key={row.key}
      direction="column"
      h="full"
    >
      <VariableDetailHeader row={row} />

      <Box flex={1} overflowY="auto">
        <SectionLabel>VALORES POR AMBIENTE</SectionLabel>
        {envNames.length === 0 ? (
          <EmptyEnvsHint />
        ) : (
          envNames.map((env) => (
            <VariableValueRow
              key={env}
              env={env}
              value={row.values[env]}
              isSecret={row.isSecret}
              fetchSecret={fetchSecret}
            />
          ))
        )}

        <SectionLabel mt={3}>USED IN BLOCKS</SectionLabel>
        {usedInBlocksSlot ?? <UsesPlaceholder usesCount={row.usesCount} />}
      </Box>
    </Flex>
  );
}

function SectionLabel({
  children,
  ...rest
}: {
  children: ReactNode;
  [k: string]: unknown;
}) {
  return (
    <Text
      as="div"
      fontFamily="mono"
      fontSize="10px"
      fontWeight="bold"
      letterSpacing="0.06em"
      textTransform="uppercase"
      color="fg.3"
      px={4}
      py={2}
      {...rest}
    >
      {children}
    </Text>
  );
}

function EmptyEnvsHint() {
  return (
    <Text
      data-testid="variable-detail-empty-envs"
      fontSize="11px"
      color="fg.3"
      px={4}
      py={2}
    >
      Nenhum ambiente definido em <code>envs/*.toml</code>.
    </Text>
  );
}

function UsesPlaceholder({ usesCount }: { usesCount: number }) {
  return (
    <Text
      data-testid="variable-detail-uses-placeholder"
      fontSize="11px"
      color="fg.3"
      px={4}
      py={2}
    >
      {usesCount > 0
        ? `${usesCount} referência${usesCount === 1 ? "" : "s"} no vault — lista carrega na slice 4.`
        : "Nenhuma referência encontrada no vault."}
    </Text>
  );
}
