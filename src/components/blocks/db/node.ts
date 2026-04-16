import { mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ExecutableBlock } from "../ExecutableBlock";
import { DbBlockView } from "./DbBlockView";

export const DbBlock = ExecutableBlock.extend({
  name: "dbBlock",

  addAttributes() {
    return {
      ...this.parent?.(),
      blockType: { default: "db" },
      alias: {
        default: "",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-alias") ?? "",
        renderHTML: (attrs: Record<string, string>) => ({
          "data-alias": attrs.alias,
        }),
      },
      displayMode: {
        default: "input",
        parseHTML: (el: HTMLElement) =>
          el.getAttribute("data-display-mode") ?? "input",
        renderHTML: (attrs: Record<string, string>) => ({
          "data-display-mode": attrs.displayMode,
        }),
      },
      content: {
        default: "",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-content") ?? "",
        renderHTML: (attrs: Record<string, string>) => ({
          "data-content": attrs.content,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="db-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes({ "data-type": "db-block" }, HTMLAttributes),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DbBlockView, {
      stopEvent: () => true,
    });
  },
});
