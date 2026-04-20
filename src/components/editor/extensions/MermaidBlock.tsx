import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/core";
import { Box, Textarea } from "@chakra-ui/react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { useColorMode } from "@/components/ui/color-mode";

mermaid.initialize({ startOnLoad: false, theme: "default" });

let mermaidIdCounter = 0;

const MermaidNodeView = memo(function MermaidNodeViewInner({ node, updateAttributes, selected }: NodeViewProps) {
  const content = node.attrs.content as string;
  const { colorMode } = useColorMode();
  const [editing, setEditing] = useState(false);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const renderTimeout = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: colorMode === "dark" ? "dark" : "default",
    });
  }, [colorMode]);

  useEffect(() => {
    if (renderTimeout.current) clearTimeout(renderTimeout.current);
    renderTimeout.current = setTimeout(async () => {
      try {
        const id = `mermaid-${++mermaidIdCounter}`;
        const { svg: rendered } = await mermaid.render(id, content);
        setSvg(rendered);
        setError("");
      } catch {
        setError("Diagrama invalido");
        setSvg("");
      }
    }, 500);
    return () => {
      if (renderTimeout.current) clearTimeout(renderTimeout.current);
    };
  }, [content, colorMode]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateAttributes({ content: e.target.value });
    },
    [updateAttributes],
  );

  return (
    <NodeViewWrapper data-type="mermaid">
      <Box
        border="1px solid"
        borderColor={selected ? "brand.500" : "border"}
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
            rows={8}
            border="none"
            bg="bg.subtle"
            autoFocus
          />
        ) : (
          <Box
            p={4}
            cursor="pointer"
            onClick={() => setEditing(true)}
            minH="60px"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            {error ? (
              <Box color="fg.muted" fontSize="sm" fontStyle="italic">
                {error}
              </Box>
            ) : svg ? (
              <Box dangerouslySetInnerHTML={{ __html: svg }} />
            ) : (
              <Box color="fg.muted" fontSize="sm">
                Clique para editar o diagrama
              </Box>
            )}
          </Box>
        )}
      </Box>
    </NodeViewWrapper>
  );
}, (prev, next) => prev.selected === next.selected && prev.node === next.node);

export const MermaidBlock = Node.create({
  name: "mermaidBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      content: {
        default: "graph TD\n  A --> B",
        parseHTML: (el) => el.getAttribute("data-content") ?? "",
        renderHTML: (attrs) => ({ "data-content": attrs.content }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mermaid"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes({ "data-type": "mermaid" }, HTMLAttributes),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidNodeView);
  },
});
