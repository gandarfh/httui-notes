import { useCallback, useRef } from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { TabBar } from "./TabBar";
import { Editor } from "@/components/editor";
import type { PaneLayout } from "@/types/pane";
import type { VimMode } from "@/components/editor/vim";

interface PaneContainerProps {
  layout: PaneLayout;
  activePaneId: string;
  editorContents: Map<string, string>;
  vimEnabled: boolean;
  onVimModeChange?: (mode: VimMode) => void;
  onSelectTab: (paneId: string, index: number) => void;
  onCloseTab: (paneId: string, index: number) => void;
  onCloseOthers: (paneId: string, index: number) => void;
  onCloseAll: (paneId: string) => void;
  onEditorChange: (paneId: string, filePath: string, content: string) => void;
  onPaneClick: (paneId: string) => void;
  onSplitResize: (splitPath: number[], ratio: number) => void;
}

export function PaneContainer(props: PaneContainerProps) {
  return <PaneNode {...props} path={[]} />;
}

interface PaneNodeProps extends PaneContainerProps {
  path: number[];
}

function PaneNode(props: PaneNodeProps) {
  const { layout } = props;

  if (layout.type === "leaf") {
    return (
      <LeafPaneView
        pane={layout}
        isActive={layout.id === props.activePaneId}
        editorContents={props.editorContents}
        vimEnabled={props.vimEnabled}
        onVimModeChange={props.onVimModeChange}
        onSelectTab={(index) => props.onSelectTab(layout.id, index)}
        onCloseTab={(index) => props.onCloseTab(layout.id, index)}
        onCloseOthers={(index) => props.onCloseOthers(layout.id, index)}
        onCloseAll={() => props.onCloseAll(layout.id)}
        onEditorChange={(filePath, content) =>
          props.onEditorChange(layout.id, filePath, content)
        }
        onClick={() => props.onPaneClick(layout.id)}
      />
    );
  }

  return <SplitView {...props} layout={layout} />;
}

// --- Leaf Pane ---

function LeafPaneView({
  pane,
  isActive,
  editorContents,
  vimEnabled,
  onVimModeChange,
  onSelectTab,
  onCloseTab,
  onCloseOthers,
  onCloseAll,
  onEditorChange,
  onClick,
}: {
  pane: PaneLayout & { type: "leaf" };
  isActive: boolean;
  editorContents: Map<string, string>;
  vimEnabled: boolean;
  onVimModeChange?: (mode: VimMode) => void;
  onSelectTab: (index: number) => void;
  onCloseTab: (index: number) => void;
  onCloseOthers: (index: number) => void;
  onCloseAll: () => void;
  onEditorChange: (filePath: string, content: string) => void;
  onClick: () => void;
}) {
  const activeTab = pane.tabs[pane.activeTab];
  const content = activeTab
    ? (editorContents.get(activeTab.filePath) ?? "")
    : "";

  return (
    <Flex
      direction="column"
      flex={1}
      overflow="hidden"
      borderWidth={isActive ? "1px" : "0"}
      borderColor="blue.500/30"
      onClick={onClick}
    >
      <TabBar
        tabs={pane.tabs}
        activeTab={pane.activeTab}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
        onCloseOthers={onCloseOthers}
        onCloseAll={onCloseAll}
      />
      {activeTab ? (
        <Box flex={1} overflow="hidden">
          <Editor
            content={content}
            onChange={(c) => onEditorChange(activeTab.filePath, c)}
            filePath={activeTab.filePath}
            vimEnabled={vimEnabled}
            onVimModeChange={onVimModeChange}
          />
        </Box>
      ) : (
        <Flex flex={1} align="center" justify="center">
          <Text fontSize="sm" color="fg.muted">
            Open a file to start editing
          </Text>
        </Flex>
      )}
    </Flex>
  );
}

// --- Split View ---

function SplitView({
  layout,
  path,
  ...rest
}: PaneNodeProps & { layout: PaneLayout & { type: "split" } }) {
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
        rest.onSplitResize(path, Math.max(0.15, Math.min(0.85, ratio)));
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
    [isHorizontal, rest, path],
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
        <PaneNode {...rest} layout={layout.children[0]} path={[...path, 0]} />
      </Box>
      <Box
        w={isHorizontal ? "100%" : "4px"}
        h={isHorizontal ? "4px" : "100%"}
        cursor={isHorizontal ? "row-resize" : "col-resize"}
        _hover={{ bg: "blue.500/30" }}
        _active={{ bg: "blue.500/50" }}
        flexShrink={0}
        onMouseDown={startResize}
      />
      <Box
        overflow="hidden"
        display="flex"
        style={isHorizontal ? { height: secondSize } : { width: secondSize }}
      >
        <PaneNode {...rest} layout={layout.children[1]} path={[...path, 1]} />
      </Box>
    </Flex>
  );
}
