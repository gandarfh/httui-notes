import { useRef, useEffect, useCallback } from "react";
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
import { createEditorBlockWidgets, setEditorBlockWidgetFilePath } from "@/lib/codemirror/cm-block-widgets";
import { wikilinks, createWikilinkCompletion } from "@/lib/codemirror/cm-wikilinks";
import { tables } from "@/lib/codemirror/cm-tables";
import { setWidgetEnvironmentContext } from "@/lib/codemirror/widget-providers";
import { scrollPositionsStore } from "@/hooks/usePaneState";
import { BlockContextProvider } from "@/components/blocks/BlockContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useEnvironmentContext } from "@/contexts/EnvironmentContext";
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
  // No heading styles — hybrid rendering handles them
]);

// Static theme for the markdown editor
const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "14px",
  },
  // Only apply padding to the top-level editor, not nested CMs inside widgets
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
  // Fenced code block lines
  ".tok-meta": {
    color: "var(--chakra-colors-fg-subtle) !important",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "var(--chakra-colors-blue-500/20) !important",
  },
  // Fenced code blocks
  ".cm-line:has(.tok-meta)": {
    fontFamily: "var(--chakra-fonts-mono)",
    fontSize: "0.875em",
  },
  // Vim command line panel (for /, :, ? commands)
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
  // Vim search highlights
  ".cm-searchMatch": {
    backgroundColor: "var(--chakra-colors-yellow-500/30)",
    borderRadius: "2px",
  },
  ".cm-searchMatch-selected": {
    backgroundColor: "var(--chakra-colors-yellow-500/50)",
  },
  // CM panels container
  ".cm-panels": {
    backgroundColor: "var(--chakra-colors-bg-subtle)",
    color: "var(--chakra-colors-fg)",
  },
  ".cm-panels-bottom": {
    borderTop: "1px solid var(--chakra-colors-border)",
  },
  // Block widgets — stay within editor width
  ".cm-editor-block-widget": {
    maxWidth: "100%",
    width: "100%",
    userSelect: "none",
    "-webkit-user-select": "none",
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
  const envContext = useEnvironmentContext();
  setWidgetEnvironmentContext(envContext);
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

  // Keep filePath in sync for block widgets (module-level, no React side effects)
  filePathRef.current = filePath;
  setEditorBlockWidgetFilePath(filePath);

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
        hybridRendering(),
        createEditorBlockWidgets(),
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

    // Restore scroll position
    const saved = scrollPositionsStore.get(filePath);
    if (saved) {
      view.scrollDOM.scrollTop = saved;
    }

    return () => {
      // Save scroll position before destroy
      scrollPositionsStore.set(filePathRef.current, view.scrollDOM.scrollTop);
      view.destroy();
      viewRef.current = null;
    };
    // Only recreate on mount/unmount — content and file switching handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toggle vim mode via compartment (no editor recreation)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: vimCompartment.reconfigure(vimEnabled ? vim() : []),
    });
  }, [vimEnabled]);

  // Handle file switching — update doc content when filePath changes
  const prevFilePathRef = useRef(filePath);
  const contentRef = useRef(content);
  contentRef.current = content;

  useEffect(() => {
    if (filePath === prevFilePathRef.current) return;
    const prevPath = prevFilePathRef.current;
    prevFilePathRef.current = filePath;

    const view = viewRef.current;
    if (!view) return;

    // Save scroll of previous file
    scrollPositionsStore.set(prevPath, view.scrollDOM.scrollTop);

    isExternalUpdate.current = true;
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: contentRef.current,
      },
    });
    isExternalUpdate.current = false;

    // Restore scroll for new file
    const saved = scrollPositionsStore.get(filePath);
    view.scrollDOM.scrollTop = saved ?? 0;
  }, [filePath]);

  // Handle scroll position saving
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

          // Only update if content actually changed (avoids auto-save → watcher loop)
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
    </BlockContextProvider>
  );
}
