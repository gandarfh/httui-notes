import {
  ViewPlugin,
  Decoration,
  type DecorationSet,
  EditorView,
  type ViewUpdate,
  MatchDecorator,
} from "@codemirror/view";

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
});

/**
 * CodeMirror extension that highlights {{...}} reference patterns.
 */
export const referenceHighlight = [referenceHighlightPlugin, referenceHighlightTheme];
