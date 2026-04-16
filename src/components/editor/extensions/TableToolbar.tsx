import { useCallback, useEffect, useState } from "react";
import { HStack, IconButton, Box, Portal } from "@chakra-ui/react";
import {
  LuArrowUp,
  LuArrowDown,
  LuArrowLeft,
  LuArrowRight,
  LuTrash2,
  LuGrid2X2,
} from "react-icons/lu";
import type { Editor } from "@tiptap/core";

interface TableToolbarProps {
  editor: Editor;
}

export function TableToolbar({ editor }: TableToolbarProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    if (!editor.isActive("table")) {
      setVisible(false);
      return;
    }

    const { view } = editor;
    const { from } = view.state.selection;
    const coords = view.coordsAtPos(from);

    setPosition({
      top: coords.top - 40,
      left: coords.left,
    });
    setVisible(true);
  }, [editor]);

  useEffect(() => {
    editor.on("selectionUpdate", updatePosition);
    return () => {
      editor.off("selectionUpdate", updatePosition);
    };
  }, [editor, updatePosition]);

  if (!visible) return null;

  return (
    <Portal>
      <Box
        position="fixed"
        top={`${position.top}px`}
        left={`${position.left}px`}
        zIndex={50}
        onClick={(e) => e.stopPropagation()}
      >
        <HStack
          bg="bg"
          border="1px solid"
          borderColor="border"
          rounded="md"
          shadow="md"
          p={0.5}
          gap={0}
        >
          <IconButton
            aria-label="Add row above"
            size="2xs"
            variant="ghost"
            onClick={() => editor.chain().focus().addRowBefore().run()}
            title="Add row above"
          >
            <LuArrowUp />
          </IconButton>
          <IconButton
            aria-label="Add row below"
            size="2xs"
            variant="ghost"
            onClick={() => editor.chain().focus().addRowAfter().run()}
            title="Add row below"
          >
            <LuArrowDown />
          </IconButton>
          <IconButton
            aria-label="Add column left"
            size="2xs"
            variant="ghost"
            onClick={() => editor.chain().focus().addColumnBefore().run()}
            title="Add column left"
          >
            <LuArrowLeft />
          </IconButton>
          <IconButton
            aria-label="Add column right"
            size="2xs"
            variant="ghost"
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            title="Add column right"
          >
            <LuArrowRight />
          </IconButton>
          <Box w="1px" h="16px" bg="border" mx={0.5} />
          <IconButton
            aria-label="Delete row"
            size="2xs"
            variant="ghost"
            colorPalette="red"
            onClick={() => editor.chain().focus().deleteRow().run()}
            title="Delete row"
          >
            <LuArrowUp style={{ textDecoration: "line-through" }} />
          </IconButton>
          <IconButton
            aria-label="Delete column"
            size="2xs"
            variant="ghost"
            colorPalette="red"
            onClick={() => editor.chain().focus().deleteColumn().run()}
            title="Delete column"
          >
            <LuArrowLeft style={{ textDecoration: "line-through" }} />
          </IconButton>
          <IconButton
            aria-label="Delete table"
            size="2xs"
            variant="ghost"
            colorPalette="red"
            onClick={() => editor.chain().focus().deleteTable().run()}
            title="Delete table"
          >
            <LuTrash2 />
          </IconButton>
        </HStack>
      </Box>
    </Portal>
  );
}
