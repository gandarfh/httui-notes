import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/core";
import { Box, Textarea } from "@chakra-ui/react";
import { useState, useCallback } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

function MathBlockView({ node, updateAttributes, selected }: NodeViewProps) {
  const content = node.attrs.content as string;
  const [editing, setEditing] = useState(false);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateAttributes({ content: e.target.value });
    },
    [updateAttributes],
  );

  let rendered: string;
  try {
    rendered = katex.renderToString(content, { throwOnError: false, displayMode: true });
  } catch {
    rendered = content;
  }

  return (
    <NodeViewWrapper data-type="math-block">
      <Box
        border="1px solid"
        borderColor={selected ? "blue.500" : "border"}
        rounded="md"
        overflow="hidden"
        my={2}
      >
        {editing ? (
          <Textarea
            value={content}
            onChange={handleChange}
            onBlur={() => setEditing(false)}
            fontFamily="mono"
            fontSize="sm"
            rows={4}
            border="none"
            bg="bg.subtle"
            autoFocus
          />
        ) : (
          <Box
            p={4}
            cursor="pointer"
            onClick={() => setEditing(true)}
            textAlign="center"
            minH="40px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            dangerouslySetInnerHTML={{ __html: rendered }}
          />
        )}
      </Box>
    </NodeViewWrapper>
  );
}

export const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      content: {
        default: "E = mc^2",
        parseHTML: (el) => el.getAttribute("data-content") ?? "",
        renderHTML: (attrs) => ({ "data-content": attrs.content }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="math-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes({ "data-type": "math-block" }, HTMLAttributes),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockView);
  },
});
