import { useEffect, useRef, useCallback, useState } from "react";
import { Box, HStack, Text, Badge } from "@chakra-ui/react";
import { LuCheck, LuX } from "react-icons/lu";
import { MergeView } from "@codemirror/merge";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useChatContext } from "@/contexts/ChatContext";
import { usePaneContext } from "@/contexts/PaneContext";
import { blockWidgetPlugin } from "@/lib/codemirror/cm-block-widgets.tsx";
import type { TabState } from "@/types/pane";

interface DiffViewerProps {
  tab: TabState;
}

type PermissionScope = "once" | "session" | "always";

const scopeLabels: Record<PermissionScope, string> = {
  once: "Once",
  session: "Session",
  always: "Always",
};

function computeLineStats(original: string, proposed: string): { added: number; removed: number } {
  const origLines = original.split("\n");
  const propLines = proposed.split("\n");
  const origSet = new Set(origLines);
  const propSet = new Set(propLines);
  let added = 0;
  let removed = 0;
  for (const line of propLines) {
    if (!origSet.has(line)) added++;
  }
  for (const line of origLines) {
    if (!propSet.has(line)) removed++;
  }
  return { added, removed };
}

const readOnlyExtension = EditorState.readOnly.of(true);
const themeExtension = EditorView.theme({
  "&": { height: "100%", fontSize: "13px" },
  ".cm-content": { fontFamily: "var(--chakra-fonts-mono)", padding: "8px 0" },
  ".cm-gutters": { background: "transparent", borderRight: "none" },
  ".cm-line": { padding: "0 8px" },
});

export function DiffViewer({ tab }: DiffViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mergeViewRef = useRef<MergeView | null>(null);
  const { pendingPermission, respondPermission } = useChatContext();
  const { actions } = usePaneContext();
  const [scope, setScope] = useState<PermissionScope>("once");

  const original = tab.originalContent ?? "";
  const proposed = tab.proposedContent ?? "";
  const stats = computeLineStats(original, proposed);

  // Create MergeView
  useEffect(() => {
    if (!containerRef.current) return;

    const view = new MergeView({
      a: {
        doc: original,
        extensions: [readOnlyExtension, themeExtension, blockWidgetPlugin],
      },
      b: {
        doc: proposed,
        extensions: [readOnlyExtension, themeExtension, blockWidgetPlugin],
      },
      parent: containerRef.current,
      highlightChanges: true,
      gutter: true,
      collapseUnchanged: { margin: 3, minSize: 6 },
    });

    mergeViewRef.current = view;

    return () => {
      view.destroy();
      mergeViewRef.current = null;
    };
  }, [original, proposed]);

  // Auto-close when permission is resolved externally
  useEffect(() => {
    if (!tab.permissionId) return;
    if (!pendingPermission || pendingPermission.permissionId !== tab.permissionId) {
      actions.closeDiffTab(tab.permissionId);
    }
  }, [pendingPermission, tab.permissionId, actions]);

  const handleAllow = useCallback(() => {
    if (!tab.permissionId) return;
    respondPermission(tab.permissionId, "allow", scope);
    actions.closeDiffTab(tab.permissionId);
  }, [tab.permissionId, respondPermission, scope, actions]);

  const handleDeny = useCallback(() => {
    if (!tab.permissionId) return;
    respondPermission(tab.permissionId, "deny");
    actions.closeDiffTab(tab.permissionId);
  }, [tab.permissionId, respondPermission, actions]);

  return (
    <Box h="100%" display="flex" flexDirection="column" overflow="hidden">
      {/* Header */}
      <HStack
        px={3}
        py={1.5}
        borderBottom="1px solid"
        borderColor="border"
        bg="bg.subtle"
        flexShrink={0}
        gap={2}
      >
        <Text fontSize="xs" fontWeight="medium" flex={1}>
          {tab.filePath}
        </Text>
        {stats.added > 0 && (
          <Badge size="sm" colorPalette="green" variant="subtle">+{stats.added}</Badge>
        )}
        {stats.removed > 0 && (
          <Badge size="sm" colorPalette="red" variant="subtle">-{stats.removed}</Badge>
        )}

        {/* Scope selector */}
        <HStack gap={0}>
          {(["once", "session", "always"] as PermissionScope[]).map((s) => (
            <Box
              key={s}
              as="button"
              px={1.5}
              py={0.5}
              fontSize="2xs"
              fontWeight={scope === s ? "semibold" : "normal"}
              color={scope === s ? "fg" : "fg.muted"}
              bg={scope === s ? "bg.emphasized" : "transparent"}
              border="1px solid"
              borderColor={scope === s ? "border" : "transparent"}
              rounded="sm"
              cursor="pointer"
              _hover={{ bg: "bg.subtle" }}
              onClick={() => setScope(s)}
            >
              {scopeLabels[s]}
            </Box>
          ))}
        </HStack>

        <Box
          as="button"
          display="flex"
          alignItems="center"
          gap={1}
          px={2}
          py={0.5}
          rounded="md"
          fontSize="xs"
          fontWeight="medium"
          bg="bg.subtle"
          border="1px solid"
          borderColor="border"
          cursor="pointer"
          _hover={{ bg: "bg.emphasized" }}
          onClick={handleDeny}
        >
          <LuX size={12} />
          Deny
        </Box>
        <Box
          as="button"
          display="flex"
          alignItems="center"
          gap={1}
          px={2}
          py={0.5}
          rounded="md"
          fontSize="xs"
          fontWeight="medium"
          bg="green.600"
          color="white"
          cursor="pointer"
          _hover={{ bg: "green.700" }}
          onClick={handleAllow}
        >
          <LuCheck size={12} />
          Allow
        </Box>
      </HStack>

      {/* Labels */}
      <HStack gap={0} flexShrink={0} borderBottom="1px solid" borderColor="border">
        <Box flex={1} px={3} py={1} bg="red.500/5">
          <Text fontSize="2xs" color="fg.muted" fontWeight="medium">Current</Text>
        </Box>
        <Box flex={1} px={3} py={1} bg="green.500/5" borderLeft="1px solid" borderColor="border">
          <Text fontSize="2xs" color="fg.muted" fontWeight="medium">Proposed</Text>
        </Box>
      </HStack>

      {/* MergeView container */}
      <Box
        ref={containerRef}
        flex={1}
        overflow="auto"
        css={{
          "& .cm-mergeView": { height: "100%" },
          "& .cm-mergeViewEditor": { overflow: "auto" },
          "& .cm-changedLine": { backgroundColor: "var(--chakra-colors-yellow-500-10, rgba(234, 179, 8, 0.1))" },
          "& .cm-changedText": { backgroundColor: "var(--chakra-colors-yellow-500-20, rgba(234, 179, 8, 0.2))" },
          "& .cm-deletedChunk": { backgroundColor: "var(--chakra-colors-red-500-10, rgba(239, 68, 68, 0.1))" },
          "& .cm-insertedLine": { backgroundColor: "var(--chakra-colors-green-500-10, rgba(34, 197, 94, 0.1))" },
        }}
      />
    </Box>
  );
}
