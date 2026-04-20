import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/core";
import { Box } from "@chakra-ui/react";
import { useState, useCallback } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

function MathInlineView({ node, updateAttributes, selected }: NodeViewProps) {
  const content = node.attrs.content as string;
  const [editing, setEditing] = useState(false);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateAttributes({ content: e.target.value });
    },
    [updateAttributes],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        setEditing(false);
      }
    },
    [],
  );

  if (editing) {
    return (
      <NodeViewWrapper as="span" data-type="math-inline" style={{ display: "inline" }}>
        <input
          type="text"
          value={content}
          onChange={handleChange}
          onBlur={() => setEditing(false)}
          onKeyDown={handleKeyDown}
          autoFocus
          style={{
            fontFamily: "monospace",
            fontSize: "0.875em",
            border: "1px solid var(--chakra-colors-border)",
            borderRadius: "4px",
            padding: "0 4px",
            outline: "none",
          }}
          size={Math.max(content.length, 4)}
        />
      </NodeViewWrapper>
    );
  }

  let rendered: string;
  try {
    rendered = katex.renderToString(content, { throwOnError: false, displayMode: false });
  } catch {
    rendered = content;
  }

  return (
    <NodeViewWrapper as="span" data-type="math-inline" style={{ display: "inline" }}>
      <Box
        as="span"
        cursor="pointer"
        onClick={() => setEditing(true)}
        px="2px"
        rounded="sm"
        bg={selected ? "brand.500/10" : undefined}
        dangerouslySetInnerHTML={{ __html: rendered }}
      />
    </NodeViewWrapper>
  );
}

export const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      content: {
        default: "x^2",
        parseHTML: (el) => el.getAttribute("data-content") ?? "",
        renderHTML: (attrs) => ({ "data-content": attrs.content }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="math-inline"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes({ "data-type": "math-inline" }, HTMLAttributes),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathInlineView, { as: "span" });
  },
});
