import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/core";
import { Box } from "@chakra-ui/react";

function WikilinkView({ node, extension }: NodeViewProps) {
  const target = node.attrs.target as string;
  const label = node.attrs.label as string || target;
  const onNavigate = (extension.options as WikilinkOptions).onNavigate;

  return (
    <NodeViewWrapper as="span" style={{ display: "inline" }}>
      <Box
        as="span"
        color="blue.500"
        cursor="pointer"
        textDecoration="underline"
        textDecorationStyle="dotted"
        textDecorationColor="blue.300"
        _hover={{ textDecorationStyle: "solid" }}
        data-wikilink={target}
        onClick={() => onNavigate?.(target)}
      >
        {label}
      </Box>
    </NodeViewWrapper>
  );
}

export interface WikilinkOptions {
  onNavigate?: (target: string) => void;
}

export const Wikilink = Node.create<WikilinkOptions>({
  name: "wikilink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return {
      onNavigate: undefined,
    };
  },

  addAttributes() {
    return {
      target: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-target") ?? "",
        renderHTML: (attrs) => ({ "data-target": attrs.target }),
      },
      label: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-label") ?? "",
        renderHTML: (attrs) => ({ "data-label": attrs.label }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="wikilink"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes({ "data-type": "wikilink" }, HTMLAttributes),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(WikilinkView, { as: "span" });
  },
});
