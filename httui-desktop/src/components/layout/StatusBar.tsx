// Workbench status bar — canvas §4 Story 02.
//
// Mounted at the bottom of `<AppShell>`. Composes inside the
// `<StatusBarShell>` atom (22px, mono 11px, `bg.1`, top border).
//
// Cells (left → right):
//   • Branch + diff counts (`main +N ~M`) — debounced 2s
//     `gitStatus` poll via `useGitStatus`
//   • Active env name + status `<Dot>` (warn for staging, err for
//     prod*, ok otherwise; `idle` when none)
//   • Connection latency (opt-in; default off — surfaces only when
//     a connection is active)
//   • Cursor position (`Ln 1, Col 1` placeholder until CM6 emits a
//     selection event we can subscribe to)
//   • File encoding (`UTF-8` static)
//   • ⚡ chained — placeholder until block-context is reachable
//   • Version pill (`v0.1.0`) — Vite-time inject from package.json

import { Box, Text } from "@chakra-ui/react";

import { Dot, type DotVariant, StatusBarShell } from "@/components/atoms";
import { useGitStatus } from "@/hooks/useGitStatus";
import { useEnvironmentStore } from "@/stores/environment";
import { useWorkspaceStore } from "@/stores/workspace";

// `__APP_VERSION__` injected by `vite.config.ts` `define`. Tests run
// outside Vite — fall back to "dev" if not defined.
const APP_VERSION =
  typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

function envVariant(name: string | undefined | null): DotVariant {
  if (!name) return "idle";
  if (/^prod/i.test(name)) return "err";
  if (/^staging/i.test(name)) return "warn";
  return "ok";
}

interface StatusBarProps {
  /** Optional cursor position override; tests use this. Defaults to
   * a placeholder until CM6 selection event wiring lands. */
  cursorLine?: number;
  cursorCol?: number;
  /** Whether the active block has a `{{ref}}` chained reference.
   * Default `false`; placeholder until block context is reachable. */
  chained?: boolean;
}

export function StatusBar({
  cursorLine = 1,
  cursorCol = 1,
  chained = false,
}: StatusBarProps = {}) {
  const vaultPath = useWorkspaceStore((s) => s.vaultPath);
  const { status: gitState } = useGitStatus(vaultPath);
  const activeEnvironment = useEnvironmentStore((s) => s.activeEnvironment);
  const activeConnection = useWorkspaceStore((s) => s.activeConnection);

  const branchLabel = gitState?.branch ?? "—";
  const ahead = gitState?.ahead ?? 0;
  const behind = gitState?.behind ?? 0;
  const changeCount = gitState?.changed.length ?? 0;

  return (
    <StatusBarShell data-testid="status-bar">
      {/* Branch + diff counts */}
      <Box display="inline-flex" gap={2} alignItems="center">
        <Text data-testid="status-branch">{branchLabel}</Text>
        {(ahead > 0 || behind > 0 || changeCount > 0) && (
          <Text color="fg.3" data-testid="status-changes">
            {ahead > 0 && `↑${ahead} `}
            {behind > 0 && `↓${behind} `}
            {changeCount > 0 && `~${changeCount}`}
          </Text>
        )}
      </Box>

      <Box w="1px" h="12px" bg="line" aria-hidden />

      {/* Env */}
      <Box
        display="inline-flex"
        gap={2}
        alignItems="center"
        data-testid="status-env"
      >
        <Dot variant={envVariant(activeEnvironment?.name)} />
        <Text>{activeEnvironment?.name ?? "no env"}</Text>
      </Box>

      {/* Connection latency (opt-in: surfaces only when active) */}
      {activeConnection && (
        <>
          <Box w="1px" h="12px" bg="line" aria-hidden />
          <Box
            display="inline-flex"
            gap={2}
            alignItems="center"
            data-testid="status-conn"
          >
            <Dot
              variant={
                activeConnection.status === "connected" ? "ok" : "err"
              }
            />
            <Text>{activeConnection.name}</Text>
          </Box>
        </>
      )}

      <Box flex={1} />

      {/* Right cluster — cursor + encoding + chained + version */}
      {chained && (
        <Text color="accent" data-testid="status-chained" title="Chained">
          ⚡ chained
        </Text>
      )}
      <Text data-testid="status-cursor">
        Ln {cursorLine}, Col {cursorCol}
      </Text>
      <Text data-testid="status-encoding">UTF-8</Text>
      <Box
        data-testid="status-version"
        px={2}
        h="16px"
        display="inline-flex"
        alignItems="center"
        borderRadius="3px"
        bg="bg.2"
        color="fg.2"
        fontSize="10px"
      >
        v{APP_VERSION}
      </Box>
    </StatusBarShell>
  );
}
