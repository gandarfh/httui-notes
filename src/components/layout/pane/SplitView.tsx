import { useCallback, useRef } from "react";
import { Box, Flex } from "@chakra-ui/react";
import { usePaneContext } from "@/contexts/PaneContext";
import { PaneNode } from "./PaneNode";
import type { PaneLayout } from "@/types/pane";

export function SplitView({
  layout,
  path,
}: {
  layout: PaneLayout & { type: "split" };
  path: number[];
}) {
  const { actions } = usePaneContext();
  const isResizing = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isHorizontal = layout.direction === "horizontal";

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizing.current = true;
      document.body.style.cursor = isHorizontal ? "row-resize" : "col-resize";
      document.body.style.userSelect = "none";

      const onMouseMove = (e: MouseEvent) => {
        if (!isResizing.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const ratio = isHorizontal
          ? (e.clientY - rect.top) / rect.height
          : (e.clientX - rect.left) / rect.width;
        actions.resizeSplit(path, Math.max(0.15, Math.min(0.85, ratio)));
      };

      const onMouseUp = () => {
        isResizing.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [isHorizontal, actions, path],
  );

  const firstSize = `${layout.ratio * 100}%`;
  const secondSize = `${(1 - layout.ratio) * 100}%`;

  return (
    <Flex
      ref={containerRef}
      direction={isHorizontal ? "column" : "row"}
      flex={1}
      overflow="hidden"
    >
      <Box
        overflow="hidden"
        display="flex"
        style={isHorizontal ? { height: firstSize } : { width: firstSize }}
      >
        <PaneNode layout={layout.children[0]} path={[...path, 0]} />
      </Box>
      <Box
        w={isHorizontal ? "100%" : "4px"}
        h={isHorizontal ? "4px" : "100%"}
        cursor={isHorizontal ? "row-resize" : "col-resize"}
        _hover={{ bg: "brand.500/30" }}
        _active={{ bg: "brand.500/50" }}
        flexShrink={0}
        onMouseDown={startResize}
      />
      <Box
        overflow="hidden"
        display="flex"
        style={isHorizontal ? { height: secondSize } : { width: secondSize }}
      >
        <PaneNode layout={layout.children[1]} path={[...path, 1]} />
      </Box>
    </Flex>
  );
}
