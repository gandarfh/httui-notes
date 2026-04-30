// Canvas §6 Variables — page composition (Epic 43 Story 01 slice 1).
//
// Three-column layout 200/1fr/380. Owns scope selection + search
// state locally; data wiring (rows, env list, counts, detail) carries
// to slice 2+ as the consumer plugs them via the panels below.

import { Flex } from "@chakra-ui/react";
import { useState } from "react";

import { VariablesDetailPanel } from "./VariablesDetailPanel";
import { VariablesListPanel } from "./VariablesListPanel";
import { VariablesScopesSidebar } from "./VariablesScopesSidebar";
import {
  VARIABLE_SCOPES,
  type VariableScope,
} from "./variable-scopes";

export interface VariablesPageProps {
  /** Initial selected scope. Defaults to "all". */
  initialScope?: VariableScope;
  /** Env names rendered as table column headers (canvas: local/staging/prod). */
  envColumnNames?: ReadonlyArray<string>;
  /** Active env name shown in the right-of-search pill. */
  activeEnvName?: string;
  /** Per-scope counts (canvas spec: "Todas 8 / Workspace 3 / …"). */
  countsByScope?: Partial<Record<VariableScope, number>>;
  selectedKey?: string | null;
  onImportDotenv?: () => void;
  onCreateNew?: () => void;
  /** Slice 2+ — overridable composition slots from the consumer. */
  rowsSlot?: React.ReactNode;
  detailSlot?: React.ReactNode;
}

export function VariablesPage({
  initialScope = "all",
  envColumnNames = [],
  activeEnvName,
  countsByScope,
  selectedKey,
  onImportDotenv,
  onCreateNew,
  rowsSlot,
  detailSlot,
}: VariablesPageProps) {
  const [scope, setScope] = useState<VariableScope>(
    VARIABLE_SCOPES.includes(initialScope) ? initialScope : "all",
  );
  const [search, setSearch] = useState("");

  return (
    <Flex
      data-testid="variables-page"
      data-scope={scope}
      h="full"
      minH={0}
      overflow="hidden"
    >
      <VariablesScopesSidebar
        selectedScope={scope}
        onSelectScope={setScope}
        countsByScope={countsByScope}
      />
      <VariablesListPanel
        envColumnNames={envColumnNames}
        activeEnvName={activeEnvName}
        searchValue={search}
        onSearchChange={setSearch}
        onImportDotenv={onImportDotenv}
        onCreateNew={onCreateNew}
        rowsSlot={rowsSlot}
      />
      <VariablesDetailPanel selectedKey={selectedKey}>
        {detailSlot}
      </VariablesDetailPanel>
    </Flex>
  );
}
