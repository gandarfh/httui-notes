/**
 * BlockWidgetOverlay — renders block widgets OUTSIDE the CM6 editor DOM
 * via absolute positioning over placeholder elements.
 *
 * Performance design:
 * - ViewPlugin inside CM6 notifies React only on block/viewport changes (not every scroll)
 * - useSyncExternalStore for tear-free CM6→React communication
 * - Viewport-aware: only renders blocks in/near visible area
 * - coordsAtPos for positioning (no querySelector — works with CM6 virtualization)
 * - requestMeasure for coordinated DOM reads
 * - Stable ctx cache prevents cascade re-renders via React.memo
 * - Height cache in PlaceholderWidget for accurate scroll predictions
 */
import { useEffect, useRef, useState, useCallback, useSyncExternalStore, memo } from "react";
import { createPortal } from "react-dom";
import { Box } from "@chakra-ui/react";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import {
  findFencedBlocks,
  extractAlias,
  widgetTransaction,
  setCachedHeight,
  getCachedHeight,
  getPlaceholderElement,
  type FencedBlock,
} from "@/lib/codemirror/cm-block-widgets";
import { BlockAdapter } from "@/components/blocks/BlockAdapter";
import type { BlockWidgetContext } from "@/lib/codemirror/block-widget-context";

// ── ViewPlugin notifier (lives inside CM6, notifies React) ──────────────────

let blockUpdateVersion = 0;
const listeners = new Set<() => void>();

function notifyListeners() {
  blockUpdateVersion++;
  for (const fn of listeners) fn();
}

/** CM6 ViewPlugin that detects block structure and viewport changes */
export const blockNotifierPlugin = ViewPlugin.fromClass(
  class {
    lastFingerprint: string;
    lastVpFrom: number;
    lastVpTo: number;
    pending = false;

    constructor(view: EditorView) {
      this.lastFingerprint = this.fingerprint(view);
      this.lastVpFrom = view.viewport.from;
      this.lastVpTo = view.viewport.to;
    }

    fingerprint(view: EditorView): string {
      const blocks = findFencedBlocks(view.state.doc);
      return blocks.map(b => `${b.from}:${b.to}:${b.info}`).join(",");
    }

    update(update: ViewUpdate) {
      let notify = false;

      if (update.docChanged) {
        const fp = this.fingerprint(update.view);
        if (fp !== this.lastFingerprint) {
          this.lastFingerprint = fp;
          notify = true;
        }
      }

      const vp = update.view.viewport;
      if (vp.from !== this.lastVpFrom || vp.to !== this.lastVpTo) {
        this.lastVpFrom = vp.from;
        this.lastVpTo = vp.to;
        notify = true;
      }

      if (notify) this.scheduleNotify();
    }

    scheduleNotify() {
      if (this.pending) return;
      this.pending = true;
      requestAnimationFrame(() => {
        this.pending = false;
        notifyListeners();
      });
    }
  },
);

// ── useSyncExternalStore hook for CM6→React ─────────────────────────────────

function subscribeToBlockUpdates(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function getBlockUpdateVersion() {
  return blockUpdateVersion;
}

function useBlockUpdates(): number {
  return useSyncExternalStore(subscribeToBlockUpdates, getBlockUpdateVersion);
}

// ── Overlay component ───────────────────────────────────────────────────────

interface OverlayEntry {
  id: string;
  block: FencedBlock;
  top: number;
  width: number;
}

interface BlockWidgetOverlayProps {
  view: EditorView;
  filePath: string;
  /** Incremented on docChanged — triggers block rescan */
  docVersion: number;
}

/** Indexed block — preserves original index for stable ID generation */
interface IndexedBlock {
  index: number;
  block: FencedBlock;
}

/** Compute positions — uses placeholder element (primary) or coordsAtPos (fallback for virtualized) */
function readPositions(view: EditorView, blocks: IndexedBlock[]): OverlayEntry[] {
  const entries: OverlayEntry[] = [];
  const scrollerRect = view.scrollDOM.getBoundingClientRect();
  const width = scrollerRect.width - 64;

  for (const { index, block } of blocks) {
    const id = `block_${index}`;

    // Primary: use placeholder element directly (works for all rendered blocks)
    const el = getPlaceholderElement(id);
    if (el) {
      entries.push({ id, block, top: el.offsetTop, width });
      continue;
    }

    // Fallback: coordsAtPos for virtualized blocks (placeholder not in DOM)
    const coords = view.coordsAtPos(block.from);
    if (coords) {
      const top = coords.top - scrollerRect.top + view.scrollDOM.scrollTop;
      entries.push({ id, block, top, width });
    }
  }
  return entries;
}

export function BlockWidgetOverlay({ view, filePath, docVersion }: BlockWidgetOverlayProps) {
  const [entries, setEntries] = useState<OverlayEntry[]>([]);
  const blocksRef = useRef<FencedBlock[]>([]);
  const ctxCacheRef = useRef(new Map<string, BlockWidgetContext>());
  // Also subscribe to viewport changes via the ViewPlugin
  const vpVersion = useBlockUpdates();

  // React to doc changes (docVersion) and viewport changes (vpVersion)
  useEffect(() => {
    const allBlocks = findFencedBlocks(view.state.doc);
    const { from: vpFrom, to: vpTo } = view.viewport;
    const margin = 2000;
    const visible: IndexedBlock[] = [];
    for (let i = 0; i < allBlocks.length; i++) {
      const b = allBlocks[i];
      if (b.to >= vpFrom - margin && b.from <= vpTo + margin) {
        visible.push({ index: i, block: b });
      }
    }
    blocksRef.current = allBlocks;

    // Defer position reading to next frame (DOM needs to update first)
    const raf = requestAnimationFrame(() => {
      const positions = readPositions(view, visible);
      setEntries(positions);
    });
    return () => cancelAnimationFrame(raf);
  }, [view, docVersion, vpVersion]);

  // Initial render (ViewPlugin hasn't notified yet)
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const allBlocks = findFencedBlocks(view.state.doc);
      blocksRef.current = allBlocks;
      const indexed: IndexedBlock[] = allBlocks.map((block, index) => ({ index, block }));
      setEntries(readPositions(view, indexed));
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Stable ctx cache — only creates new ctx when block identity changes
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
        const blocks = blocksRef.current.length > 0
          ? blocksRef.current
          : findFencedBlocks(view.state.doc);
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
    const currentIds = new Set(entries.map(e => e.id));
    for (const key of ctxCacheRef.current.keys()) {
      if (!currentIds.has(key)) ctxCacheRef.current.delete(key);
    }
  }, [entries]);

  // Sync widget height back to placeholder + CM6 height map + re-read positions
  const heightSyncPending = useRef(false);
  const syncHeight = useCallback(
    (blockId: string, height: number) => {
      if (Math.abs(getCachedHeight(blockId) - height) <= 2) return;
      setCachedHeight(blockId, height);
      const el = getPlaceholderElement(blockId);
      if (el) el.style.height = `${height}px`;
      view.requestMeasure();
      // Batch: schedule one re-read after all ResizeObserver callbacks settle
      if (!heightSyncPending.current) {
        heightSyncPending.current = true;
        requestAnimationFrame(() => {
          heightSyncPending.current = false;
          notifyListeners();
        });
      }
    },
    [view],
  );

  // Overlay container inside CM6 scroller
  const overlayEl = useRef<HTMLDivElement | null>(null);
  if (!overlayEl.current) {
    const div = document.createElement("div");
    div.className = "cm-widget-overlay";
    div.style.position = "absolute";
    div.style.top = "0";
    div.style.left = "0";
    div.style.right = "0";
    div.style.pointerEvents = "none";
    div.style.zIndex = "1";
    overlayEl.current = div;
  }

  useEffect(() => {
    const scroller = view.scrollDOM;
    const el = overlayEl.current;
    if (!el || !scroller) return;
    scroller.style.position = "relative";
    scroller.appendChild(el);
    return () => { el.remove(); };
  }, [view]);

  return createPortal(
    <>
      {entries.map(({ id, block, top, width }) => (
        <MemoPortalWidget
          key={id}
          blockId={id}
          block={block}
          ctx={getOrCreateCtx(block, id)}
          top={top}
          width={width}
          onHeightChange={syncHeight}
        />
      ))}
    </>,
    overlayEl.current,
  );
}

// ── Memoized portal widget ──────────────────────────────────────────────────

interface PortalWidgetProps {
  blockId: string;
  block: FencedBlock;
  ctx: BlockWidgetContext;
  top: number;
  width: number;
  onHeightChange: (blockId: string, height: number) => void;
}

const MemoPortalWidget = memo(
  function PortalWidget({ blockId, ctx, top, onHeightChange }: PortalWidgetProps) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!ref.current) return;
      const observer = new ResizeObserver(([entry]) => {
        onHeightChange(blockId, entry.contentRect.height);
      });
      observer.observe(ref.current);
      return () => observer.disconnect();
    }, [blockId, onHeightChange]);

    return (
      <Box
        ref={ref}
        position="absolute"
        top={`${top}px`}
        left="32px"
        right="32px"
        pointerEvents="auto"
      >
        <BlockAdapter ctx={ctx} />
      </Box>
    );
  },
  (prev, next) => {
    return (
      prev.blockId === next.blockId &&
      prev.top === next.top &&
      prev.width === next.width &&
      prev.ctx === next.ctx
    );
  },
);
