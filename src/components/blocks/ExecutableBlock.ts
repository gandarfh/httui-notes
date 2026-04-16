import { Node, mergeAttributes } from "@tiptap/core";

export type DisplayMode = "input" | "output" | "split";
export type ExecutionState = "idle" | "running" | "success" | "error" | "cached";

/**
 * Base TipTap node for all executable blocks (http, db, e2e).
 * Concrete blocks extend this via `.extend()` and override name, parseHTML, addNodeView.
 */
export const ExecutableBlock = Node.create({
  name: "executableBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      alias: { default: "" },
      displayMode: { default: "input" as DisplayMode },
      executionState: { default: "idle" as ExecutionState },
      blockType: { default: "" },
      content: { default: "" },
      // Transient: not persisted in HTML, used only at runtime
      result: { default: null, rendered: false },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="executable-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        {
          "data-type": "executable-block",
          "data-block-type": HTMLAttributes.blockType,
          "data-alias": HTMLAttributes.alias,
          "data-display-mode": HTMLAttributes.displayMode,
          "data-content": HTMLAttributes.content,
        },
        {},
      ),
    ];
  },
});
