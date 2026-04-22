import {
  type CompletionContext,
  type CompletionResult,
  type Completion,
} from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

interface SlashCommand {
  label: string;
  icon: string;
  shortcut?: string;
  insert: string;
  /** Cursor offset from end of insertion (negative = move back) */
  cursorOffset?: number;
}

const COMMANDS: SlashCommand[] = [
  {
    label: "Titulo 1",
    icon: "H1",
    shortcut: "#",
    insert: "# ",
  },
  {
    label: "Titulo 2",
    icon: "H2",
    shortcut: "##",
    insert: "## ",
  },
  {
    label: "Titulo 3",
    icon: "H3",
    shortcut: "###",
    insert: "### ",
  },
  {
    label: "Lista com marcadores",
    icon: ":=",
    shortcut: "-",
    insert: "- ",
  },
  {
    label: "Lista numerada",
    icon: "1=",
    shortcut: "1.",
    insert: "1. ",
  },
  {
    label: "Lista de tarefas",
    icon: "v=",
    shortcut: "[]",
    insert: "- [ ] ",
  },
  {
    label: "Citacao",
    icon: "\"",
    shortcut: ">",
    insert: "> ",
  },
  {
    label: "Codigo",
    icon: "<>",
    shortcut: "```",
    insert: "```\n\n```",
    cursorOffset: -4,
  },
  {
    label: "Separador",
    icon: "--",
    shortcut: "---",
    insert: "---\n",
  },
  {
    label: "Formula inline",
    icon: "∑",
    shortcut: "$",
    insert: "$x^2$",
    cursorOffset: -1,
  },
  {
    label: "Formula em bloco",
    icon: "∫",
    shortcut: "$$",
    insert: "$$\nE = mc^2\n$$",
    cursorOffset: -3,
  },
  {
    label: "Diagrama Mermaid",
    icon: "◇",
    insert: "```mermaid\ngraph TD\n  A --> B\n```\n",
  },
  {
    label: "Tabela",
    icon: "T#",
    insert: "| Col 1 | Col 2 | Col 3 |\n| --- | --- | --- |\n|  |  |  |\n",
  },
  {
    label: "Database Query",
    icon: "⊕",
    insert: '```db alias=db1\n{"connectionId":"","query":""}\n```\n',
  },
  {
    label: "HTTP Request",
    icon: "⚡",
    insert: '```http alias=req1\n{"method":"GET","url":"","params":[],"headers":[],"body":""}\n```\n',
  },
  {
    label: "E2E Test",
    icon: "🧪",
    insert: '```e2e alias=e2e1\n{"baseUrl":"","headers":[],"steps":[]}\n```\n',
  },
];

function slashCompletionSource(context: CompletionContext): CompletionResult | null {
  // Match "/" at the beginning of a line, optionally followed by text
  const line = context.state.doc.lineAt(context.pos);
  const lineTextBefore = context.state.doc.sliceString(line.from, context.pos);

  // Only activate if the line starts with "/" (possibly with leading whitespace)
  const match = lineTextBefore.match(/^(\s*)\/([\w\s]*)$/);
  if (!match) return null;

  const prefix = match[1]; // whitespace before /
  const query = match[2].toLowerCase(); // text after /
  const from = line.from + prefix.length; // start of the /

  const filtered = COMMANDS.filter((cmd) =>
    cmd.label.toLowerCase().includes(query),
  );

  if (filtered.length === 0) return null;

  const options: Completion[] = filtered.map((cmd) => ({
    label: `/${cmd.label}`,
    displayLabel: cmd.label,
    detail: cmd.shortcut,
    apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
      const insert = cmd.insert;
      view.dispatch({
        changes: { from, to, insert },
        selection: {
          anchor: from + insert.length + (cmd.cursorOffset ?? 0),
        },
      });
    },
  }));

  return {
    from,
    options,
    filter: false, // We already filtered
  };
}

// Theme for the autocomplete menu
const slashMenuTheme = EditorView.theme({
  ".cm-tooltip-autocomplete": {
    backgroundColor: "var(--chakra-colors-bg-panel, #1a1a2e)",
    border: "1px solid var(--chakra-colors-border, #333)",
    borderRadius: "10px",
    boxShadow: "0 12px 40px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2)",
    padding: "6px",
    minWidth: "300px",
    maxHeight: "400px",
    overflowY: "auto",
    backdropFilter: "blur(12px)",
  },
  ".cm-tooltip-autocomplete ul": {
    fontFamily: "var(--chakra-fonts-body, system-ui, sans-serif)",
    listStyle: "none",
    margin: "0",
    padding: "0",
  },
  ".cm-tooltip-autocomplete ul li": {
    padding: "8px 12px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "background-color 0.1s",
    margin: "1px 0",
    border: "2px solid transparent",
  },
  ".cm-tooltip-autocomplete ul li:hover": {
    backgroundColor: "var(--chakra-colors-bg-subtle, #262640)",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "var(--chakra-colors-bg-subtle, #262640)",
    borderColor: "var(--chakra-colors-brand-400, #6366f1)",
  },
  ".cm-tooltip-autocomplete .cm-completionIcon": {
    display: "none",
  },
  ".cm-tooltip-autocomplete .cm-completionLabel": {
    fontSize: "13px",
    fontWeight: "500",
    color: "var(--chakra-colors-fg, #e0e0e0)",
    flex: "1",
  },
  ".cm-tooltip-autocomplete .cm-completionDetail": {
    fontSize: "11px",
    fontFamily: "var(--chakra-fonts-mono, monospace)",
    color: "var(--chakra-colors-fg-subtle, #888)",
    fontStyle: "normal",
    opacity: "0.7",
    padding: "2px 6px",
    backgroundColor: "var(--chakra-colors-bg-emphasized, #333)",
    borderRadius: "4px",
  },
  ".cm-tooltip-autocomplete .cm-completionMatchedText": {
    textDecoration: "none",
    fontWeight: "700",
    color: "var(--chakra-colors-brand-400, #6366f1)",
  },
  // Scrollbar styling
  ".cm-tooltip-autocomplete::-webkit-scrollbar": {
    width: "6px",
  },
  ".cm-tooltip-autocomplete::-webkit-scrollbar-track": {
    backgroundColor: "transparent",
  },
  ".cm-tooltip-autocomplete::-webkit-scrollbar-thumb": {
    backgroundColor: "var(--chakra-colors-border, #444)",
    borderRadius: "3px",
  },
});

/** Export the completion source for combining with other sources */
export { slashCompletionSource };

/** Slash commands extension for CM6 — activates on "/" at line start */
export function slashCommands(): Extension {
  return [
    slashMenuTheme,
  ];
}
