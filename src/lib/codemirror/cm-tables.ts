import { RangeSetBuilder, StateField, type Extension, type EditorState } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";

// ── Table detection ──────────────────────────────────────────────────────────

interface TableRange {
  from: number;
  to: number;
  rows: string[][];  // parsed cell values
  hasHeader: boolean;
}

const PIPE_ROW_RE = /^\|(.+)\|$/;
const SEPARATOR_RE = /^\|[\s:]*-{2,}[\s:]*(\|[\s:]*-{2,}[\s:]*)*\|$/;

function parseRow(line: string): string[] | null {
  const match = line.trim().match(PIPE_ROW_RE);
  if (!match) return null;
  return match[1].split("|").map((cell) => cell.trim());
}

function findTables(doc: { lines: number; line(n: number): { from: number; to: number; text: string } }): TableRange[] {
  const tables: TableRange[] = [];
  let i = 1;

  while (i <= doc.lines) {
    const line = doc.line(i);
    const headerCells = parseRow(line.text);

    if (headerCells && i + 1 <= doc.lines) {
      const sepLine = doc.line(i + 1);
      if (SEPARATOR_RE.test(sepLine.text.trim())) {
        // Found a table header + separator
        const rows: string[][] = [headerCells];
        const tableFrom = line.from;
        let tableTo = sepLine.to;
        let j = i + 2;

        // Consume body rows
        while (j <= doc.lines) {
          const bodyLine = doc.line(j);
          const bodyCells = parseRow(bodyLine.text);
          if (!bodyCells) break;
          rows.push(bodyCells);
          tableTo = bodyLine.to;
          j++;
        }

        tables.push({
          from: tableFrom,
          to: tableTo,
          rows,
          hasHeader: true,
        });

        i = j;
        continue;
      }
    }
    i++;
  }

  return tables;
}

// ── Table widget ─────────────────────────────────────────────────────────────

class TableWidget extends WidgetType {
  constructor(readonly rows: string[][], readonly hasHeader: boolean) {
    super();
  }

  toDOM(): HTMLElement {
    const table = document.createElement("table");
    table.className = "cm-table-widget";

    if (this.hasHeader && this.rows.length > 0) {
      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");
      for (const cell of this.rows[0]) {
        const th = document.createElement("th");
        th.textContent = cell;
        headerRow.appendChild(th);
      }
      thead.appendChild(headerRow);
      table.appendChild(thead);

      if (this.rows.length > 1) {
        const tbody = document.createElement("tbody");
        for (let i = 1; i < this.rows.length; i++) {
          const tr = document.createElement("tr");
          for (const cell of this.rows[i]) {
            const td = document.createElement("td");
            td.textContent = cell;
            tr.appendChild(td);
          }
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
      }
    }

    return table;
  }

  eq(other: TableWidget): boolean {
    if (this.rows.length !== other.rows.length) return false;
    for (let i = 0; i < this.rows.length; i++) {
      if (this.rows[i].length !== other.rows[i].length) return false;
      for (let j = 0; j < this.rows[i].length; j++) {
        if (this.rows[i][j] !== other.rows[i][j]) return false;
      }
    }
    return true;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

// ── Decoration plugin ────────────────────────────────────────────────────────

function buildTableDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  // Get cursor line numbers
  const cursorLines = new Set<number>();
  for (const range of state.selection.ranges) {
    const startLine = state.doc.lineAt(range.from).number;
    const endLine = state.doc.lineAt(range.to).number;
    for (let i = startLine; i <= endLine; i++) {
      cursorLines.add(i);
    }
  }

  const tables = findTables(state.doc);

  for (const table of tables) {
    // Check if cursor is inside this table
    const tableStartLine = state.doc.lineAt(table.from).number;
    const tableEndLine = state.doc.lineAt(table.to).number;
    let cursorInTable = false;
    for (let line = tableStartLine; line <= tableEndLine; line++) {
      if (cursorLines.has(line)) {
        cursorInTable = true;
        break;
      }
    }

    if (cursorInTable) continue; // Show raw pipes

    builder.add(
      table.from,
      table.to,
      Decoration.replace({
        widget: new TableWidget(table.rows, table.hasHeader),
        block: true,
      }),
    );
  }

  return builder.finish();
}

let lastTableCursorLine = -1;

const tableField = StateField.define<DecorationSet>({
  create(state) {
    lastTableCursorLine = state.doc.lineAt(state.selection.main.head).number;
    return buildTableDecorations(state);
  },
  update(decos, tr) {
    const currentLine = tr.state.doc.lineAt(tr.state.selection.main.head).number;
    const cursorLineMoved = currentLine !== lastTableCursorLine;

    if (cursorLineMoved) {
      lastTableCursorLine = currentLine;
      return buildTableDecorations(tr.state);
    }
    if (tr.docChanged) {
      return decos.map(tr.changes);
    }
    return decos;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// ── Theme ────────────────────────────────────────────────────────────────────

const tableTheme = EditorView.theme({
  ".cm-table-widget": {
    borderCollapse: "collapse",
    width: "100%",
    margin: "8px 0",
    fontSize: "13px",
    fontFamily: "var(--chakra-fonts-body)",
  },
  ".cm-table-widget th, .cm-table-widget td": {
    border: "1px solid var(--chakra-colors-border)",
    padding: "6px 12px",
    textAlign: "left",
  },
  ".cm-table-widget th": {
    fontWeight: "600",
    backgroundColor: "var(--chakra-colors-bg-subtle)",
  },
  ".cm-table-widget tr:hover td": {
    backgroundColor: "var(--chakra-colors-bg-subtle)",
  },
});

// ── Export ────────────────────────────────────────────────────────────────────

/** GFM table extension — renders pipe tables as HTML widgets, raw when cursor is inside */
export function tables(): Extension {
  return [tableField, tableTheme];
}
