import { mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ExecutableBlock } from "../ExecutableBlock";
import { E2eBlockView } from "./E2eBlockView";

export const E2eBlock = ExecutableBlock.extend({
  name: "e2eBlock",

  addAttributes() {
    return {
      ...this.parent?.(),
      blockType: { default: "e2e" },
      alias: {
        default: "",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-alias") ?? "",
        renderHTML: (attrs: Record<string, string>) => ({ "data-alias": attrs.alias }),
      },
      displayMode: {
        default: "input",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-display-mode") ?? "input",
        renderHTML: (attrs: Record<string, string>) => ({ "data-display-mode": attrs.displayMode }),
      },
      content: {
        default: "",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-content") ?? "",
        renderHTML: (attrs: Record<string, string>) => ({ "data-content": attrs.content }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="e2e-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes({ "data-type": "e2e-block" }, HTMLAttributes),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(E2eBlockView, {
      stopEvent: () => true,
    });
  },
});
