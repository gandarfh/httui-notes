import { useEditor, EditorContent } from "@tiptap/react";
import { Box } from "@chakra-ui/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { common, createLowlight } from "lowlight";
import { useRef, useMemo, useCallback } from "react";
import { createSlashCommands } from "./slashCommands";
import { VimExtension, VimMode } from "./vim";
import { MermaidBlock } from "./extensions/MermaidBlock";
import { MathInline } from "./extensions/MathInline";
import { MathBlock } from "./extensions/MathBlock";
import { Wikilink } from "./extensions/Wikilink";
import { EditorDragDrop } from "./extensions/EditorDragDrop";
import { TableToolbar } from "./extensions/TableToolbar";
import { registry } from "@/components/blocks/registry";
import { BlockContextProvider } from "@/components/blocks/BlockContext";
import "@/components/blocks/http";
import "@/components/blocks/db";
import "@/components/blocks/e2e";
import "./editor.css";
import { createWikilinkSuggest } from "./extensions/WikilinkSuggest";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import type { FileEntry } from "@/lib/tauri/commands";

const lowlight = createLowlight(common);

const editorCss = {
  "& .tiptap": { outline: "none", minHeight: "100%", padding: "24px 32px" },
  "& .tiptap p.is-editor-empty:first-of-type::before": {
    content: "attr(data-placeholder)", float: "left",
    color: "var(--chakra-colors-fg-muted)", pointerEvents: "none", height: 0,
  },
  "& .tiptap h1": { fontSize: "2em", fontWeight: "bold", mt: 6, mb: 3 },
  "& .tiptap h2": { fontSize: "1.5em", fontWeight: "bold", mt: 5, mb: 2 },
  "& .tiptap h3": { fontSize: "1.25em", fontWeight: "bold", mt: 4, mb: 2 },
  "& .tiptap p": { mb: 2 },
  "& .tiptap ul, & .tiptap ol": { pl: 6, mb: 2 },
  "& .tiptap li": { mb: 1 },
  "& .tiptap blockquote": {
    borderLeft: "3px solid", borderColor: "var(--chakra-colors-border)",
    pl: 4, ml: 0, fontStyle: "italic", color: "var(--chakra-colors-fg-subtle)",
  },
  "& .tiptap pre": {
    bg: "var(--chakra-colors-bg-subtle)", rounded: "md", p: 4, mb: 2,
    overflow: "auto", fontFamily: "mono", fontSize: "0.875em",
  },
  "& .tiptap code": {
    bg: "var(--chakra-colors-bg-subtle)", rounded: "sm", px: 1, py: "1px",
    fontFamily: "mono", fontSize: "0.875em",
  },
  "& .tiptap pre code": { bg: "transparent", p: 0 },
  "& .tiptap pre code .hljs-keyword, & .tiptap pre code .hljs-selector-tag, & .tiptap pre code .hljs-built_in": { color: "var(--chakra-colors-purple-500)" },
  "& .tiptap pre code .hljs-string, & .tiptap pre code .hljs-attr": { color: "var(--chakra-colors-green-500)" },
  "& .tiptap pre code .hljs-comment, & .tiptap pre code .hljs-quote": { color: "var(--chakra-colors-fg-muted)", fontStyle: "italic" },
  "& .tiptap pre code .hljs-number, & .tiptap pre code .hljs-literal": { color: "var(--chakra-colors-orange-500)" },
  "& .tiptap pre code .hljs-title, & .tiptap pre code .hljs-section": { color: "var(--chakra-colors-blue-500)" },
  "& .tiptap pre code .hljs-type, & .tiptap pre code .hljs-name": { color: "var(--chakra-colors-teal-500)" },
  "& .tiptap pre code .hljs-variable, & .tiptap pre code .hljs-template-variable": { color: "var(--chakra-colors-red-500)" },
  "& .tiptap pre code .hljs-meta": { color: "var(--chakra-colors-fg-subtle)" },
  "& .tiptap hr": { border: "none", borderTop: "1px solid var(--chakra-colors-border)", my: 4 },
  "& .tiptap a": { color: "var(--chakra-colors-blue-500)", textDecoration: "underline" },
  "& .tiptap strong": { fontWeight: "bold" },
  "& .tiptap em": { fontStyle: "italic" },
  "& .tiptap ul[data-type='taskList']": { listStyle: "none", pl: 0 },
  "& .tiptap ul[data-type='taskList'] li": { display: "flex", alignItems: "flex-start", gap: "8px" },
  "& .tiptap img": { maxWidth: "100%", rounded: "md" },
  "& .tiptap table": { borderCollapse: "collapse", tableLayout: "auto", width: "100%", my: 3 },
  "& .tiptap th, & .tiptap td": { border: "1px solid var(--chakra-colors-border)", px: 3, py: 2, textAlign: "left", minWidth: "80px" },
  "& .tiptap th": { fontWeight: "bold", bg: "var(--chakra-colors-bg-subtle)" },
  "& .tiptap .selectedCell": { bg: "var(--chakra-colors-blue-500/10)" },
} as const;

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

interface EditorProps {
  content: string;
  onChange: (content: string) => void;
  filePath: string;
  vimEnabled?: boolean;
  onVimModeChange?: (mode: VimMode) => void;
}

export function Editor({
  content,
  onChange,
  filePath,
  vimEnabled = false,
  onVimModeChange,
}: EditorProps) {
  const isExternalUpdate = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const { entries } = useWorkspace();
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const extensions = useMemo(() => {
    const exts = [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        link: { openOnClick: false, autolink: true },
        codeBlock: false,
      }),
      CodeBlockLowlight.configure({ lowlight }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder: "Type / for commands...",
      }),
      // Typography removed — input rules on every keystroke cause lag
      TaskList,
      TaskItem.configure({ nested: true }),
      Image,
      MermaidBlock,
      MathInline,
      MathBlock,
      ...registry.getExtensions(),
      Wikilink,
      createWikilinkSuggest({
        getFiles: () => flattenFiles(entriesRef.current),
      }),
      createSlashCommands(),
    ];

    if (vimEnabled) {
      exts.push(
        VimExtension.configure({
          onModeChange: onVimModeChange,
        }),
      );
    }

    return exts;
  }, [vimEnabled, onVimModeChange]);

  const editor = useEditor(
    {
      extensions,
      content,
      shouldRerenderOnTransaction: false,
      onUpdate: ({ editor: ed }) => {
        if (!isExternalUpdate.current) {
          onChangeRef.current(ed.getHTML());
        }
      },
    },
    [vimEnabled],
  );

  // Only set content when switching files (filePath changes)
  const prevFilePathRef = useRef(filePath);

  if (editor && filePath !== prevFilePathRef.current) {
    prevFilePathRef.current = filePath;
    isExternalUpdate.current = true;
    editor.commands.setContent(content);
    isExternalUpdate.current = false;
    if (vimEnabled) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vimStorage = (editor.storage as any)?.vimMode as { mode?: string } | undefined;
      editor.view.dom.style.caretColor =
        vimStorage?.mode === "insert" ? "" : "transparent";
    }
  }

  if (!editor) return null;

  return (
    <BlockContextProvider value={{ filePath }}>
    <Box h="100%" overflow="hidden" display="flex" flexDirection="column">
      <TableToolbar editor={editor} />
      <Box flex={1} overflowY="auto" bg="bg" css={editorCss}>
        <EditorDragDrop editor={editor}>
          <EditorContent editor={editor} />
        </EditorDragDrop>
      </Box>
    </Box>
    </BlockContextProvider>
  );
}
