/**
 * BlockWidgetOverlay — renders block widgets OUTSIDE the CM6 editor DOM
 * via absolute positioning over placeholder elements.
 *
 * Performance design:
 * - Reacts to `docVersion` prop from MarkdownEditor (driven by CM6 updateListener)
 * - No MutationObserver (CM6 recycles DOM nodes during scroll, causing storms)
 * - No requestAnimationFrame polling
 * - Memoized PortalWidget prevents cascade re-renders
 * - ResizeObserver only on editor root for width changes
 */
import { useEffect, useRef, useState, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { Box } from "@chakra-ui/react";
import type { EditorView } from "@codemirror/view";
import {
  findFencedBlocks,
  extractAlias,
  widgetTransaction,
  type FencedBlock,
} from "@/lib/codemirror/cm-block-widgets";
import { BlockAdapter } from "@/components/blocks/BlockAdapter";
import type { BlockWidgetContext } from "@/lib/codemirror/block-widget-context";

interface OverlayEntry {
  id: string;
  block: FencedBlock;
  top: number;
  width: number;
}

interface BlockWidgetOverlayProps {
  view: EditorView;
  filePath: string;
  /** Incremented by MarkdownEditor on docChanged/geometryChanged */
  docVersion: number;
}

/** Read placeholder positions from DOM */
function readPositions(view: EditorView, blocks: FencedBlock[]): OverlayEntry[] {
  const entries: OverlayEntry[] = [];
  for (const block of blocks) {
    const id = extractAlias(block.info) ?? `${block.lang}_${block.from}`;
    const el = view.dom.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null;
    if (el) {
      entries.push({ id, block, top: el.offsetTop, width: el.offsetWidth });
    }
  }
  return entries;
}

export function BlockWidgetOverlay({ view, filePath, docVersion }: BlockWidgetOverlayProps) {
  const [entries, setEntries] = useState<OverlayEntry[]>([]);
  const blocksRef = useRef<FencedBlock[]>([]);

  // React to docVersion changes — scan blocks and read positions
  useEffect(() => {
    // Use rAF to batch with browser layout (single frame)
    const raf = requestAnimationFrame(() => {
      blocksRef.current = findFencedBlocks(view.state.doc);
      setEntries(readPositions(view, blocksRef.current));
    });
    return () => cancelAnimationFrame(raf);
  }, [view, docVersion]);

  // Create BlockWidgetContext — stable per block identity
  const createCtx = useCallback(
    (block: FencedBlock): BlockWidgetContext => {
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

      return {
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
    },
    [view, filePath],
  );

  // Sync widget height back to placeholder
  const syncHeight = useCallback(
    (blockId: string, height: number) => {
      const el = view.dom.querySelector(
        `[data-block-id="${blockId}"]`,
      ) as HTMLElement | null;
      if (el && Math.abs(el.offsetHeight - height) > 2) {
        el.style.height = `${height}px`;
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
          ctx={createCtx(block)}
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
    // Only re-render if position changed or block content changed
    return (
      prev.blockId === next.blockId &&
      prev.top === next.top &&
      prev.width === next.width &&
      prev.block.content === next.block.content &&
      prev.block.info === next.block.info
    );
  },
);
