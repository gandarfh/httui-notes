// Canvas §5 — Connections refined page (Epic 42 Story 01).
//
// 3-column grid: 220px kind sidebar / 1fr list / 420px detail.
// This slice composes presentational children with local state
// for the kind filter + search input + selected connection. The
// store integration (`useConnectionsStore`-equivalent + per-env
// counts + real list rows) lands in subsequent slices.

import { useMemo, useState } from "react";
import { Flex } from "@chakra-ui/react";

import {
  ConnectionsKindSidebar,
  type EnvSummary,
} from "./ConnectionsKindSidebar";
import { ConnectionsListPanel } from "./ConnectionsListPanel";
import { ConnectionsDetailPanel } from "./ConnectionsDetailPanel";
import type { ConnectionKind } from "./connection-kinds";

export interface ConnectionsPageProps {
  /** Maps `kind → count` for the sidebar list. Pass `{}` while
   * the store is empty / loading. */
  countsByKind?: Partial<Record<ConnectionKind, number>>;
  /** Per-environment summary for the sidebar lower section. */
  envs?: EnvSummary[];
  /** Status counts for the list header (canvas: "16 · 14 ok · 1
   * slow · 1 down"). */
  status?: {
    total: number;
    ok: number;
    slow: number;
    down: number;
  };
  onTestAll?: () => void;
  onCreateNew?: () => void;
}

const DEFAULT_STATUS = { total: 0, ok: 0, slow: 0, down: 0 };

export function ConnectionsPage({
  countsByKind = {},
  envs = [],
  status = DEFAULT_STATUS,
  onTestAll,
  onCreateNew,
}: ConnectionsPageProps) {
  const [selectedKind, setSelectedKind] = useState<ConnectionKind | null>(
    null,
  );
  const [searchValue, setSearchValue] = useState("");
  const [selectedConnectionName] = useState<string | null>(null);

  const handleTestAll = useMemo(
    () => onTestAll ?? (() => {}),
    [onTestAll],
  );
  const handleCreateNew = useMemo(
    () => onCreateNew ?? (() => {}),
    [onCreateNew],
  );

  return (
    <Flex
      data-testid="connections-page"
      h="full"
      w="full"
      overflow="hidden"
    >
      <ConnectionsKindSidebar
        countsByKind={countsByKind}
        selectedKind={selectedKind}
        onSelectKind={setSelectedKind}
        envs={envs}
      />
      <ConnectionsListPanel
        status={status}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        onTestAll={handleTestAll}
        onCreateNew={handleCreateNew}
      />
      <ConnectionsDetailPanel
        selectedConnectionName={selectedConnectionName}
      />
    </Flex>
  );
}
