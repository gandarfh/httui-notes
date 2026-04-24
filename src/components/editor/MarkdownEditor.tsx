import { useRef, useEffect, useMemo, useCallback, useState } from "react";
import { Box } from "@chakra-ui/react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { EditorView, keymap } from "@codemirror/view";
import { Compartment, EditorSelection, Prec } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages as cmLanguages } from "@codemirror/language-data";
import { LanguageDescription } from "@codemirror/language";

// Register db / db-postgres / db-mysql / db-sqlite as SQL so markdown's
// nested-code syntax highlighter colorizes the body of db fenced blocks.
const dbSqlLanguages: LanguageDescription[] = [
  "db",
  "db-postgres",
  "db-mysql",
  "db-sqlite",
].map((alias) =>
  LanguageDescription.of({
    name: alias,
    alias: [alias],
    async load() {
      const { sql } = await import("@codemirror/lang-sql");
      return sql();
    },
  }),
);
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, HighlightStyle, bracketMatching } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, startCompletion } from "@codemirror/autocomplete";
import { search, highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { vim } from "@replit/codemirror-vim";
import { hybridRendering } from "@/lib/codemirror/cm-hybrid-rendering";
import { slashCommands, slashCompletionSource, slashIconOption } from "@/lib/codemirror/cm-slash-commands";
import { createEditorBlockWidgets } from "@/lib/codemirror/cm-block-widgets";
import {
  createDbBlockExtension,
  createDbBlockCompletionSource,
  createDbSchemaCompletionSource,
} from "@/lib/codemirror/cm-db-block";
import { wikilinks, createWikilinkCompletion } from "@/lib/codemirror/cm-wikilinks";
import { tables } from "@/lib/codemirror/cm-tables";
import { moveBlocksKeymap } from "@/lib/codemirror/cm-move-blocks";
import { BlockContextProvider } from "@/components/blocks/BlockContext";
import { WidgetPortals } from "./WidgetPortals";
import { DbWidgetPortals } from "./DbWidgetPortals";
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
// Separate compartment for the doc-line arrow-up/down keymap. We turn it
// off while vim mode is active — vim owns cursor motion (h/j/k/l, arrow
// keys, visual mode) and our keymap would shadow those bindings.
const docLineNavCompartment = new Compartment();

// The actual arrow-up / arrow-down doc-line handlers. Defined outside the
// component so both compartments share the same instance.
const docLineNavKeymap = Prec.high(
  keymap.of([
    {
      key: "ArrowUp",
      run: (view) => {
        const sel = view.state.selection.main;
        if (!sel.empty) return false;
        const doc = view.state.doc;
        const line = doc.lineAt(sel.head);
        if (line.number === 1) return false;
        const prev = doc.line(line.number - 1);
        const col = sel.head - line.from;
        const target = Math.min(prev.from + col, prev.to);
        view.dispatch({
          selection: EditorSelection.cursor(target),
          scrollIntoView: true,
        });
        return true;
      },
    },
    {
      key: "ArrowDown",
      run: (view) => {
        const sel = view.state.selection.main;
        if (!sel.empty) return false;
        const doc = view.state.doc;
        const line = doc.lineAt(sel.head);
        if (line.number === doc.lines) return false;
        const next = doc.line(line.number + 1);
        const col = sel.head - line.from;
        const target = Math.min(next.from + col, next.to);
        view.dispatch({
          selection: EditorSelection.cursor(target),
          scrollIntoView: true,
        });
        return true;
      },
    },
  ]),
);

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

  // ── Autocomplete popup (shared by db blocks + slash + wikilinks) ──
  ".cm-tooltip.cm-tooltip-autocomplete": {
    border: "1px solid var(--chakra-colors-border)",
    backgroundColor: "var(--chakra-colors-bg)",
    borderRadius: "6px",
    boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
    fontFamily: "var(--chakra-fonts-mono)",
    fontSize: "12px",
    overflow: "hidden",
    marginTop: "2px",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": {
    maxHeight: "260px",
    maxWidth: "360px",
    minWidth: "200px",
    fontFamily: "inherit",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
    padding: "3px 10px",
    lineHeight: "1.4",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    color: "var(--chakra-colors-fg)",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--chakra-colors-bg-subtle)",
    color: "var(--chakra-colors-fg)",
  },
  ".cm-completionLabel": {
    flex: "1",
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  ".cm-completionMatchedText": {
    color: "var(--chakra-colors-brand-400)",
    textDecoration: "none",
    fontWeight: "600",
  },
  ".cm-completionDetail": {
    color: "var(--chakra-colors-fg-muted)",
    fontStyle: "normal",
    fontSize: "11px",
    marginLeft: "8px",
    flexShrink: 0,
  },
  // Subtle color code per completion `type` — only visible on the selected
  // row via the leading strip so the list doesn't look like a Christmas tree.
  ".cm-completionIcon": { display: "none" },
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

  // ── db block SQL error squiggle (stage 8b) ──
  // Red wavy underline under the token the driver reported as bad; the
  // `title` attribute carries the error message for hover tooltips.
  ".cm-db-sql-error": {
    textDecoration: "underline wavy var(--chakra-colors-red-400)",
    textDecorationThickness: "1px",
    textUnderlineOffset: "2px",
    backgroundColor: "var(--chakra-colors-red-500/10)",
    borderRadius: "2px",
  },

  // ── db block (stage 5 — unified slab card) ──
  //
  // The 3 widget slots (toolbar / result / statusbar) plus the body lines
  // are rendered as separate CM6 decorations but CSS stitches them into
  // one continuous card: outer rounded border, interior dividers, no
  // gaps between slots.
  //
  // Tones (top → bottom):
  //   header     blackAlpha.200    — toolbar bar, tint to stand out
  //   body       bg.canvas         — SQL, the "paper" where you write
  //   result     bg.panel / bg     — output, slightly different bg
  //   statusbar  blackAlpha.100    — footer, subtle
  //
  // Reading mode: fence lines are replaced by widgets.
  // Editing mode: fence lines show up as subtle text; toolbar inline is
  // hidden (spec §5.2), body keeps borders.

  // All spacing uses --chakra-space-* tokens (1 = 4px, 1.5 = 6px,
  // 2 = 8px, 3 = 12px, 4 = 16px); borders use --chakra-radii-md (8px).
  // ── Card chrome ──
  // The DB block is a composite widget stitched from 4 CM6 line/widget
  // decorations (fence-open, body, fence-close, toolbar/result/statusbar
  // portals). Each needs its own border spec to form a continuous card.
  //
  // Padding scale follows the mockup: toolbar header ~20/24px, SQL body
  // ~12/24px, statusbar ~14/24px. The horizontal padding is generous on
  // every slice so content never touches the card edge.
  // Chakra v3 emits token CSS vars using the category name ("spacing",
  // "radii", "fontSizes" → `--chakra-spacing-*`, `--chakra-radii-*`,
  // `--chakra-font-sizes-*`). See node_modules/@chakra-ui/react/dist/esm/
  // styled-system/token-dictionary.js and theme/tokens/*.js.
  ".cm-db-fence-line": {
    color: "var(--chakra-colors-fg-muted)",
    fontFamily: "var(--chakra-fonts-mono)",
    fontSize: "var(--chakra-font-sizes-xs)",
    opacity: 0.3,
    position: "relative",
    borderLeft: "1px solid color-mix(in srgb, var(--chakra-colors-border) 55%, transparent)",
    borderRight: "1px solid color-mix(in srgb, var(--chakra-colors-border) 55%, transparent)",
    background: "var(--chakra-colors-bg-subtle)",
    paddingLeft: "var(--chakra-spacing-4)",
    paddingRight: "var(--chakra-spacing-4)",
  },
  ".cm-db-fence-line-open": {
    borderTop: "1px solid color-mix(in srgb, var(--chakra-colors-border) 55%, transparent)",
    borderTopLeftRadius: "var(--chakra-radii-md)",
    borderTopRightRadius: "var(--chakra-radii-md)",
    paddingTop: "var(--chakra-spacing-2)",
  },
  ".cm-db-fence-line-close": {
    paddingBottom: "var(--chakra-spacing-2)",
    borderBottom: "1px solid color-mix(in srgb, var(--chakra-colors-border) 55%, transparent)",
  },

  // Body lines hold the SQL text. Each gets a left gutter (`::before`)
  // showing the in-block line number via CSS counters — reset on the first
  // body line of each block, incremented on every body line. Pure CSS, no
  // JS widget bookkeeping per line.
  // Body layout:
  //   [ 8px card-internal pad ][ 20px number (right-aligned) ][ 16px gap ][ SQL text ]
  //    = paddingLeft of 44px total, with ::before occupying 8-28px.
  ".cm-db-body-line": {
    fontFamily: "var(--chakra-fonts-mono)",
    background: "var(--chakra-colors-bg-canvas, var(--chakra-colors-bg))",
    borderLeft: "1px solid color-mix(in srgb, var(--chakra-colors-border) 55%, transparent)",
    borderRight: "1px solid color-mix(in srgb, var(--chakra-colors-border) 55%, transparent)",
    paddingLeft: "44px",
    paddingRight: "var(--chakra-spacing-3)",
    paddingTop: 0,
    paddingBottom: 0,
    // 13px × 20px line-box = Monaco / VS Code rhythm. Shrinks the SQL
    // relative to prose text so the card reads as code.
    fontSize: "13px",
    lineHeight: "20px",
    position: "relative",
    counterIncrement: "db-line",
  },
  // Number matches the body text's font-size + line-height exactly so the
  // two share a baseline — different font-sizes produced off-by-a-few-px
  // drift. Hierarchy comes from colour + opacity, not size.
  ".cm-db-body-line::before": {
    content: "counter(db-line)",
    position: "absolute",
    left: "var(--chakra-spacing-2)",
    top: 0,
    width: "20px",
    textAlign: "right",
    color: "var(--chakra-colors-fg-muted)",
    opacity: 0.5,
    fontSize: "inherit",
    lineHeight: "inherit",
    fontFamily: "var(--chakra-fonts-mono)",
    fontVariantNumeric: "tabular-nums",
    userSelect: "none",
    pointerEvents: "none",
  },
  // `.cm-db-body-line-first` only seeds the CSS counter. NO padding
  // override: variable line heights confuse CM6's pixel-based
  // `cursorLineUp`, making arrow-up skip lines. The breathing room at
  // the top / bottom of the card is contributed by the toolbar /
  // fence widgets, which live outside `.cm-db-body-line`.
  ".cm-db-body-line-first": {
    counterReset: "db-line",
  },
  // Placeholder left in place of the close fence when reading.
  ".cm-db-fence-hidden": {
    height: 0,
    margin: 0,
    padding: 0,
  },
  // Wrapper that groups the closing widgets (hidden fence + result +
  // statusbar) into a SINGLE block widget.
  ".cm-db-close-panel": {
    display: "block",
  },

  // ── Toolbar widget (card header) ──
  // Tall, breathable header. Horizontal padding mirrors the body padding
  // so the `[DB]` badge aligns vertically with the SQL text below it.
  ".cm-db-toolbar-portal": {
    display: "block",
    background: "color-mix(in srgb, var(--chakra-colors-fg) 2.5%, var(--chakra-colors-bg-subtle))",
    borderLeft: "1px solid color-mix(in srgb, var(--chakra-colors-border) 55%, transparent)",
    borderRight: "1px solid color-mix(in srgb, var(--chakra-colors-border) 55%, transparent)",
    borderTop: "1px solid color-mix(in srgb, var(--chakra-colors-border) 55%, transparent)",
    borderTopLeftRadius: "var(--chakra-radii-md)",
    borderTopRightRadius: "var(--chakra-radii-md)",
    paddingTop: "var(--chakra-spacing-1)",
    paddingBottom: "var(--chakra-spacing-1)",
    paddingLeft: "var(--chakra-spacing-3)",
    paddingRight: "var(--chakra-spacing-3)",
    minHeight: "var(--chakra-spacing-8)",
    userSelect: "none",
    pointerEvents: "auto",
  },

  ".cm-db-result-portal": {
    overflowAnchor: "none",
    margin: 0,
    background: "var(--chakra-colors-bg)",
    borderLeft: "1px solid color-mix(in srgb, var(--chakra-colors-border) 55%, transparent)",
    borderRight: "1px solid color-mix(in srgb, var(--chakra-colors-border) 55%, transparent)",
    borderTop: "1px solid color-mix(in srgb, var(--chakra-colors-border) 55%, transparent)",
    minHeight: "var(--chakra-spacing-12)",
  },

  ".cm-db-statusbar-portal": {
    marginBottom: "var(--chakra-spacing-4)",
    paddingTop: "var(--chakra-spacing-3)",
    paddingBottom: "var(--chakra-spacing-3)",
    paddingLeft: "var(--chakra-spacing-4)",
    paddingRight: "var(--chakra-spacing-4)",
    background: "color-mix(in srgb, var(--chakra-colors-fg) 1.5%, transparent)",
    borderLeft: "1px solid color-mix(in srgb, var(--chakra-colors-border) 55%, transparent)",
    borderRight: "1px solid color-mix(in srgb, var(--chakra-colors-border) 55%, transparent)",
    borderBottom: "1px solid color-mix(in srgb, var(--chakra-colors-border) 55%, transparent)",
    borderTop: "1px solid color-mix(in srgb, var(--chakra-colors-border) 40%, transparent)",
    borderBottomLeftRadius: "var(--chakra-radii-md)",
    borderBottomRightRadius: "var(--chakra-radii-md)",
    minHeight: "var(--chakra-spacing-9)",
    fontFamily: "var(--chakra-fonts-mono)",
    fontSize: "var(--chakra-font-sizes-xs)",
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
    markdown({
      base: markdownLanguage,
      codeLanguages: [...dbSqlLanguages, ...cmLanguages],
    }),
    syntaxHighlighting(markdownHighlightStyle),
    bracketMatching(),
    closeBrackets(),
    search({ top: false }),
    highlightSelectionMatches(),
    history(),
    // Doc-line ArrowUp/Down keymap — always on, even with vim. It only
    // binds the arrow keys (not j/k), so vim's normal-mode motion still
    // flows through the vim plugin. The arrow bindings are needed in
    // both modes to stop CM6's pixel-based motion from teleporting the
    // caret when the document has tall block widgets.
    docLineNavCompartment.of(docLineNavKeymap),
    keymap.of([
      // Explicit Ctrl-Space for autocomplete — avoids relying on the Mac
      // default (Alt-`) so the popup fires on every platform.
      { key: "Ctrl-Space", run: startCompletion },
      ...completionKeymap,
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      indentWithTab,
    ]),
    moveBlocksKeymap(),
    hybridRendering(),
    createDbBlockExtension(),
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
        // DB block {{ref}} autocomplete — activates only when the cursor
        // sits inside a db-* fenced body.
        createDbBlockCompletionSource(() => filePath),
        // Schema-aware SQL autocomplete (tables / columns) — same gating;
        // reads from the shared SchemaCache store.
        createDbSchemaCompletionSource(),
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
      view.dispatch({
        effects: [
          vimCompartment.reconfigure(vim()),
          docLineNavCompartment.reconfigure([]),
        ],
      });
    }
    queueMicrotask(() => view.focus());
  }, [vimEnabled]);

  // Vim toggle (after initial creation). Keeps the doc-line nav compartment
  // in sync: vim owns motion when on; we resume control when it's off.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: [
        vimCompartment.reconfigure(vimEnabled ? vim() : []),
        docLineNavCompartment.reconfigure(vimEnabled ? [] : docLineNavKeymap),
      ],
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
          <>
            <WidgetPortals view={viewRef.current} filePath={filePath} />
            <DbWidgetPortals view={viewRef.current} filePath={filePath} />
          </>
        )}
      </Box>
    </BlockContextProvider>
  );
}
