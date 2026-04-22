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

const BLOCK_OPEN_RE = /^```(http|db(?:-[\w:-]+)?|e2e)(.*)$/;
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
  if (lang === "db" || lang.startsWith("db-")) return "db";
  return lang;
}

/** Extract display content (e.g. query) from JSON-serialized block content */
function extractDisplayContent(blockType: string, raw: string): string {
  try {
    const data = JSON.parse(raw);
    if (blockType === "db") return data.query ?? raw;
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

// ── Editor placeholders (lightweight, no React) ─────────────────────────────

/**
 * Lightweight placeholder widget — just a div with a height.
 * Reserves space in the editor where the real widget (rendered via Portal)
 * will be positioned on top.
 */
class PlaceholderWidget extends WidgetType {
  constructor(readonly blockId: string) {
    super();
  }

  toDOM(): HTMLElement {
    const div = document.createElement("div");
    div.className = "cm-block-placeholder";
    div.dataset.blockId = this.blockId;
    div.style.height = "200px"; // Initial estimate, synced by ResizeObserver
    div.style.width = "100%";
    return div;
  }

  eq(other: PlaceholderWidget): boolean {
    return this.blockId === other.blockId;
  }

  get estimatedHeight(): number {
    return 200;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/** Generate a stable ID for a block (alias or fallback to lang+position) */
function getBlockId(block: FencedBlock): string {
  const alias = extractAlias(block.info);
  return alias ?? `${block.lang}_${block.from}`;
}

const hiddenLineDecoration = Decoration.line({ class: "cm-hidden-block-line" });

function buildEditorDecorations(state: import("@codemirror/state").EditorState): DecorationSet {
  const decorations: { from: number; to: number; deco: Decoration }[] = [];
  const blocks = findFencedBlocks(state.doc);

  for (const block of blocks) {
    // Placeholder widget — reserves space, positioned before the hidden lines
    decorations.push({
      from: block.from,
      to: block.from,
      deco: Decoration.widget({
        widget: new PlaceholderWidget(getBlockId(block)),
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

/** Count blocks in a document (lightweight check for structural changes) */
function countBlocks(doc: CMText): number {
  let count = 0;
  for (let i = 1; i <= doc.lines; i++) {
    if (BLOCK_OPEN_RE.test(doc.line(i).text)) count++;
  }
  return count;
}

/**
 * Create editor block extension — placeholders + hidden lines + atomic ranges.
 * Actual widget rendering is done by BlockWidgetOverlay via React Portal.
 */
export function createEditorBlockWidgets() {
  let lastBlockCount = 0;

  const field = StateField.define<DecorationSet>({
    create(state) {
      lastBlockCount = countBlocks(state.doc);
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
          return buildEditorDecorations(tr.state);
        }
        return decos.map(tr.changes);
      }
      return decos;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  // Make hidden block ranges atomic so cursor skips over them
  const atomicBlocks = EditorView.atomicRanges.of((view) => {
    const blocks = findFencedBlocks(view.state.doc);
    const builder = new RangeSetBuilder<Decoration>();
    for (const block of blocks) {
      builder.add(block.from, block.to, Decoration.mark({}));
    }
    return builder.finish();
  });

  return [field, atomicBlocks];
}
