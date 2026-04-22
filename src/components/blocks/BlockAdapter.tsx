/**
 * BlockAdapter — bridges BlockWidgetContext (CM6) to TipTap NodeViewProps.
 *
 * Creates a fake `node` and `updateAttributes` that the existing block views
 * (DbBlockView, HttpBlockView, E2eBlockView) can consume without modification.
 *
 * Rendered via React Portal OUTSIDE the CM6 editor DOM — no focus/scroll hacks needed.
 */
import { memo, useCallback, useMemo, useRef, useState } from "react";
import type { BlockWidgetContext } from "@/lib/codemirror/block-widget-context";
import { extractAlias, extractDisplayMode, buildInfoString } from "@/lib/codemirror/block-widget-context";
import { findFencedBlocks } from "@/lib/codemirror/cm-block-widgets";
import { DbBlockView } from "./db/DbBlockView";
import { HttpBlockView } from "./http/HttpBlockView";
import { E2eBlockView } from "./e2e/E2eBlockView";
import { BlockContextProvider } from "./BlockContext";
import type { DisplayMode, ExecutionState } from "./ExecutableBlock";

interface BlockAdapterProps {
  ctx: BlockWidgetContext;
}

function createFakeEditor(ctx: BlockWidgetContext) {
  return {
    __cmView: ctx.view,
    state: {
      doc: {
        descendants: () => {},
      },
    },
  };
}

function BlockAdapterInner({ ctx }: BlockAdapterProps) {
  const alias = extractAlias(ctx.info) ?? "";
  const initialDisplayMode = extractDisplayMode(ctx.info) ?? "input";
  const blockType = ctx.lang === "http" ? "http" : ctx.lang === "e2e" ? "e2e" : "db";

  const [displayMode, setDisplayMode] = useState<DisplayMode>(initialDisplayMode as DisplayMode);
  const [executionState, setExecutionState] = useState<ExecutionState>("idle");

  const fakeEditorRef = useRef(createFakeEditor(ctx));
  fakeEditorRef.current.__cmView = ctx.view;

  const updateAttributes = useCallback(
    (attrs: Record<string, unknown>) => {
      if ("content" in attrs && typeof attrs.content === "string") {
        ctx.updateContent(attrs.content);
      }

      if ("alias" in attrs || "displayMode" in attrs) {
        const currentAlias = extractAlias(ctx.info) ?? alias;
        const currentDM = extractDisplayMode(ctx.info) ?? displayMode;
        const newAlias = typeof attrs.alias === "string" ? attrs.alias : currentAlias;
        const newDisplayMode = typeof attrs.displayMode === "string" ? attrs.displayMode : currentDM;
        ctx.updateInfo(buildInfoString(newAlias, newDisplayMode));
      }

      if ("displayMode" in attrs) {
        setDisplayMode(attrs.displayMode as DisplayMode);
      }
      if ("executionState" in attrs) {
        setExecutionState(attrs.executionState as ExecutionState);
      }
    },
    [ctx],
  );

  const getPos = useCallback(() => ctx.from, [ctx.from]);

  const fakeNode = useMemo(
    () => ({
      attrs: {
        alias,
        displayMode,
        executionState,
        content: ctx.content,
        blockType,
      },
    }),
    [alias, displayMode, executionState, ctx.content, blockType],
  );

  const fakeNodeViewProps = useMemo(
    () => ({
      node: fakeNode,
      editor: fakeEditorRef.current as never,
      getPos: getPos as never,
      updateAttributes: updateAttributes as never,
      selected: false,
      extension: {} as never,
      HTMLAttributes: {} as never,
      deleteNode: (() => {
        const blocks = findFencedBlocks(ctx.view.state.doc);
        const blockAlias = extractAlias(ctx.info);
        const block = blockAlias
          ? blocks.find(b => extractAlias(b.info) === blockAlias)
          : blocks.find(b => b.from === ctx.from);
        if (block) {
          const deleteEnd = block.to < ctx.view.state.doc.length
            ? block.to + 1
            : block.to;
          ctx.view.dispatch({
            changes: { from: block.from, to: deleteEnd, insert: "" },
          });
        }
      }) as never,
    }),
    [fakeNode, getPos, updateAttributes],
  );

  return (
    <BlockContextProvider value={{ filePath: ctx.filePath }}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {blockType === "db" && <DbBlockView {...(fakeNodeViewProps as any)} />}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {blockType === "http" && <HttpBlockView {...(fakeNodeViewProps as any)} />}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {blockType === "e2e" && <E2eBlockView {...(fakeNodeViewProps as any)} />}
    </BlockContextProvider>
  );
}

export const BlockAdapter = memo(BlockAdapterInner);
