import { Annotation, RangeSetBuilder, StateField, Text as CMText } from "@codemirror/state";
import {
  Decoration,
  WidgetType,
  type DecorationSet,
  EditorView,
} from "@codemirror/view";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "@/components/ui/provider";
import { StandaloneBlock } from "@/components/blocks/standalone/StandaloneBlock";

/**
 * Annotation to mark transactions originated from block widgets.
 * When present, the decoration StateField maps positions instead of rebuilding,
 * preventing widget destruction/recreation (which causes flicker).
 */
export const widgetTransaction = Annotation.define<boolean>();

const BLOCK_OPEN_RE = /^```(http|e2e)(.*)$/;
const BLOCK_CLOSE_RE = /^```\s*$/;

export interface FencedBlock {
  from: number;
  to: number;
  lang: string;
  info: string;
  content: string;
}

/** Scan a CodeMirror document for fenced executable blocks. */
export function findFencedBlocks(doc: CMText): FencedBlock[] {
  const blocks: FencedBlock[] = [];
  let inBlock = false;
  let blockStart = 0;
  let lang = "";
  let info = "";
  let contentLines: string[] = [];

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;

    if (!inBlock) {
      const match = text.match(BLOCK_OPEN_RE);
      if (match) {
        inBlock = true;
        blockStart = line.from;
        lang = match[1];
        info = match[2].trim();
        contentLines = [];
      }
    } else {
      if (BLOCK_CLOSE_RE.test(text)) {
        blocks.push({
          from: blockStart,
          to: line.to,
          lang,
          info,
          content: contentLines.join("\n"),
        });
        inBlock = false;
      } else {
        contentLines.push(text);
      }
    }
  }

  return blocks;
}

/** Extract alias from info string */
export function extractAlias(info: string): string | undefined {
  const match = info.match(/alias=(\S+)/);
  return match?.[1];
}

/** Map language string to block type */
function langToBlockType(lang: string): string {
  if (lang === "http") return "http";
  if (lang === "e2e") return "e2e";
  return lang;
}

/** Extract display content (e.g. body/url) from JSON-serialized block content */
function extractDisplayContent(blockType: string, raw: string): string {
  try {
    const data = JSON.parse(raw);
    if (blockType === "http") return data.body ?? data.url ?? raw;
    return JSON.stringify(data, null, 2);
  } catch {
    return raw;
  }
}

/** Parse fenced blocks from raw markdown string */
function findFencedBlocksFromString(markdown: string): FencedBlock[] {
  const doc = CMText.of(markdown.split("\n"));
  return findFencedBlocks(doc);
}

// ── DiffViewer widgets (read-only, uses Decoration.replace + createRoot) ─────

class BlockWidget extends WidgetType {
  private root: Root | null = null;

  constructor(
    readonly lang: string,
    readonly info: string,
    readonly content: string,
    readonly counterpartContent: string | null,
    readonly side: "a" | "b",
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const container = document.createElement("div");
    container.className = "cm-block-widget";
    container.contentEditable = "false";
    container.style.padding = "2px 0";
    container.style.overflow = "hidden";
    container.style.maxWidth = "100%";

    this.root = createRoot(container);
    this.root.render(
      <Provider>
        <StandaloneBlock
          blockType={langToBlockType(this.lang)}
          content={this.content}
          counterpartContent={this.counterpartContent ?? undefined}
          side={this.side}
          alias={extractAlias(this.info)}
        />
      </Provider>,
    );

    return container;
  }

  destroy(): void {
    if (this.root) {
      const root = this.root;
      this.root = null;
      queueMicrotask(() => root.unmount());
    }
  }

  eq(other: BlockWidget): boolean {
    return (
      this.lang === other.lang &&
      this.content === other.content &&
      this.info === other.info &&
      this.counterpartContent === other.counterpartContent
    );
  }

  get estimatedHeight(): number {
    return 150;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function buildDiffDecorations(doc: CMText, counterpartBlocks: FencedBlock[], side: "a" | "b"): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const blocks = findFencedBlocks(doc);

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const counterpart = counterpartBlocks[i];
    const blockType = langToBlockType(block.lang);

    const thisDisplay = extractDisplayContent(blockType, block.content);
    const counterpartDisplay = counterpart
      ? extractDisplayContent(langToBlockType(counterpart.lang), counterpart.content)
      : null;

    builder.add(
      block.from,
      block.to,
      Decoration.replace({
        widget: new BlockWidget(
          block.lang, block.info, block.content,
          counterpartDisplay !== thisDisplay ? counterpartDisplay : null,
          side,
        ),
        block: true,
      }),
    );
  }

  return builder.finish();
}

/**
 * Create a CodeMirror extension for the DiffViewer (read-only).
 * Uses Decoration.replace + createRoot (fine for read-only context).
 */
export function createBlockWidgetPlugin(counterpartMarkdown: string | undefined, side: "a" | "b") {
  const counterpartBlocks = counterpartMarkdown
    ? findFencedBlocksFromString(counterpartMarkdown)
    : [];

  return StateField.define<DecorationSet>({
    create(state) {
      return buildDiffDecorations(state.doc, counterpartBlocks, side);
    },
    update(decos, tr) {
      if (tr.docChanged) {
        return buildDiffDecorations(tr.state.doc, counterpartBlocks, side);
      }
      return decos;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}

// ── Portal widgets (React renders directly into these divs) ──────────────────

/**
 * Widget registry — maps blockId → { element, block }.
 * React renders into these divs via createPortal (in WidgetPortals component).
 * CM6 owns the div and measures its height naturally — no height cache needed.
 */
const widgetContainers = new Map<string, { element: HTMLElement; block: FencedBlock }>();
let portalVersion = 0;
const portalListeners = new Set<() => void>();

function notifyPortals() {
  portalVersion++;
  for (const fn of portalListeners) fn();
}

export function subscribeToPortals(cb: () => void) {
  portalListeners.add(cb);
  return () => { portalListeners.delete(cb); };
}
export function getPortalVersion() { return portalVersion; }
export function getWidgetContainers() { return widgetContainers; }

/**
 * Portal widget — a div in CM6's document flow.
 * React renders block components (HttpBlockView, E2eBlockView)
 * directly into this div via createPortal. CM6 measures height naturally.
 * No overlay, no absolute positioning, no height cache.
 */
// Height cache keyed by blockId — stores last measured DOM height so CM6's
// estimatedHeight returns a stable value even across widget rebuilds.
// Without this, CM6's scroll anchoring calculates wrong positions when
// widget content changes async (e.g., query results arrive after execution).
const widgetHeights = new Map<string, number>();

class PortalWidget extends WidgetType {
  constructor(readonly blockId: string, readonly block: FencedBlock) {
    super();
  }

  toDOM(): HTMLElement {
    // Outer div — CM6 sees this. Has min-height to prevent shrinkage during
    // React transient re-renders (which would break CM6 scroll anchoring).
    const div = document.createElement("div");
    div.className = "cm-block-portal";
    const saved = widgetHeights.get(this.blockId);
    if (saved) div.style.minHeight = `${saved}px`;

    // Inner div — React renders here. Its natural height is observed to
    // drive the outer div's min-height. This separation lets us shrink
    // legitimately (toggle edit/split) without the min-height feedback loop.
    const inner = document.createElement("div");
    inner.className = "cm-block-portal-inner";
    div.appendChild(inner);

    widgetContainers.set(this.blockId, { element: inner, block: this.block });

    let shrinkRaf1 = 0;
    let shrinkRaf2 = 0;
    const ro = new ResizeObserver(() => {
      const h = inner.offsetHeight;
      if (h <= 0) return;
      const prev = widgetHeights.get(this.blockId) ?? 0;
      if (h > prev) {
        // Grow immediately
        widgetHeights.set(this.blockId, h);
        div.style.minHeight = `${h}px`;
        cancelAnimationFrame(shrinkRaf1);
        cancelAnimationFrame(shrinkRaf2);
      } else if (h < prev) {
        // Shrink after layout stabilizes (~2 rAFs absorb React transients)
        cancelAnimationFrame(shrinkRaf1);
        cancelAnimationFrame(shrinkRaf2);
        shrinkRaf1 = requestAnimationFrame(() => {
          shrinkRaf2 = requestAnimationFrame(() => {
            const current = inner.offsetHeight;
            if (current > 0 && current < (widgetHeights.get(this.blockId) ?? 0)) {
              widgetHeights.set(this.blockId, current);
              div.style.minHeight = `${current}px`;
            }
          });
        });
      }
    });
    ro.observe(inner);
    (div as HTMLElement & { __ro?: ResizeObserver }).__ro = ro;

    notifyPortals();
    return div;
  }

  updateDOM(dom: HTMLElement): boolean {
    widgetContainers.set(this.blockId, { element: dom, block: this.block });
    notifyPortals();
    return true;
  }

  destroy(dom: HTMLElement): void {
    if (dom.offsetHeight > 0) {
      widgetHeights.set(this.blockId, dom.offsetHeight);
    }
    const ro = (dom as HTMLElement & { __ro?: ResizeObserver }).__ro;
    ro?.disconnect();
    widgetContainers.delete(this.blockId);
    notifyPortals();
  }

  eq(other: PortalWidget): boolean {
    return this.blockId === other.blockId;
  }

  get estimatedHeight(): number {
    // Read actual DOM height if widget is currently rendered
    const entry = widgetContainers.get(this.blockId);
    if (entry?.element.offsetHeight) {
      return entry.element.offsetHeight;
    }
    return widgetHeights.get(this.blockId) ?? 100;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/** Generate a stable ID for a block — index-based so alias/content edits don't destroy widgets */
function getBlockId(_block: FencedBlock, index: number): string {
  return `block_${index}`;
}

const hiddenLineDecoration = Decoration.line({ class: "cm-hidden-block-line" });

function buildEditorDecorations(state: import("@codemirror/state").EditorState): DecorationSet {
  const decorations: { from: number; to: number; deco: Decoration }[] = [];
  const blocks = findFencedBlocks(state.doc);

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    // Portal widget — React renders block UI directly into this div
    decorations.push({
      from: block.from,
      to: block.from,
      deco: Decoration.widget({
        widget: new PortalWidget(getBlockId(block, i), block),
        block: true,
        side: -1,
      }),
    });

    // Hide each line of the block's raw markdown
    const startLine = state.doc.lineAt(block.from).number;
    const endLine = state.doc.lineAt(block.to).number;
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const line = state.doc.line(lineNum);
      decorations.push({
        from: line.from,
        to: line.from,
        deco: hiddenLineDecoration,
      });
    }
  }

  decorations.sort((a, b) => a.from - b.from || a.to - b.to);

  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to, deco } of decorations) {
    builder.add(from, to, deco);
  }
  return builder.finish();
}

/** Count blocks in a document (lightweight structural change check) */
function countBlocks(doc: CMText): number {
  let count = 0;
  for (let i = 1; i <= doc.lines; i++) {
    if (BLOCK_OPEN_RE.test(doc.line(i).text)) count++;
  }
  return count;
}

/**
 * Create editor block extension — placeholders + hidden lines + atomic ranges.
 * Actual widget rendering is done by WidgetPortals via React createPortal into PortalWidget divs.
 */
export function createEditorBlockWidgets() {
  let lastBlockCount = 0;
  // Cache block ranges for atomicRanges — avoids redundant findFencedBlocks calls
  let cachedBlocks: FencedBlock[] = [];

  const field = StateField.define<DecorationSet>({
    create(state) {
      cachedBlocks = findFencedBlocks(state.doc);
      lastBlockCount = cachedBlocks.length;
      return buildEditorDecorations(state);
    },
    update(decos, tr) {
      if (tr.annotation(widgetTransaction)) {
        return decos.map(tr.changes);
      }
      if (tr.docChanged) {
        const newCount = countBlocks(tr.state.doc);
        if (newCount !== lastBlockCount) {
          lastBlockCount = newCount;
          cachedBlocks = findFencedBlocks(tr.state.doc);
          return buildEditorDecorations(tr.state);
        }
        return decos.map(tr.changes);
      }
      return decos;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  // Make hidden block ranges atomic so cursor skips over them
  // Reuses cachedBlocks from the StateField instead of re-scanning
  const atomicBlocks = EditorView.atomicRanges.of(() => {
    const builder = new RangeSetBuilder<Decoration>();
    for (const block of cachedBlocks) {
      builder.add(block.from, block.to, Decoration.mark({}));
    }
    return builder.finish();
  });

  return [field, atomicBlocks];
}
