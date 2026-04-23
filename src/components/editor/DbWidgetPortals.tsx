/**
 * Mounts a `DbFencedPanel` into each db block's widget slots.
 *
 * Mirrors the pattern used by WidgetPortals.tsx for http/e2e blocks:
 * the CM6 extension (`cm-db-block.tsx`) owns a registry of widget
 * containers; this component subscribes to the registry and renders
 * React into each entry.
 */

import { useMemo, useSyncExternalStore } from "react";
import { EditorView } from "@codemirror/view";

import {
  getDbPortalVersion,
  getDbWidgetContainers,
  subscribeToDbPortals,
  type DbPortalEntry,
} from "@/lib/codemirror/cm-db-block";
import { DbFencedPanel } from "@/components/blocks/db/fenced/DbFencedPanel";

interface DbWidgetPortalsProps {
  view: EditorView;
  filePath: string;
}

function useDbPortalVersion(): number {
  return useSyncExternalStore(subscribeToDbPortals, getDbPortalVersion);
}

export function DbWidgetPortals({ view, filePath }: DbWidgetPortalsProps) {
  const version = useDbPortalVersion();

  const entries = useMemo(
    () => Array.from(getDbWidgetContainers().entries()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );

  return (
    <>
      {entries.map(([blockId, entry]: [string, DbPortalEntry]) => (
        <DbFencedPanel
          key={blockId}
          blockId={blockId}
          entry={entry}
          view={view}
          filePath={filePath}
        />
      ))}
    </>
  );
}
