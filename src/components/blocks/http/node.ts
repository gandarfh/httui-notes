import { ReactNodeViewRenderer } from "@tiptap/react";
import { ExecutableBlock } from "../ExecutableBlock";
import { HttpBlockView } from "./HttpBlockView";

export const HttpBlock = ExecutableBlock.extend({
  name: "httpBlock",

  addAttributes() {
    return {
      ...this.parent?.(),
      blockType: { default: "http" },
      alias: {
        default: "",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-alias") ?? "",
        renderHTML: () => ({}),
      },
      displayMode: {
        default: "input",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-display-mode") ?? "input",
        renderHTML: () => ({}),
      },
      content: {
        default: "",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-content") ?? "",
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="http-block"]' }];
  },

  renderHTML({ node }) {
    return [
      "div",
      {
        "data-type": "http-block",
        "data-alias": node.attrs.alias,
        "data-display-mode": node.attrs.displayMode,
        "data-content": node.attrs.content,
      },
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(HttpBlockView);
  },
});
