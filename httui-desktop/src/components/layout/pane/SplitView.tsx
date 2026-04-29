import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Flex } from "@chakra-ui/react";
import { usePaneStore } from "@/stores/pane";
import { PaneNode } from "./PaneNode";
import type { PaneLayout } from "@/types/pane";

export function SplitView({
  layout,
  path,
  handleEditorChange,
  onNavigateFile,
}: {
  layout: PaneLayout & { type: "split" };
  path: number[];
  handleEditorChange: (paneId: string, filePath: string, content: string, vaultPath: string) => void;
  onNavigateFile?: (filePath: string) => void;
}) {
  const resizeSplit = usePaneStore((s) => s.resizeSplit);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isHorizontal = layout.direction === "horizontal";

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
    },
    [],
  );

  useEffect(() => {
    if (!isResizing) return;

    const onMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const ratio = isHorizontal
        ? (e.clientY - rect.top) / rect.height
        : (e.clientX - rect.left) / rect.width;
      resizeSplit(path, Math.max(0.15, Math.min(0.85, ratio)));
    };

    const onMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizing, isHorizontal, resizeSplit, path]);

  const firstSize = `${layout.ratio * 100}%`;
  const secondSize = `${(1 - layout.ratio) * 100}%`;

  return (
    <Flex
      ref={containerRef}
      direction={isHorizontal ? "column" : "row"}
      flex={1}
      overflow="hidden"
      css={isResizing ? { cursor: isHorizontal ? "row-resize" : "col-resize", userSelect: "none" } : undefined}
    >
      <Box
        overflow="hidden"
        display="flex"
        style={isHorizontal ? { height: firstSize } : { width: firstSize }}
      >
        <PaneNode layout={layout.children[0]} path={[...path, 0]} handleEditorChange={handleEditorChange} onNavigateFile={onNavigateFile} />
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
        <PaneNode layout={layout.children[1]} path={[...path, 1]} handleEditorChange={handleEditorChange} onNavigateFile={onNavigateFile} />
      </Box>
    </Flex>
  );
}
