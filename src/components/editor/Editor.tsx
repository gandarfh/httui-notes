import { useEditor, EditorContent } from "@tiptap/react";
import { Box } from "@chakra-ui/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import { useEffect, useRef } from "react";
import { createSlashCommands } from "./slashCommands";

interface EditorProps {
  content: string;
  onChange: (content: string) => void;
  filePath: string;
}

export function Editor({ content, onChange, filePath }: EditorProps) {
  const isExternalUpdate = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        link: { openOnClick: false, autolink: true },
      }),
      Placeholder.configure({
        placeholder: "Type / for commands...",
      }),
      Typography,
      TaskList,
      TaskItem.configure({ nested: true }),
      Image,
      createSlashCommands(),
    ],
    content,
    onUpdate: ({ editor }) => {
      if (!isExternalUpdate.current) {
        onChange(editor.getHTML());
      }
    },
  });

  // Update content when file changes (external load)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      isExternalUpdate.current = true;
      editor.commands.setContent(content);
      isExternalUpdate.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, editor]);

  if (!editor) return null;

  return (
    <Box h="100%" overflow="hidden" display="flex" flexDirection="column">
      <Box
        flex={1}
        overflowY="auto"
        bg="bg"
        css={{
          "& .tiptap": {
            outline: "none",
            minHeight: "100%",
            padding: "24px 32px",
          },
          "& .tiptap p.is-editor-empty:first-of-type::before": {
            content: "attr(data-placeholder)",
            float: "left",
            color: "var(--chakra-colors-fg-muted)",
            pointerEvents: "none",
            height: 0,
          },
          "& .tiptap h1": { fontSize: "2em", fontWeight: "bold", mt: 6, mb: 3 },
          "& .tiptap h2": { fontSize: "1.5em", fontWeight: "bold", mt: 5, mb: 2 },
          "& .tiptap h3": { fontSize: "1.25em", fontWeight: "bold", mt: 4, mb: 2 },
          "& .tiptap p": { mb: 2 },
          "& .tiptap ul, & .tiptap ol": { pl: 6, mb: 2 },
          "& .tiptap li": { mb: 1 },
          "& .tiptap blockquote": {
            borderLeft: "3px solid",
            borderColor: "var(--chakra-colors-border)",
            pl: 4,
            ml: 0,
            fontStyle: "italic",
            color: "var(--chakra-colors-fg-subtle)",
          },
          "& .tiptap pre": {
            bg: "var(--chakra-colors-bg-subtle)",
            rounded: "md",
            p: 4,
            mb: 2,
            overflow: "auto",
            fontFamily: "mono",
            fontSize: "0.875em",
          },
          "& .tiptap code": {
            bg: "var(--chakra-colors-bg-subtle)",
            rounded: "sm",
            px: 1,
            py: "1px",
            fontFamily: "mono",
            fontSize: "0.875em",
          },
          "& .tiptap pre code": {
            bg: "transparent",
            p: 0,
          },
          "& .tiptap hr": {
            border: "none",
            borderTop: "1px solid var(--chakra-colors-border)",
            my: 4,
          },
          "& .tiptap a": {
            color: "var(--chakra-colors-blue-500)",
            textDecoration: "underline",
          },
          "& .tiptap strong": { fontWeight: "bold" },
          "& .tiptap em": { fontStyle: "italic" },
          "& .tiptap ul[data-type='taskList']": { listStyle: "none", pl: 0 },
          "& .tiptap ul[data-type='taskList'] li": {
            display: "flex",
            alignItems: "flex-start",
            gap: "8px",
          },
          "& .tiptap img": { maxWidth: "100%", rounded: "md" },
        }}
      >
        <EditorContent editor={editor} />
      </Box>
    </Box>
  );
}
