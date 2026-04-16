import {
  ViewPlugin,
  Decoration,
  type DecorationSet,
  EditorView,
  type ViewUpdate,
  MatchDecorator,
  hoverTooltip,
  type Tooltip,
} from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import {
  parseReferences,
  resolveReference,
  type BlockContext,
} from "./references";

const REF_REGEX = /\{\{[^}]+\}\}/g;

const refMark = Decoration.mark({ class: "cm-reference-highlight" });

const decorator = new MatchDecorator({
  regexp: REF_REGEX,
  decoration: () => refMark,
});

const referenceHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = decorator.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.decorations = decorator.updateDeco(update, this.decorations);
    }
  },
  { decorations: (v) => v.decorations },
);

const referenceHighlightTheme = EditorView.baseTheme({
  ".cm-reference-highlight": {
    backgroundColor: "rgba(139, 92, 246, 0.15)",
    borderRadius: "3px",
    padding: "0 1px",
    color: "rgb(139, 92, 246)",
    fontWeight: "500",
  },
  ".cm-ref-tooltip": {
    fontFamily: "var(--chakra-fonts-mono)",
    fontSize: "11px",
    padding: "4px 8px",
    borderRadius: "4px",
    maxWidth: "400px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    maxHeight: "200px",
    overflowY: "auto",
  },
  ".cm-ref-tooltip-value": {
    color: "rgb(139, 92, 246)",
  },
  ".cm-ref-tooltip-error": {
    color: "rgb(239, 68, 68)",
  },
});

/**
 * CodeMirror extension that highlights {{...}} reference patterns.
 */
export const referenceHighlight = [referenceHighlightPlugin, referenceHighlightTheme];

function truncateValue(val: string, maxLen = 200): string {
  return val.length > maxLen ? val.slice(0, maxLen) + "..." : val;
}

/**
 * Create a hover tooltip extension that resolves {{...}} references
 * and shows the value or error on hover.
 *
 * @param getBlocks - getter returning current block contexts
 * @param getCurrentPos - getter returning current block position in doc
 * @param getEnvVars - getter returning active environment variables
 */
export function createReferenceTooltip(
  getBlocks: () => BlockContext[],
  getCurrentPos: () => number,
  getEnvVars?: () => Record<string, string>,
): Extension {
  return hoverTooltip((view, pos): Tooltip | null => {
    const { state } = view;
    const line = state.doc.lineAt(pos);
    const lineText = line.text;

    // Find {{...}} pattern at hover position
    const regex = /\{\{([^}]+)\}\}/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(lineText)) !== null) {
      const from = line.from + match.index;
      const to = from + match[0].length;

      if (pos >= from && pos <= to) {
        const refs = parseReferences(match[0]);
        if (refs.length === 0) return null;
        const ref = refs[0];

        const blocks = getBlocks();
        const currentPos = getCurrentPos();
        const envVars = getEnvVars?.();

        let resolvedText: string;
        let isError = false;

        // Same priority as resolveAllReferences: block ref > env var
        const matchingBlock = blocks.find((b) => b.alias === ref.alias && b.pos < currentPos);
        if (matchingBlock) {
          try {
            resolvedText = resolveReference(ref, blocks, currentPos);
          } catch (err) {
            resolvedText = err instanceof Error ? err.message : String(err);
            isError = true;
          }
        } else if (ref.path.length === 0 && envVars && ref.alias in envVars) {
          resolvedText = envVars[ref.alias];
        } else {
          try {
            resolvedText = resolveReference(ref, blocks, currentPos);
          } catch (err) {
            resolvedText = err instanceof Error ? err.message : String(err);
            isError = true;
          }
        }

        return {
          pos: from,
          end: to,
          above: true,
          create() {
            const dom = document.createElement("div");
            dom.className = `cm-ref-tooltip ${isError ? "cm-ref-tooltip-error" : "cm-ref-tooltip-value"}`;
            dom.textContent = isError ? `⚠ ${resolvedText}` : truncateValue(resolvedText);
            return { dom };
          },
        };
      }
    }
    return null;
  });
}
