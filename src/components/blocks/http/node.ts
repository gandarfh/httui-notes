import { mergeAttributes } from "@tiptap/core";
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
    return [{ tag: 'div[data-type="http-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes({ "data-type": "http-block" }, HTMLAttributes),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(HttpBlockView, {
      stopEvent: () => true,
    });
  },
});
