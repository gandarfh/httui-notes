/**
 * CodeMirror extension for DB block rendering (stage 4 of db block redesign).
 *
 * Replaces the generic PortalWidget path used for http/e2e blocks with a
 * fenced-native rendering: the SQL body stays visible in the document as
 * plain text with SQL highlighting applied by the outer markdown extension;
 * the fence lines are marked atomic so the cursor can't land on them; a
 * toolbar stub appears inline at the top of the block, a result stub
 * appears as a block widget after the closing fence, and a status-bar
 * stub follows.
 *
 * UI is stubs-only in this stage. Stage 5 wires them up to the streamed
 * executor, drawer, and connection state.
 */

import {
  EditorState,
  RangeSetBuilder,
  StateField,
  type Extension,
  type Text as CMText,
  type Transaction,
  type TransactionSpec,
  EditorSelection,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";

import {
  parseDbFenceInfo,
  type DbBlockMetadata,
} from "@/lib/blocks/db-fence";

// ───── Types ─────

export interface DbFencedBlock {
  /** Absolute doc position of the very first char of the opening fence. */
  from: number;
  /** Absolute doc position just past the closing fence line's last char. */
  to: number;
  /** `db`, `db-postgres`, `db-mysql`, `db-sqlite`. */
  lang: string;
  /** Everything after the lang token on the open fence line. */
  info: string;
  /** Parsed info string — null only if lang was rejected, in which case the
   * block wouldn't be in the list at all. Always present here. */
  metadata: DbBlockMetadata;
  /** Line of the opening fence (```db-...). */
  openLineFrom: number;
  openLineTo: number;
  /** First line of the body (SQL content). Same as openLineTo + 1 unless
   * there is no body. When the body is empty `bodyFrom == bodyTo`. */
  bodyFrom: number;
  bodyTo: number;
  /** Line of the closing fence (```). */
  closeLineFrom: number;
  closeLineTo: number;
  /** Raw body text (between fences). */
  body: string;
}

// Any ```db` or ```db-<variant>` opening. Closing is plain ``` (any length ≥ 3).
const DB_OPEN_RE = /^```(db(?:-[\w:-]+)?)(.*)$/;
const FENCE_CLOSE_RE = /^```+\s*$/;

// ───── Block scanner ─────

/**
 * Scan a CodeMirror document for db-* fenced blocks. Unclosed blocks are
 * ignored (we require an explicit closing fence).
 *
 * Does not validate info-string contents — `metadata` is whatever
 * parseDbFenceInfo returned. Rejection here is only on the lang token.
 */
export function findDbBlocks(doc: CMText): DbFencedBlock[] {
  const blocks: DbFencedBlock[] = [];

  let inBlock = false;
  let openFrom = 0;
  let openTo = 0;
  let lang = "";
  let info = "";
  let bodyStart = 0;
  const bodyLines: string[] = [];

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;

    if (!inBlock) {
      const match = text.match(DB_OPEN_RE);
      if (match) {
        inBlock = true;
        openFrom = line.from;
        openTo = line.to;
        lang = match[1];
        info = match[2].trim();
        bodyStart = line.to + 1; // next char after the newline
        bodyLines.length = 0;
      }
    } else {
      if (FENCE_CLOSE_RE.test(text)) {
        const metadata =
          parseDbFenceInfo(`${lang} ${info}`.trim()) ?? {
            dialect: "generic",
          };
        blocks.push({
          from: openFrom,
          to: line.to,
          lang,
          info,
          metadata,
          openLineFrom: openFrom,
          openLineTo: openTo,
          // When the body is empty (close fence immediately after open),
          // bodyFrom == bodyTo == the position between fences.
          bodyFrom: bodyStart,
          bodyTo: line.from === bodyStart ? bodyStart : line.from - 1,
          closeLineFrom: line.from,
          closeLineTo: line.to,
          body: bodyLines.join("\n"),
        });
        inBlock = false;
      } else {
        bodyLines.push(text);
      }
    }
  }

  return blocks;
}

// ───── Widgets ─────

/**
 * Inline toolbar stub. Rendered with `block: false` and `side: 1` so it
 * sits at the end of the open-fence line; CSS pulls it up-right via
 * `position: absolute`.
 */
class DbToolbarStubWidget extends WidgetType {
  constructor(
    readonly alias: string | undefined,
    readonly connection: string | undefined,
    readonly dialect: string,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const div = document.createElement("div");
    div.className = "cm-db-toolbar-stub";
    div.contentEditable = "false";
    div.setAttribute("aria-label", "DB block toolbar (stub)");

    const badge = document.createElement("span");
    badge.className = "cm-db-toolbar-badge";
    badge.textContent = "DB";
    div.appendChild(badge);

    if (this.alias) {
      const alias = document.createElement("span");
      alias.className = "cm-db-toolbar-alias";
      alias.textContent = this.alias;
      div.appendChild(alias);
    }

    if (this.connection) {
      const conn = document.createElement("span");
      conn.className = "cm-db-toolbar-connection";
      conn.textContent = this.connection;
      div.appendChild(conn);
    }

    const dialect = document.createElement("span");
    dialect.className = "cm-db-toolbar-dialect";
    dialect.textContent = this.dialect;
    div.appendChild(dialect);

    // Stub actions. Clicks are intentionally no-op in stage 4.
    for (const label of ["▶", "⚡", "▦", "⤓", "⚙"]) {
      const btn = document.createElement("button");
      btn.className = "cm-db-toolbar-btn";
      btn.type = "button";
      btn.disabled = true;
      btn.textContent = label;
      div.appendChild(btn);
    }

    return div;
  }

  eq(other: DbToolbarStubWidget): boolean {
    return (
      this.alias === other.alias &&
      this.connection === other.connection &&
      this.dialect === other.dialect
    );
  }

  ignoreEvent(): boolean {
    // Swallow events from the stub — otherwise CM6 treats clicks on the
    // overlay as cursor positioning and warps the selection into the fence.
    return true;
  }
}

/**
 * Result placeholder inserted after the closing fence. Replaced by a React
 * portal in stage 5.
 */
class DbResultStubWidget extends WidgetType {
  toDOM(): HTMLElement {
    const div = document.createElement("div");
    div.className = "cm-db-result-stub";
    div.contentEditable = "false";
    div.textContent = "Run (⌘↵) to see results — stage 5 lands the live panel.";
    return div;
  }

  eq(): boolean {
    return true;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * Status-bar placeholder. Same deal — stub now, wired up in stage 5.
 */
class DbStatusBarStubWidget extends WidgetType {
  constructor(
    readonly connection: string | undefined,
    readonly limit: number | undefined,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const div = document.createElement("div");
    div.className = "cm-db-statusbar-stub";
    div.contentEditable = "false";
    const parts: string[] = [];
    if (this.connection) parts.push(this.connection);
    if (this.limit !== undefined) parts.push(`limit ${this.limit}`);
    parts.push("⌘↵ to run");
    div.textContent = parts.join(" · ");
    return div;
  }

  eq(other: DbStatusBarStubWidget): boolean {
    return (
      this.connection === other.connection && this.limit === other.limit
    );
  }

  ignoreEvent(): boolean {
    return true;
  }
}

// ───── Decoration builder ─────

const fenceLineDecoration = Decoration.line({ class: "cm-db-fence-line" });
const bodyLineDecoration = Decoration.line({ class: "cm-db-body-line" });

function buildDbDecorations(
  state: EditorState,
  blocks: DbFencedBlock[],
): DecorationSet {
  // Collect decorations into a list first so we can sort by (from, startSide)
  // before handing them to the RangeSetBuilder (which demands sorted input).
  type Item = {
    from: number;
    to: number;
    deco: Decoration;
    /** Sort tiebreaker: widgets with `side: -1` must come before the line
     * decoration that starts at the same position. Positive widgets come
     * after. Line decorations use 0. */
    order: number;
  };

  const items: Item[] = [];

  for (const block of blocks) {
    // ── Line classes (non-replacing) ──
    items.push({
      from: block.openLineFrom,
      to: block.openLineFrom,
      deco: fenceLineDecoration,
      order: 0,
    });
    items.push({
      from: block.closeLineFrom,
      to: block.closeLineFrom,
      deco: fenceLineDecoration,
      order: 0,
    });

    // Each body line gets the body class (makes CSS targeting easy).
    if (block.body.length > 0) {
      const firstBodyLine = state.doc.lineAt(block.bodyFrom).number;
      const lastBodyLine = state.doc.lineAt(block.bodyTo).number;
      for (let n = firstBodyLine; n <= lastBodyLine; n++) {
        const line = state.doc.line(n);
        items.push({
          from: line.from,
          to: line.from,
          deco: bodyLineDecoration,
          order: 0,
        });
      }
    }

    // ── Inline toolbar widget on open-fence line (side: 1) ──
    items.push({
      from: block.openLineTo,
      to: block.openLineTo,
      deco: Decoration.widget({
        widget: new DbToolbarStubWidget(
          block.metadata.alias,
          block.metadata.connection,
          block.metadata.dialect,
        ),
        side: 1,
      }),
      order: 1,
    });

    // ── Result + status bar after the close fence (block widgets) ──
    items.push({
      from: block.closeLineTo,
      to: block.closeLineTo,
      deco: Decoration.widget({
        widget: new DbResultStubWidget(),
        block: true,
        side: 1,
      }),
      order: 2,
    });
    items.push({
      from: block.closeLineTo,
      to: block.closeLineTo,
      deco: Decoration.widget({
        widget: new DbStatusBarStubWidget(
          block.metadata.connection,
          block.metadata.limit,
        ),
        block: true,
        side: 1,
      }),
      order: 3,
    });
  }

  items.sort((a, b) => a.from - b.from || a.order - b.order);

  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to, deco } of items) {
    builder.add(from, to, deco);
  }
  return builder.finish();
}

/** Lightweight structural check to skip rebuilding on pure-text edits. */
function countDbBlocks(doc: CMText): number {
  let count = 0;
  for (let i = 1; i <= doc.lines; i++) {
    if (DB_OPEN_RE.test(doc.line(i).text)) count++;
  }
  return count;
}

// ───── Navigation: transaction filter ─────

/**
 * When a transaction would leave the main selection exactly on a fence
 * line (open or close), shift it to the nearest non-fence position so
 * the cursor "skips" the fence. Combined with `atomicRanges` over those
 * same lines, keyboard navigation (arrows, vim j/k) behaves as if the
 * fence didn't exist — yet editing inside the body works normally.
 */
function fenceSkipFilter(
  tr: Transaction,
  blocks: DbFencedBlock[],
): TransactionSpec | null {
  if (!tr.selection || blocks.length === 0) return null;

  const oldSel = tr.startState.selection.main;
  const newSel = tr.selection.main;

  // Only handle simple cursor moves (empty selection). Don't mess with
  // extended selections or multi-range selections — user intent there is
  // to include the fence in a block operation (copy, delete).
  if (!newSel.empty || !oldSel.empty) return null;

  const doc = tr.newDoc;
  const newLine = doc.lineAt(newSel.head);

  const block = blocks.find(
    (b) =>
      newLine.from === b.openLineFrom ||
      newLine.from === b.closeLineFrom,
  );
  if (!block) return null;

  const goingDown = newSel.head > oldSel.head;
  const onOpen = newLine.from === block.openLineFrom;

  let target: number;
  if (onOpen) {
    target = goingDown ? block.bodyFrom : block.openLineFrom;
    if (!goingDown) {
      // Moving up into open fence from inside → jump to line before the block.
      const prevPos = block.openLineFrom - 1;
      target = prevPos >= 0 ? prevPos : 0;
    }
  } else {
    // onClose
    if (goingDown) {
      // Moving down out of body → jump past close fence.
      target = Math.min(block.closeLineTo + 1, doc.length);
    } else {
      // Moving up into close fence from below → jump to end of body.
      target = block.bodyTo;
    }
  }

  return {
    selection: EditorSelection.cursor(target),
    // Preserve the rest of the transaction (scrollIntoView etc.).
    scrollIntoView: tr.scrollIntoView,
  };
}

// ───── Public extension factory ─────

export function createDbBlockExtension(): Extension {
  // Cache blocks so atomicRanges and the transactionFilter don't each
  // rescan the document.
  let cachedBlocks: DbFencedBlock[] = [];
  let lastBlockCount = 0;

  const field = StateField.define<DecorationSet>({
    create(state) {
      cachedBlocks = findDbBlocks(state.doc);
      lastBlockCount = cachedBlocks.length;
      return buildDbDecorations(state, cachedBlocks);
    },
    update(decos, tr) {
      if (!tr.docChanged) return decos;
      const newCount = countDbBlocks(tr.state.doc);
      if (newCount !== lastBlockCount) {
        lastBlockCount = newCount;
        cachedBlocks = findDbBlocks(tr.state.doc);
        return buildDbDecorations(tr.state, cachedBlocks);
      }
      // Block count unchanged — still rebuild to keep widget metadata in
      // sync with info-string edits (alias/connection/etc.). This is cheap
      // because findDbBlocks is O(lines) and runs over the full doc.
      cachedBlocks = findDbBlocks(tr.state.doc);
      return buildDbDecorations(tr.state, cachedBlocks);
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  const atomicFenceLines = EditorView.atomicRanges.of(() => {
    const builder = new RangeSetBuilder<Decoration>();
    for (const block of cachedBlocks) {
      builder.add(block.openLineFrom, block.openLineTo, Decoration.mark({}));
      builder.add(
        block.closeLineFrom,
        block.closeLineTo,
        Decoration.mark({}),
      );
    }
    return builder.finish();
  });

  const navFilter = EditorState.transactionFilter.of((tr) => {
    const spec = fenceSkipFilter(tr, cachedBlocks);
    if (!spec) return tr;
    return [tr, spec];
  });

  return [field, atomicFenceLines, navFilter];
}

// ───── Exports for tests ─────

export const __internal = {
  DB_OPEN_RE,
  FENCE_CLOSE_RE,
  countDbBlocks,
  buildDbDecorations,
  fenceSkipFilter,
};
