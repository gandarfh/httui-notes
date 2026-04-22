/**
 * BlockWidgetOverlay — renders block widgets OUTSIDE the CM6 editor DOM
 * via absolute positioning over placeholder elements.
 *
 * This isolates widgets from the editor's contentEditable, preventing
 * focus leaks, scroll interference, and selection side effects.
 */
import { useEffect, useRef, useState, useCallback } from "react";
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

interface OverlayBlock {
  block: FencedBlock;
  id: string;
  top: number;
  width: number;
}

interface BlockWidgetOverlayProps {
  view: EditorView;
  filePath: string;
}

export function BlockWidgetOverlay({ view, filePath }: BlockWidgetOverlayProps) {
  const [overlayBlocks, setOverlayBlocks] = useState<OverlayBlock[]>([]);
  const rafRef = useRef<number>(0);

  // Scan document for blocks and compute positions
  const updatePositions = useCallback(() => {
    const blocks = findFencedBlocks(view.state.doc);
    const newOverlayBlocks: OverlayBlock[] = [];

    for (const block of blocks) {
      const alias = extractAlias(block.info);
      const id = alias ?? `${block.lang}_${block.from}`;

      const placeholder = view.dom.querySelector(
        `[data-block-id="${id}"]`,
      ) as HTMLElement | null;

      if (placeholder) {
        // Use offsetTop relative to the scroller (overlay is inside scroller)
        newOverlayBlocks.push({
          block,
          id,
          top: placeholder.offsetTop,
          width: placeholder.offsetWidth,
        });
      }
    }

    setOverlayBlocks(newOverlayBlocks);
  }, [view]);

  // Update positions on DOM changes and resize (no scroll needed — overlay is inside scroller)
  useEffect(() => {
    requestAnimationFrame(() => updatePositions());

    // Detect DOM changes (placeholder insertion/removal)
    const mutationObserver = new MutationObserver(() => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updatePositions);
    });
    mutationObserver.observe(view.dom, { childList: true, subtree: true });

    // Detect resize
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updatePositions);
    });
    resizeObserver.observe(view.dom);

    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [view, updatePositions]);

  // Create BlockWidgetContext for a block
  const createCtx = useCallback(
    (block: FencedBlock): BlockWidgetContext => {
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
      const placeholder = view.dom.querySelector(
        `[data-block-id="${blockId}"]`,
      ) as HTMLElement | null;
      if (placeholder && Math.abs(placeholder.offsetHeight - height) > 2) {
        placeholder.style.height = `${height}px`;
      }
    },
    [view],
  );

  // Get or create overlay container inside the CM6 scroller
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

  // Inject overlay div into the CM6 scroller (position: relative context)
  useEffect(() => {
    const scroller = view.scrollDOM;
    const el = overlayEl.current;
    if (!el || !scroller) return;

    // The scroller needs position: relative for absolute children
    scroller.style.position = "relative";
    scroller.appendChild(el);

    return () => {
      el.remove();
    };
  }, [view]);

  return createPortal(
    <>
      {overlayBlocks.map(({ id, top, width }) => {
        const block = findFencedBlocks(view.state.doc).find(b => {
          const a = extractAlias(b.info);
          return (a ?? `${b.lang}_${b.from}`) === id;
        });
        if (!block) return null;
        return (
          <PortalWidget
            key={id}
            block={block}
            blockId={id}
            ctx={createCtx(block)}
            top={top}
            width={width}
            onHeightChange={(h) => syncHeight(id, h)}
          />
        );
      })}
    </>,
    overlayEl.current,
  );
}

// ── Individual portal widget ─────────────────────────────────────────────────

interface PortalWidgetProps {
  block: FencedBlock;
  blockId: string;
  ctx: BlockWidgetContext;
  top: number;
  width: number;
  onHeightChange: (height: number) => void;
}

function PortalWidget({ ctx, top, onHeightChange }: PortalWidgetProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Observe height changes and sync to placeholder
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => {
      onHeightChange(entry.contentRect.height);
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [onHeightChange]);

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
}
