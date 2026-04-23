import { useRef, useEffect, useMemo, useCallback, useState } from "react";
import { Box } from "@chakra-ui/react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { EditorView, keymap } from "@codemirror/view";
import { Compartment } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages as cmLanguages } from "@codemirror/language-data";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, HighlightStyle, bracketMatching } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { autocompletion, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { search, highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { vim } from "@replit/codemirror-vim";
import { hybridRendering } from "@/lib/codemirror/cm-hybrid-rendering";
import { slashCommands, slashCompletionSource, slashIconOption } from "@/lib/codemirror/cm-slash-commands";
import { createEditorBlockWidgets } from "@/lib/codemirror/cm-block-widgets";
import { wikilinks, createWikilinkCompletion } from "@/lib/codemirror/cm-wikilinks";
import { tables } from "@/lib/codemirror/cm-tables";
import { moveBlocksKeymap } from "@/lib/codemirror/cm-move-blocks";
import { BlockContextProvider } from "@/components/blocks/BlockContext";
import { WidgetPortals } from "./WidgetPortals";
import { useWorkspaceStore } from "@/stores/workspace";
import type { FileEntry } from "@/lib/tauri/commands";
import { listen } from "@tauri-apps/api/event";

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
  onNavigateFile?: (filePath: string) => void;
}

// Compartment for toggling vim mode without recreating the editor
const vimCompartment = new Compartment();

// Custom highlight style — Chakra-token driven so the editor follows the app theme.
const markdownHighlightStyle = HighlightStyle.define([
  // Markdown inline formatting
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "var(--chakra-colors-blue-400)", textDecoration: "none" },
  { tag: tags.url, color: "var(--chakra-colors-blue-400)" },
  { tag: tags.monospace, fontFamily: "var(--chakra-fonts-mono)", fontSize: "0.85em" },
  { tag: tags.processingInstruction, color: "var(--chakra-colors-fg-subtle)" },
  { tag: tags.meta, color: "var(--chakra-colors-fg-subtle)" },

  // Code syntax highlighting (for nested languages via codeLanguages)
  { tag: tags.keyword, color: "var(--chakra-colors-purple-500)" },
  { tag: [tags.atom, tags.bool, tags.null], color: "var(--chakra-colors-orange-500)" },
  { tag: [tags.number, tags.integer, tags.float], color: "var(--chakra-colors-orange-500)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--chakra-colors-green-500)" },
  { tag: [tags.regexp, tags.escape], color: "var(--chakra-colors-green-400)" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "var(--chakra-colors-fg-muted)", fontStyle: "italic" },
  { tag: [tags.variableName, tags.name], color: "var(--chakra-colors-fg)" },
  { tag: [tags.propertyName, tags.attributeName], color: "var(--chakra-colors-cyan-400)" },
  { tag: [tags.typeName, tags.className, tags.namespace], color: "var(--chakra-colors-yellow-400)" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "var(--chakra-colors-blue-400)" },
  { tag: [tags.definition(tags.variableName), tags.definition(tags.propertyName)], color: "var(--chakra-colors-blue-300)" },
  { tag: tags.operator, color: "var(--chakra-colors-pink-400)" },
  { tag: [tags.punctuation, tags.bracket, tags.squareBracket, tags.paren, tags.brace], color: "var(--chakra-colors-fg-subtle)" },
  { tag: tags.tagName, color: "var(--chakra-colors-red-400)" },
  { tag: tags.self, color: "var(--chakra-colors-purple-400)", fontStyle: "italic" },
  { tag: tags.heading, fontWeight: "600" },
  { tag: tags.invalid, color: "var(--chakra-colors-red-500)" },
]);

// Static theme for the markdown editor
const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "14px",
    color: "var(--chakra-colors-fg)",
    backgroundColor: "var(--chakra-colors-bg)",
  },
  "&.cm-editor > .cm-scroller > .cm-content": {
    fontFamily: "var(--chakra-fonts-body)",
    padding: "24px 32px",
    caretColor: "var(--chakra-colors-fg)",
    color: "var(--chakra-colors-fg)",
    overflow: "hidden",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--chakra-colors-fg)",
  },
  ".cm-scroller": {
    overflow: "auto",
    overflowAnchor: "none",
  },
  ".cm-content": {
    overflowAnchor: "none",
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
  ".cm-block-portal": {
    overflowAnchor: "none",
    width: "100%",
    background: "var(--chakra-colors-bg)",
    margin: "8px 0",
    borderRadius: "8px",
  },
  ".cm-hidden-block-line": {
    height: "0 !important",
    padding: "0 !important",
    margin: "0 !important",
    overflow: "hidden !important",
    fontSize: "0 !important",
    lineHeight: "0 !important",
    border: "none !important",
  },
}, { dark: true });

// Static CSS for the container — @uiw/react-codemirror wraps the editor
// in its own div, which needs explicit height for .cm-scroller to work
const containerCss = {
  "& > div": { height: "100%" },
  "& .cm-editor": { height: "100%" },
  "& .cm-editor.cm-focused": { outline: "none" },
};

export function MarkdownEditor({
  content,
  onChange,
  filePath,
  vimEnabled = false,
  onNavigateFile,
}: MarkdownEditorProps) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [editorReady, setEditorReady] = useState(false);

  // Read workspace state imperatively (non-reactive)
  const entriesRef = useRef<FileEntry[]>(useWorkspaceStore.getState().entries);
  useEffect(() => {
    return useWorkspaceStore.subscribe((state) => {
      entriesRef.current = state.entries;
    });
  }, []);
  const handleFileSelectRef = useRef(onNavigateFile ?? (() => {}));
  handleFileSelectRef.current = onNavigateFile ?? (() => {});

  // Stable extensions (vim toggled via compartment, not via extensions prop)
  const extensions = useMemo(() => [
    vimCompartment.of([]),
    markdown({ base: markdownLanguage, codeLanguages: cmLanguages }),
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
      addToOptions: [slashIconOption],
    }),
    editorTheme,
    EditorView.lineWrapping,
  ], []);

  // Editor created callback
  const handleCreateEditor = useCallback((view: EditorView) => {
    viewRef.current = view;
    setEditorReady(true);
    if (vimEnabled) {
      view.dispatch({ effects: vimCompartment.reconfigure(vim()) });
    }
  }, [vimEnabled]);

  // Vim toggle (after initial creation)
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: vimCompartment.reconfigure(vimEnabled ? vim() : []),
    });
  }, [vimEnabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      viewRef.current = null;
      setEditorReady(false);
    };
  }, [filePath]);

  // Listen for external file reloads
  useEffect(() => {
    const unlisten = listen<{ path: string; markdown: string }>(
      "file-reloaded",
      (event) => {
        if (event.payload.path !== filePath) return;
        const view = viewRef.current;
        if (!view) return;

        const currentContent = view.state.doc.toString();
        if (currentContent === event.payload.markdown) return;

        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: event.payload.markdown,
          },
        });
      },
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [filePath]);

  return (
    <BlockContextProvider value={{ filePath }}>
      <Box position="relative" h="100%" overflow="hidden" css={containerCss}>
        <CodeMirror
          key={filePath}
          ref={cmRef}
          value={content}
          onChange={onChange}
          extensions={extensions}
          basicSetup={false}
          theme="none"
          height="100%"
          onCreateEditor={handleCreateEditor}
        />
        {editorReady && viewRef.current && (
          <WidgetPortals view={viewRef.current} filePath={filePath} />
        )}
      </Box>
    </BlockContextProvider>
  );
}
