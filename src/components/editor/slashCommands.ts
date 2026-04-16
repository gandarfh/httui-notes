import { Extension } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import type { Editor, Range } from "@tiptap/core";
import { SlashMenu } from "./SlashMenu";
import type { SlashMenuItem } from "./SlashMenu";

const COMMANDS: SlashMenuItem[] = [
  {
    title: "Texto",
    icon: "T",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setParagraph().run();
    },
  },
  {
    title: "Titulo 1",
    icon: "H1",
    shortcut: "#",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
    },
  },
  {
    title: "Titulo 2",
    icon: "H2",
    shortcut: "##",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
    },
  },
  {
    title: "Titulo 3",
    icon: "H3",
    shortcut: "###",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
    },
  },
  {
    title: "Lista com marcadores",
    icon: ":=",
    shortcut: "-",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: "Lista numerada",
    icon: "1=",
    shortcut: "1.",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: "Lista de tarefas",
    icon: "v=",
    shortcut: "[]",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    title: "Citacao",
    icon: "\"",
    shortcut: ">",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    title: "Codigo",
    icon: "<>",
    shortcut: "```",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    title: "Separador",
    icon: "--",
    shortcut: "---",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    title: "Formula inline",
    icon: "∑",
    shortcut: "$",
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: "mathInline",
          attrs: { content: "x^2" },
        })
        .run();
    },
  },
  {
    title: "Formula em bloco",
    icon: "∫",
    shortcut: "$$",
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: "mathBlock",
          attrs: { content: "E = mc^2" },
        })
        .run();
    },
  },
  {
    title: "Diagrama Mermaid",
    icon: "◇",
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: "mermaidBlock",
          attrs: { content: "graph TD\n  A --> B" },
        })
        .run();
    },
  },
  {
    title: "Tabela",
    icon: "T#",
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
    },
  },
  {
    title: "Database Query",
    icon: "⊕",
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: "dbBlock",
          attrs: {
            blockType: "db",
            content: JSON.stringify({
              connectionId: "",
              query: "",
            }),
          },
        })
        .run();
    },
  },
  {
    title: "HTTP Request",
    icon: "⚡",
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: "httpBlock",
          attrs: {
            blockType: "http",
            content: JSON.stringify({
              method: "GET",
              url: "",
              params: [],
              headers: [],
              body: "",
            }),
          },
        })
        .run();
    },
  },
  {
    title: "E2E Test",
    icon: "🧪",
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: "e2eBlock",
          attrs: {
            blockType: "e2e",
            content: JSON.stringify({
              baseUrl: "",
              headers: [],
              steps: [],
            }),
          },
        })
        .run();
    },
  },
];

export function createSlashCommands() {
  return Extension.create({
    name: "slashCommands",

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          char: "/",
          command: ({
            editor,
            range,
            props,
          }: {
            editor: Editor;
            range: Range;
            props: SlashMenuItem;
          }) => {
            props.command({ editor, range });
          },
          items: ({ query }: { query: string }) => {
            return COMMANDS.filter((item) =>
              item.title.toLowerCase().includes(query.toLowerCase()),
            );
          },
          render: () => {
            let component: ReactRenderer | null = null;
            let wrapper: HTMLDivElement | null = null;

            const MENU_HEIGHT = 400;
            const GAP = 4;

            function positionWrapper(
              rect: DOMRect,
              el: HTMLDivElement,
            ) {
              const spaceBelow =
                window.innerHeight - rect.bottom;
              const fitsBelow = spaceBelow >= MENU_HEIGHT + GAP;

              el.style.left = `${rect.left}px`;
              if (fitsBelow) {
                el.style.top = `${rect.bottom + GAP}px`;
                el.style.bottom = "";
              } else {
                el.style.top = "";
                el.style.bottom = `${window.innerHeight - rect.top + GAP}px`;
              }
            }

            return {
              onStart: (props) => {
                component = new ReactRenderer(SlashMenu, {
                  props,
                  editor: props.editor,
                });

                if (!props.clientRect) return;

                wrapper = document.createElement("div");
                wrapper.style.position = "fixed";
                wrapper.style.zIndex = "9999";
                wrapper.appendChild(component.element);
                document.body.appendChild(wrapper);

                const rect = (props.clientRect as () => DOMRect)();
                positionWrapper(rect, wrapper);
              },

              onUpdate: (props) => {
                component?.updateProps(props);

                if (!props.clientRect || !wrapper) return;

                const rect = (props.clientRect as () => DOMRect)();
                positionWrapper(rect, wrapper);
              },

              onKeyDown: (props) => {
                if (props.event.key === "Escape") {
                  wrapper?.remove();
                  wrapper = null;
                  return true;
                }

                const ref = component?.ref as {
                  onKeyDown: (props: {
                    event: KeyboardEvent;
                  }) => boolean;
                } | null;

                return ref?.onKeyDown(props) ?? false;
              },

              onExit: () => {
                wrapper?.remove();
                wrapper = null;
                component?.destroy();
              },
            };
          },
        }),
      ];
    },
  });
}
