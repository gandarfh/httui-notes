/**
 * WidgetPortals — renders React block components directly into CM6 widget divs
 * via createPortal. No overlay, no absolute positioning, no height sync.
 * CM6 owns the widget divs and measures their height naturally.
 */
import { useRef, useEffect, useCallback, useMemo, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { EditorView } from "@codemirror/view";
import {
  findFencedBlocks,
  extractAlias,
  widgetTransaction,
  subscribeToPortals,
  getPortalVersion,
  getWidgetContainers,
  type FencedBlock,
} from "@/lib/codemirror/cm-block-widgets";
import { BlockAdapter } from "@/components/blocks/BlockAdapter";
import type { BlockWidgetContext } from "@/lib/codemirror/block-widget-context";

function usePortalUpdates(): number {
  return useSyncExternalStore(subscribeToPortals, getPortalVersion);
}

interface WidgetPortalsProps {
  view: EditorView;
  filePath: string;
}

export function WidgetPortals({ view, filePath }: WidgetPortalsProps) {
  const portalVersion = usePortalUpdates();
  const ctxCacheRef = useRef(new Map<string, BlockWidgetContext>());

  const entries = useMemo(
    () => Array.from(getWidgetContainers().entries()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portalVersion],
  );

  const getOrCreateCtx = useCallback(
    (block: FencedBlock, id: string): BlockWidgetContext => {
      const cached = ctxCacheRef.current.get(id);
      if (
        cached &&
        cached.content === block.content &&
        cached.info === block.info &&
        cached.from === block.from &&
        cached.to === block.to
      ) {
        return cached;
      }

      const findCurrentBlock = (): FencedBlock | undefined => {
        const blocks = findFencedBlocks(view.state.doc);
        const alias = extractAlias(block.info);
        if (alias) {
          return blocks.find(
            (b) => extractAlias(b.info) === alias && b.lang === block.lang,
          );
        }
        return blocks
          .filter((b) => b.lang === block.lang)
          .sort(
            (a, b) =>
              Math.abs(a.from - block.from) - Math.abs(b.from - block.from),
          )[0];
      };

      const ctx: BlockWidgetContext = {
        view,
        from: block.from,
        to: block.to,
        content: block.content,
        info: block.info,
        lang: block.lang,
        filePath,
        updateContent: (newContent: string) => {
          const current = findCurrentBlock();
          if (!current) return;
          const doc = view.state.doc;
          const openingLine = doc.lineAt(current.from);
          const closingLine = doc.lineAt(current.to);
          const contentStart = openingLine.to + 1;
          const contentEnd = closingLine.from - 1;
          if (contentStart <= contentEnd) {
            view.dispatch({
              changes: { from: contentStart, to: contentEnd, insert: newContent },
              annotations: widgetTransaction.of(true),
            });
          }
        },
        updateInfo: (newInfo: string) => {
          const current = findCurrentBlock();
          if (!current) return;
          const doc = view.state.doc;
          const openingLine = doc.lineAt(current.from);
          const langMatch = openingLine.text.match(/^```(\S+)/);
          if (langMatch) {
            const infoStart = current.from + 3 + langMatch[1].length;
            const infoEnd = openingLine.to;
            const insert = newInfo ? ` ${newInfo}` : "";
            view.dispatch({
              changes: { from: infoStart, to: infoEnd, insert },
              annotations: widgetTransaction.of(true),
            });
          }
        },
      };

      ctxCacheRef.current.set(id, ctx);
      return ctx;
    },
    [view, filePath],
  );

  // Clean stale ctx entries
  useEffect(() => {
    const currentIds = new Set(entries.map(([id]) => id));
    for (const key of ctxCacheRef.current.keys()) {
      if (!currentIds.has(key)) ctxCacheRef.current.delete(key);
    }
  }, [entries]);

  return (
    <>
      {entries.map(([id, { element, block }]) =>
        createPortal(
          <BlockAdapter key={id} ctx={getOrCreateCtx(block, id)} />,
          element,
        ),
      )}
    </>
  );
}
