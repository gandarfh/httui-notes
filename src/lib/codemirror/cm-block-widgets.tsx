import { Annotation, RangeSetBuilder, StateField, Text as CMText } from "@codemirror/state";
import {
  Decoration,
  WidgetType,
  type DecorationSet,
  EditorView,
} from "@codemirror/view";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "@/components/ui/provider";
import { WidgetProviders } from "./widget-providers";
import { StandaloneBlock } from "@/components/blocks/standalone/StandaloneBlock";
import { BlockAdapter } from "@/components/blocks/BlockAdapter";
import type { BlockWidgetContext } from "./block-widget-context";

/**
 * Annotation to mark transactions originated from block widgets.
 * When present, the decoration StateField maps positions instead of rebuilding,
 * preventing widget destruction/recreation (which causes flicker).
 */
const widgetTransaction = Annotation.define<boolean>();

const BLOCK_OPEN_RE = /^```(http|db(?:-[\w:-]+)?|e2e)(.*)$/;
const BLOCK_CLOSE_RE = /^```\s*$/;

interface FencedBlock {
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

/** Parse fenced blocks from raw markdown string */
function findFencedBlocksFromString(markdown: string): FencedBlock[] {
  const doc = CMText.of(markdown.split("\n"));
  return findFencedBlocks(doc);
}

/** Extract alias from info string */
function extractAlias(info: string): string | undefined {
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

function buildDecorations(doc: CMText, counterpartBlocks: FencedBlock[], side: "a" | "b"): DecorationSet {
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
 * Create a CodeMirror extension that replaces fenced executable blocks with React widget decorations.
 * Accepts the counterpart markdown (other side of the diff) to enable inline diff within blocks.
 * Used by DiffViewer (read-only, no cursor awareness).
 */
export function createBlockWidgetPlugin(counterpartMarkdown: string | undefined, side: "a" | "b") {
  const counterpartBlocks = counterpartMarkdown
    ? findFencedBlocksFromString(counterpartMarkdown)
    : [];

  return StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state.doc, counterpartBlocks, side);
    },
    update(decos, tr) {
      if (tr.docChanged) {
        return buildDecorations(tr.state.doc, counterpartBlocks, side);
      }
      return decos;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}

// ── Cursor-aware block widgets for the main editor ──────────────────────────

/** Store for the filePath — set by MarkdownEditor */
let editorBlockWidgetFilePath = "";

/** Set the filePath for editor block widgets (called from MarkdownEditor) */
export function setEditorBlockWidgetFilePath(filePath: string) {
  editorBlockWidgetFilePath = filePath;
}

class EditorBlockWidget extends WidgetType {
  private root: Root | null = null;

  constructor(
    readonly lang: string,
    readonly info: string,
    readonly content: string,
    readonly from: number,
    readonly to: number,
  ) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement("div");
    container.className = "cm-block-widget cm-editor-block-widget";
    container.contentEditable = "false";
    container.style.padding = "2px 0";
    container.style.overflow = "hidden";
    container.style.boxSizing = "border-box";

    // Find the current block in the document by alias (robust against position drift)
    const widgetAlias = extractAlias(this.info);
    const widgetLang = this.lang;

    const findCurrentBlock = (): FencedBlock | undefined => {
      const blocks = findFencedBlocks(view.state.doc);
      // Find by alias first (unique), fall back to closest position match
      if (widgetAlias) {
        return blocks.find(b => extractAlias(b.info) === widgetAlias && b.lang === widgetLang);
      }
      // No alias: find the block of same type closest to original position
      return blocks
        .filter(b => b.lang === widgetLang)
        .sort((a, b) => Math.abs(a.from - this.from) - Math.abs(b.from - this.from))[0];
    };

    const ctx: BlockWidgetContext = {
      view,
      from: this.from,
      to: this.to,
      content: this.content,
      info: this.info,
      lang: this.lang,
      filePath: editorBlockWidgetFilePath,
      updateContent: (newContent: string) => {
        const block = findCurrentBlock();
        if (!block) return;
        const doc = view.state.doc;
        const openingLine = doc.lineAt(block.from);
        const closingLine = doc.lineAt(block.to);
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
        const block = findCurrentBlock();
        if (!block) return;
        const doc = view.state.doc;
        const openingLine = doc.lineAt(block.from);
        const langMatch = openingLine.text.match(/^```(\S+)/);
        if (langMatch) {
          const infoStart = block.from + 3 + langMatch[1].length;
          const infoEnd = openingLine.to;
          const insert = newInfo ? ` ${newInfo}` : "";
          view.dispatch({
            changes: { from: infoStart, to: infoEnd, insert },
            annotations: widgetTransaction.of(true),
          });
        }
      },
    };

    // Defer React render to next microtask to avoid nested React updates
    // (toDOM can be called during CM6 dispatch, which may be inside a React render)
    const root = createRoot(container);
    this.root = root;
    queueMicrotask(() => {
      root.render(
        <WidgetProviders>
          <BlockAdapter ctx={ctx} />
        </WidgetProviders>,
      );
    });

    return container;
  }

  destroy(): void {
    if (this.root) {
      const root = this.root;
      this.root = null;
      queueMicrotask(() => root.unmount());
    }
  }

  eq(other: EditorBlockWidget): boolean {
    return (
      this.lang === other.lang &&
      this.content === other.content &&
      this.info === other.info
    );
  }

  get estimatedHeight(): number {
    return 200;
  }

  ignoreEvent(event: Event): boolean {
    // Allow mouse events through so CM6 can track selection across widgets
    const type = event.type;
    if (type === "mousedown" || type === "mouseup" || type === "mousemove" || type === "pointerdown") {
      return false;
    }
    return true;
  }
}

/**
 * Build decorations for executable blocks.
 * Blocks are ALWAYS shown as widgets (they're interactive).
 * Cursor-aware toggling (raw mode) will be via settings toggle (Phase 4).
 */
const hiddenLineDecoration = Decoration.line({ class: "cm-hidden-block-line" });

function buildCursorAwareDecorations(state: import("@codemirror/state").EditorState): DecorationSet {
  const decorations: { from: number; to: number; deco: Decoration }[] = [];
  const blocks = findFencedBlocks(state.doc);

  for (const block of blocks) {
    // Insert widget BEFORE the block as a standalone block-level element
    decorations.push({
      from: block.from,
      to: block.from,
      deco: Decoration.widget({
        widget: new EditorBlockWidget(
          block.lang, block.info, block.content,
          block.from, block.to,
        ),
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

  // Sort by position
  decorations.sort((a, b) => a.from - b.from || a.to - b.to);

  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to, deco } of decorations) {
    builder.add(from, to, deco);
  }
  return builder.finish();
}

/**
 * Create block widget extension for the main editor.
 * Blocks always render as widgets. Raw mode toggle is via settings (Phase 4).
 */
/** Count blocks in a document (lightweight check for structural changes) */
function countBlocks(doc: CMText): number {
  let count = 0;
  for (let i = 1; i <= doc.lines; i++) {
    if (BLOCK_OPEN_RE.test(doc.line(i).text)) count++;
  }
  return count;
}

export function createEditorBlockWidgets() {
  let lastBlockCount = 0;

  const field = StateField.define<DecorationSet>({
    create(state) {
      lastBlockCount = countBlocks(state.doc);
      return buildCursorAwareDecorations(state);
    },
    update(decos, tr) {
      if (tr.annotation(widgetTransaction)) {
        return decos.map(tr.changes);
      }
      if (tr.docChanged) {
        const newCount = countBlocks(tr.state.doc);
        if (newCount !== lastBlockCount) {
          lastBlockCount = newCount;
          return buildCursorAwareDecorations(tr.state);
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
