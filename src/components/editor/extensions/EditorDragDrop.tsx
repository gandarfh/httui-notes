import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
  type DragMoveEvent,
} from "@dnd-kit/core";
import { useState, useCallback, useEffect, useRef } from "react";
import { Box } from "@chakra-ui/react";
import type { Editor } from "@tiptap/core";

interface DragState {
  blockPos: number;
  blockSize: number;
  blockHTML: string;
  blockWidth: number;
}

interface DropIndicator {
  top: number;
  left: number;
  width: number;
  targetPos: number;
}

interface HandlePos {
  top: number;
  left: number;
  visible: boolean;
  blockPos: number;
  depth: number;
}

// Node types that are wrappers (not individually draggable)
const WRAPPER_TYPES = ["bulletList", "orderedList", "taskList", "table"];
// Node types that are the draggable unit inside wrappers
const DRAGGABLE_TYPES = ["listItem", "taskItem"];

/**
 * Find the draggable block at the cursor position.
 * For list items, returns the listItem (not the inner paragraph).
 * For top-level blocks, returns the block itself.
 * Skips wrapper nodes (bulletList, orderedList, etc.).
 */
function findBlockAtCursor(editor: Editor, x: number, y: number) {
  const view = editor.view;
  const pos = view.posAtCoords({ left: x, top: y });
  if (!pos) return null;

  const resolved = view.state.doc.resolve(pos.pos);
  if (resolved.depth === 0) return null;

  // Walk up from deepest to find the right draggable unit
  for (let depth = resolved.depth; depth >= 1; depth--) {
    const blockPos = resolved.before(depth);
    const node = view.state.doc.nodeAt(blockPos);
    if (!node) continue;

    // Skip wrappers
    if (WRAPPER_TYPES.includes(node.type.name)) continue;

    // If this is a draggable unit (listItem, taskItem), use it
    if (DRAGGABLE_TYPES.includes(node.type.name)) {
      const dom = view.nodeDOM(blockPos);
      if (dom && dom instanceof HTMLElement) {
        return { blockPos, dom, depth };
      }
    }

    // If parent is a draggable unit, skip this (e.g., paragraph inside listItem)
    if (depth > 1) {
      const parentPos = resolved.before(depth - 1);
      const parentNode = view.state.doc.nodeAt(parentPos);
      if (parentNode && DRAGGABLE_TYPES.includes(parentNode.type.name)) {
        continue; // skip, will pick up the parent listItem in the next iteration
      }
    }

    // Otherwise this is a standalone block (heading, paragraph, etc.)
    const dom = view.nodeDOM(blockPos);
    if (dom && dom instanceof HTMLElement) {
      return { blockPos, dom, depth };
    }
  }

  return null;
}

/**
 * Find drop position and indicator line.
 * For nested blocks (list items), shows indicator between siblings.
 */
function findDropTarget(editor: Editor, x: number, y: number, sourcePos: number) {
  const block = findBlockAtCursor(editor, x, y);
  if (!block) return null;

  const rect = block.dom.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  const insertBefore = y < midY;

  const node = editor.state.doc.nodeAt(block.blockPos);
  if (!node) return null;

  const targetPos = insertBefore ? block.blockPos : block.blockPos + node.nodeSize;

  if (block.blockPos === sourcePos) return null;

  return {
    targetPos,
    indicator: {
      top: insertBefore ? rect.top - 1 : rect.bottom + 1,
      left: rect.left,
      width: rect.width,
      targetPos,
    },
  };
}

interface EditorDragDropProps {
  editor: Editor | null;
  children: React.ReactNode;
}

export function EditorDragDrop({ editor, children }: EditorDragDropProps) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const [handlePos, setHandlePos] = useState<HandlePos>({
    top: 0,
    left: 0,
    visible: false,
    blockPos: -1,
    depth: 1,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
  );

  // Track mouse to position the drag handle
  useEffect(() => {
    if (!editor) return;
    const view = editor.view;

    const onMouseMove = (e: MouseEvent) => {
      const block = findBlockAtCursor(editor, e.clientX, e.clientY);
      if (!block) {
        setHandlePos((p) => ({ ...p, visible: false }));
        return;
      }

      const blockRect = block.dom.getBoundingClientRect();
      setHandlePos({
        top: blockRect.top + 2,
        left: blockRect.left - 26,
        visible: true,
        blockPos: block.blockPos,
        depth: block.depth,
      });
    };

    const onMouseLeave = () => {
      setHandlePos((p) => ({ ...p, visible: false }));
    };

    view.dom.addEventListener("mousemove", onMouseMove);
    view.dom.addEventListener("mouseleave", onMouseLeave);
    return () => {
      view.dom.removeEventListener("mousemove", onMouseMove);
      view.dom.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [editor]);

  const dragNodeRef = useRef<import("@tiptap/pm/model").Node | null>(null);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      if (!editor) return;
      const blockPos = event.active.data.current?.blockPos as number;
      if (blockPos == null || blockPos < 0) return;

      const node = editor.state.doc.nodeAt(blockPos);
      if (!node) return;

      const dom = editor.view.nodeDOM(blockPos) as HTMLElement | null;
      if (!dom) return;

      const blockHTML = dom.outerHTML;
      const blockWidth = editor.view.dom.offsetWidth;

      // Store the node and delete from document immediately
      dragNodeRef.current = node;
      const { tr } = editor.state;
      tr.delete(blockPos, blockPos + node.nodeSize);
      editor.view.dispatch(tr);

      setDragState({
        blockPos,
        blockSize: node.nodeSize,
        blockHTML,
        blockWidth,
      });
    },
    [editor],
  );

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      if (!editor || !dragState) return;

      const activatorEvent = event.activatorEvent as PointerEvent;
      const pointerY = activatorEvent.clientY + (event.delta?.y ?? 0);
      const pointerX = activatorEvent.clientX + (event.delta?.x ?? 0);

      const target = findDropTarget(editor, pointerX, pointerY, -1);
      setDropIndicator(target?.indicator ?? null);
    },
    [editor, dragState],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const sourceNode = dragNodeRef.current;
      dragNodeRef.current = null;

      if (!editor || !dragState || !sourceNode) {
        setDragState(null);
        setDropIndicator(null);
        return;
      }

      const activatorEvent = event.activatorEvent as PointerEvent;
      const pointerY = activatorEvent.clientY + (event.delta?.y ?? 0);
      const pointerX = activatorEvent.clientX + (event.delta?.x ?? 0);

      const target = findDropTarget(editor, pointerX, pointerY, -1);

      if (target) {
        // Insert at drop position
        const { tr } = editor.state;
        tr.insert(target.targetPos, sourceNode);
        editor.view.dispatch(tr);
      } else {
        // No valid target — undo the delete (put it back)
        const { tr } = editor.state;
        tr.insert(dragState.blockPos, sourceNode);
        editor.view.dispatch(tr);
      }

      setDragState(null);
      setDropIndicator(null);
    },
    [editor, dragState],
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <Box position="relative" h="100%">
        {children}
        <DragHandleButton handlePos={handlePos} isDragging={!!dragState} />

        {/* Drop indicator line */}
        {dropIndicator && (
          <Box
            position="fixed"
            top={`${dropIndicator.top}px`}
            left={`${dropIndicator.left}px`}
            w={`${dropIndicator.width}px`}
            h="2px"
            bg="blue.500"
            rounded="full"
            zIndex={50}
            pointerEvents="none"
            transition="top 0.1s ease"
          />
        )}
      </Box>

      <DragOverlay dropAnimation={null}>
        {dragState ? (
          <Box
            className="tiptap"
            bg="bg"
            w={`${dragState.blockWidth}px`}
            h="auto"
            minH="0"
            opacity={0.85}
            overflow="hidden"
            pointerEvents="none"
            dangerouslySetInnerHTML={{ __html: dragState.blockHTML }}
            css={{ "&&": { minHeight: 0, padding: 0 } }}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function DragHandleButton({
  handlePos,
  isDragging,
}: {
  handlePos: HandlePos;
  isDragging: boolean;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: "editor-drag-handle",
    data: { blockPos: handlePos.blockPos },
  });

  if (isDragging) return null;

  return (
    <Box
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      position="fixed"
      top={`${handlePos.top}px`}
      left={`${handlePos.left}px`}
      w="20px"
      h="20px"
      display="flex"
      alignItems="center"
      justifyContent="center"
      cursor="grab"
      rounded="sm"
      opacity={handlePos.visible ? 0.4 : 0}
      transition="opacity 0.15s"
      color="fg.muted"
      fontSize="13px"
      fontWeight="bold"
      _hover={{ opacity: 1, bg: "bg.subtle" }}
      userSelect="none"
      zIndex={50}
    >
      ⠿
    </Box>
  );
}
