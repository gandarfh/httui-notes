import { useRef, useEffect, useCallback, useState } from "react";
import { Box } from "@chakra-ui/react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, HighlightStyle, bracketMatching } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { autocompletion, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { search, highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { vim } from "@replit/codemirror-vim";
import { hybridRendering } from "@/lib/codemirror/cm-hybrid-rendering";
import { slashCommands, slashCompletionSource } from "@/lib/codemirror/cm-slash-commands";
import { createEditorBlockWidgets, clearHeightCache } from "@/lib/codemirror/cm-block-widgets";
import { blockNotifierPlugin } from "./BlockWidgetOverlay";
import { wikilinks, createWikilinkCompletion } from "@/lib/codemirror/cm-wikilinks";
import { tables } from "@/lib/codemirror/cm-tables";
import { moveBlocksKeymap } from "@/lib/codemirror/cm-move-blocks";
import { scrollPositionsStore } from "@/hooks/usePaneState";
import { BlockContextProvider } from "@/components/blocks/BlockContext";
import { BlockWidgetOverlay } from "./BlockWidgetOverlay";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import type { FileEntry } from "@/lib/tauri/commands";

function flattenFiles(entries: FileEntry[]): { name: string; path: string }[] {
  const result: { name: string; path: string }[] = [];
  for (const entry of entries) {
    if (!entry.is_dir && entry.name.endsWith(".md")) {
      result.push({ name: entry.name, path: entry.path });
    }
    if (entry.children) {
      result.push(...flattenFiles(entry.children));
    }
  }
  return result;
}

interface MarkdownEditorProps {
  content: string;
  onChange: (markdown: string) => void;
  filePath: string;
  vimEnabled?: boolean;
}

// Compartment for toggling vim mode without recreating the editor
const vimCompartment = new Compartment();

// Custom highlight style — no heading styles (hybrid rendering handles those)
const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.keyword, color: "var(--chakra-colors-purple-500)" },
  { tag: tags.string, color: "var(--chakra-colors-green-500)" },
  { tag: tags.comment, color: "var(--chakra-colors-fg-muted)", fontStyle: "italic" },
  { tag: tags.number, color: "var(--chakra-colors-orange-500)" },
  { tag: tags.meta, color: "var(--chakra-colors-fg-subtle)" },
  { tag: tags.link, color: "var(--chakra-colors-blue-400)", textDecoration: "none" },
  { tag: tags.url, color: "var(--chakra-colors-blue-400)" },
  { tag: tags.monospace, fontFamily: "var(--chakra-fonts-mono)", fontSize: "0.85em" },
  { tag: tags.processingInstruction, color: "var(--chakra-colors-fg-subtle)" },
]);

// Static theme for the markdown editor
const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "14px",
  },
  "&.cm-editor > .cm-scroller > .cm-content": {
    fontFamily: "var(--chakra-fonts-body)",
    padding: "24px 32px",
    caretColor: "var(--chakra-colors-fg)",
    overflow: "hidden",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--chakra-colors-fg)",
  },
  ".cm-scroller": {
    overflow: "auto",
  },
  ".cm-gutters": {
    display: "none",
  },
  ".cm-activeLine": {
    backgroundColor: "transparent",
  },
  ".tok-meta": {
    color: "var(--chakra-colors-fg-subtle) !important",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "var(--chakra-colors-blue-500/20) !important",
  },
  ".cm-line:has(.tok-meta)": {
    fontFamily: "var(--chakra-fonts-mono)",
    fontSize: "0.875em",
  },
  // Vim panels
  ".cm-vim-panel": {
    padding: "2px 8px",
    fontFamily: "var(--chakra-fonts-mono)",
    fontSize: "13px",
    backgroundColor: "var(--chakra-colors-bg-subtle)",
    borderTop: "1px solid var(--chakra-colors-border)",
    color: "var(--chakra-colors-fg)",
  },
  ".cm-vim-panel input": {
    fontFamily: "var(--chakra-fonts-mono)",
    fontSize: "13px",
    backgroundColor: "transparent",
    color: "var(--chakra-colors-fg)",
    border: "none",
    outline: "none",
  },
  ".cm-searchMatch": {
    backgroundColor: "var(--chakra-colors-yellow-500/30)",
    borderRadius: "2px",
  },
  ".cm-searchMatch-selected": {
    backgroundColor: "var(--chakra-colors-yellow-500/50)",
  },
  ".cm-panels": {
    backgroundColor: "var(--chakra-colors-bg-subtle)",
    color: "var(--chakra-colors-fg)",
  },
  ".cm-panels-bottom": {
    borderTop: "1px solid var(--chakra-colors-border)",
  },
  // Block placeholders
  ".cm-block-placeholder": {
    width: "100%",
  },
  // Hide raw markdown lines behind block widgets
  ".cm-hidden-block-line": {
    height: "0 !important",
    padding: "0 !important",
    margin: "0 !important",
    overflow: "hidden !important",
    fontSize: "0 !important",
    lineHeight: "0 !important",
    border: "none !important",
  },
});

export function MarkdownEditor({
  content,
  onChange,
  filePath,
  vimEnabled = false,
}: MarkdownEditorProps) {
  const { entries, handleFileSelect } = useWorkspace();
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const handleFileSelectRef = useRef(handleFileSelect);
  handleFileSelectRef.current = handleFileSelect;
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const isExternalUpdate = useRef(false);
  const filePathRef = useRef(filePath);
  const [editorReady, setEditorReady] = useState(false);

  filePathRef.current = filePath;

  // Create the editor on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && !isExternalUpdate.current) {
        onChangeRef.current(update.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: content,
      extensions: [
        vimCompartment.of(vimEnabled ? vim() : []),
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(markdownHighlightStyle),
        bracketMatching(),
        closeBrackets(),
        search({ top: false }),
        highlightSelectionMatches(),
        history(),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          indentWithTab,
        ]),
        moveBlocksKeymap(),
        hybridRendering(),
        createEditorBlockWidgets(),
        blockNotifierPlugin,
        tables(),
        slashCommands(),
        wikilinks({
          getFiles: () => flattenFiles(entriesRef.current),
          onNavigate: (target: string) => {
            const files = flattenFiles(entriesRef.current);
            const match = files.find(
              (f) => f.path === target || f.name === target || f.name === `${target}.md`,
            );
            if (match) handleFileSelectRef.current(match.path);
          },
        }),
        autocompletion({
          override: [
            slashCompletionSource,
            createWikilinkCompletion(() => flattenFiles(entriesRef.current)),
          ],
          icons: false,
        }),
        editorTheme,
        updateListener,
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;
    setEditorReady(true);

    const saved = scrollPositionsStore.get(filePath);
    if (saved) {
      view.scrollDOM.scrollTop = saved;
    }

    return () => {
      scrollPositionsStore.set(filePathRef.current, view.scrollDOM.scrollTop);
      view.destroy();
      viewRef.current = null;
      setEditorReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toggle vim mode
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: vimCompartment.reconfigure(vimEnabled ? vim() : []),
    });
  }, [vimEnabled]);

  // Handle file switching
  const prevFilePathRef = useRef(filePath);
  const contentRef = useRef(content);
  contentRef.current = content;

  useEffect(() => {
    if (filePath === prevFilePathRef.current) return;
    const prevPath = prevFilePathRef.current;
    prevFilePathRef.current = filePath;

    const view = viewRef.current;
    if (!view) return;

    scrollPositionsStore.set(prevPath, view.scrollDOM.scrollTop);
    clearHeightCache();

    isExternalUpdate.current = true;
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: contentRef.current,
      },
    });
    isExternalUpdate.current = false;

    const saved = scrollPositionsStore.get(filePath);
    view.scrollDOM.scrollTop = saved ?? 0;
  }, [filePath]);

  // Save scroll position
  const handleScroll = useCallback(() => {
    const view = viewRef.current;
    if (view) {
      scrollPositionsStore.set(filePathRef.current, view.scrollDOM.scrollTop);
    }
  }, []);

  // Listen for external file reloads
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<{ path: string; markdown: string }>(
        "file-reloaded",
        (event) => {
          if (event.payload.path !== filePath) return;
          const view = viewRef.current;
          if (!view) return;

          const currentContent = view.state.doc.toString();
          if (currentContent === event.payload.markdown) return;

          isExternalUpdate.current = true;
          view.dispatch({
            changes: {
              from: 0,
              to: view.state.doc.length,
              insert: event.payload.markdown,
            },
          });
          isExternalUpdate.current = false;
        },
      ).then((fn) => {
        unlisten = fn;
      });
    });

    return () => {
      unlisten?.();
    };
  }, [filePath]);

  return (
    <BlockContextProvider value={{ filePath }}>
      <Box position="relative" h="100%" overflow="hidden">
        <Box
          ref={containerRef}
          h="100%"
          overflow="hidden"
          bg="bg"
          onScroll={handleScroll}
          css={{
            "& .cm-editor": { height: "100%" },
            "& .cm-editor.cm-focused": { outline: "none" },
          }}
        />
        {editorReady && viewRef.current && (
          <BlockWidgetOverlay view={viewRef.current} filePath={filePath} />
        )}
      </Box>
    </BlockContextProvider>
  );
}
