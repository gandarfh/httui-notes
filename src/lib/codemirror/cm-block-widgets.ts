import { RangeSetBuilder, StateField } from "@codemirror/state";
import {
  Decoration,
  WidgetType,
  type DecorationSet,
  EditorView,
} from "@codemirror/view";
import type { Text } from "@codemirror/state";
import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import { StandaloneBlock } from "@/components/blocks/standalone/StandaloneBlock";

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
export function findFencedBlocks(doc: Text): FencedBlock[] {
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

/** Extract alias from info string (e.g., "alias=foo displayMode=split") */
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

class BlockWidget extends WidgetType {
  private root: Root | null = null;

  constructor(
    readonly lang: string,
    readonly info: string,
    readonly content: string,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const container = document.createElement("div");
    container.className = "cm-block-widget";
    container.style.padding = "2px 0";

    this.root = createRoot(container);
    this.root.render(
      createElement(StandaloneBlock, {
        blockType: langToBlockType(this.lang),
        lang: this.lang,
        content: this.content,
        alias: extractAlias(this.info),
      }),
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
    return this.lang === other.lang && this.content === other.content && this.info === other.info;
  }

  get estimatedHeight(): number {
    return 120;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function buildDecorations(doc: Text): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const blocks = findFencedBlocks(doc);

  for (const block of blocks) {
    builder.add(
      block.from,
      block.to,
      Decoration.replace({
        widget: new BlockWidget(block.lang, block.info, block.content),
        block: true,
      }),
    );
  }

  return builder.finish();
}

/**
 * CodeMirror extension that replaces fenced executable blocks with React widget decorations.
 * Uses StateField (not ViewPlugin) because block-level replace decorations require it.
 */
export const blockWidgetPlugin = StateField.define<DecorationSet>({
  create(state) {
    return buildDecorations(state.doc);
  },
  update(decos, tr) {
    if (tr.docChanged) {
      return buildDecorations(tr.state.doc);
    }
    return decos;
  },
  provide: (f) => EditorView.decorations.from(f),
});
