/**
 * Mounts an `HttpFencedPanel` into each http block's widget slots.
 *
 * Mirrors `DbWidgetPortals.tsx`: the CM6 extension (`cm-http-block.tsx`)
 * owns a registry of widget containers; this component subscribes to
 * the registry and renders React into each entry.
 */

import { useMemo, useSyncExternalStore } from "react";
import type { EditorView } from "@codemirror/view";

import {
  getHttpPortalVersion,
  getHttpWidgetContainers,
  subscribeToHttpPortals,
  type HttpPortalEntry,
} from "@/lib/codemirror/cm-http-block";
import { HttpFencedPanel } from "@/components/blocks/http/fenced/HttpFencedPanel";

interface HttpWidgetPortalsProps {
  view: EditorView;
  filePath: string;
}

function useHttpPortalVersion(): number {
  return useSyncExternalStore(subscribeToHttpPortals, getHttpPortalVersion);
}

export function HttpWidgetPortals({ view, filePath }: HttpWidgetPortalsProps) {
  const version = useHttpPortalVersion();

  const entries = useMemo(
    () => Array.from(getHttpWidgetContainers().entries()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );

  return (
    <>
      {entries.map(([blockId, entry]: [string, HttpPortalEntry]) => (
        <HttpFencedPanel
          key={blockId}
          blockId={blockId}
          block={entry.block}
          entry={entry}
          view={view}
          filePath={filePath}
        />
      ))}
    </>
  );
}
