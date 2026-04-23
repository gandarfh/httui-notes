/**
 * CodeMirror extension for DB block rendering (stages 4-5 of db block redesign).
 *
 * Stage 4 delivered the fenced-native render and navigation. Stage 5 wires
 * React into three widget slots (toolbar / result / status-bar) plus a
 * settings drawer, and adds ⌘↵ / ⌘. keymap.
 *
 * Responsibility split:
 *  - This module owns the CM6 extension: block scanner, decorations,
 *    atomic ranges, transaction filter, and keymap.
 *  - Widgets only create a container `<div>` and register it in a module-
 *    level registry. Actual React UI is mounted by `DbWidgetPortals`.
 *  - Actions (run / cancel) are callbacks set on the registry by the React
 *    panel. The keymap reads them by blockId so ⌘↵ dispatches without an
 *    event bus.
 */

import {
  EditorSelection,
  EditorState,
  RangeSetBuilder,
  StateField,
  type Extension,
  type Text as CMText,
  type Transaction,
  type TransactionSpec,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  keymap,
  type DecorationSet,
  type KeyBinding,
} from "@codemirror/view";

import {
  parseDbFenceInfo,
  type DbBlockMetadata,
} from "@/lib/blocks/db-fence";

// ───── Types ─────

export interface DbFencedBlock {
  from: number;
  to: number;
  lang: string;
  info: string;
  metadata: DbBlockMetadata;
  openLineFrom: number;
  openLineTo: number;
  bodyFrom: number;
  bodyTo: number;
  closeLineFrom: number;
  closeLineTo: number;
  body: string;
}

const DB_OPEN_RE = /^```(db(?:-[\w:-]+)?)(.*)$/;
const FENCE_CLOSE_RE = /^```+\s*$/;

// ───── Block scanner ─────

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
        bodyStart = line.to + 1;
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

// ───── Portal registry ─────

export type DbWidgetSlot = "toolbar" | "result" | "statusbar";

export interface DbPortalActions {
  /** Run the block. Called by ⌘↵ or the toolbar ▶ button. */
  onRun?: () => void;
  /** Cancel an in-flight run. Called by ⌘. or the toolbar ⏹ button. */
  onCancel?: () => void;
  /** Open the settings drawer. Called by the ⚙ button. */
  onOpenSettings?: () => void;
}

export interface DbPortalEntry {
  blockId: string;
  block: DbFencedBlock;
  toolbar?: HTMLElement;
  result?: HTMLElement;
  statusbar?: HTMLElement;
  actions: DbPortalActions;
}

const entries = new Map<string, DbPortalEntry>();
const listeners = new Set<() => void>();
let portalVersion = 0;

function notify() {
  portalVersion++;
  for (const fn of listeners) fn();
}

export function subscribeToDbPortals(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getDbPortalVersion(): number {
  return portalVersion;
}

export function getDbWidgetContainers(): ReadonlyMap<string, DbPortalEntry> {
  return entries;
}

/**
 * Set or update the run/cancel callbacks for a block. Called by the React
 * panel when it mounts. The CM6 keymap reads these to dispatch actions
 * without an event bus.
 */
export function setDbBlockActions(
  blockId: string,
  actions: DbPortalActions,
): void {
  const entry = entries.get(blockId);
  if (!entry) return;
  entry.actions = { ...entry.actions, ...actions };
}

function ensureEntry(blockId: string, block: DbFencedBlock): DbPortalEntry {
  let entry = entries.get(blockId);
  if (!entry) {
    entry = { blockId, block, actions: {} };
    entries.set(blockId, entry);
  } else {
    entry.block = block;
  }
  return entry;
}

function registerSlot(
  blockId: string,
  block: DbFencedBlock,
  slot: DbWidgetSlot,
  element: HTMLElement,
) {
  const entry = ensureEntry(blockId, block);
  entry[slot] = element;
  notify();
}

function unregisterSlot(blockId: string, slot: DbWidgetSlot) {
  const entry = entries.get(blockId);
  if (!entry) return;
  entry[slot] = undefined;
  if (!entry.toolbar && !entry.result && !entry.statusbar) {
    entries.delete(blockId);
  }
  notify();
}

/**
 * Build a block id. Prefers the alias (stable as users insert / reorder
 * blocks) and falls back to the document index for blocks without an alias.
 *
 * Colliding aliases (two blocks with the same alias in one doc) end up
 * sharing an id — which is the existing behavior: the first one wins for
 * refs anyway, and the visual panel state just collapses onto a single
 * block. Users see a warning in the reference system if this happens.
 */
function blockIdOf(block: DbFencedBlock, index: number): string {
  const alias = block.metadata.alias;
  if (alias) return `db_alias_${alias}`;
  return `db_idx_${index}`;
}

// ───── Widgets (register-only — React mounts from DbWidgetPortals) ─────

class DbToolbarPortalWidget extends WidgetType {
  constructor(readonly blockId: string, readonly block: DbFencedBlock) {
    super();
  }

  toDOM(): HTMLElement {
    const div = document.createElement("div");
    div.className = "cm-db-toolbar-portal";
    div.contentEditable = "false";
    registerSlot(this.blockId, this.block, "toolbar", div);
    return div;
  }

  updateDOM(dom: HTMLElement): boolean {
    registerSlot(this.blockId, this.block, "toolbar", dom);
    return true;
  }

  destroy(): void {
    unregisterSlot(this.blockId, "toolbar");
  }

  eq(other: DbToolbarPortalWidget): boolean {
    return this.blockId === other.blockId;
  }

  ignoreEvent(): boolean {
    // Toolbar handles its own clicks via React. Do not let them bubble
    // into CM6 as cursor-positioning.
    return true;
  }
}

class DbResultPortalWidget extends WidgetType {
  constructor(readonly blockId: string, readonly block: DbFencedBlock) {
    super();
  }

  toDOM(): HTMLElement {
    const div = document.createElement("div");
    div.className = "cm-db-result-portal";
    div.contentEditable = "false";
    registerSlot(this.blockId, this.block, "result", div);
    return div;
  }

  updateDOM(dom: HTMLElement): boolean {
    registerSlot(this.blockId, this.block, "result", dom);
    return true;
  }

  destroy(): void {
    unregisterSlot(this.blockId, "result");
  }

  eq(other: DbResultPortalWidget): boolean {
    return this.blockId === other.blockId;
  }

  get estimatedHeight(): number {
    return 80;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class DbStatusBarPortalWidget extends WidgetType {
  constructor(readonly blockId: string, readonly block: DbFencedBlock) {
    super();
  }

  toDOM(): HTMLElement {
    const div = document.createElement("div");
    div.className = "cm-db-statusbar-portal";
    div.contentEditable = "false";
    registerSlot(this.blockId, this.block, "statusbar", div);
    return div;
  }

  updateDOM(dom: HTMLElement): boolean {
    registerSlot(this.blockId, this.block, "statusbar", dom);
    return true;
  }

  destroy(): void {
    unregisterSlot(this.blockId, "statusbar");
  }

  eq(other: DbStatusBarPortalWidget): boolean {
    return this.blockId === other.blockId;
  }

  get estimatedHeight(): number {
    return 20;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

// ───── Decoration builder ─────

/**
 * Zero-height placeholder used to replace fence lines when the cursor is
 * outside the block. The line's text (```db-… / ```) disappears visually
 * while its position in the doc is preserved.
 */
class FenceHiddenWidget extends WidgetType {
  toDOM(): HTMLElement {
    const div = document.createElement("div");
    div.className = "cm-db-fence-hidden";
    return div;
  }
  eq(): boolean {
    return true;
  }
  get estimatedHeight(): number {
    return 0;
  }
}

/**
 * Is the cursor inside the given block (including on its fence lines)?
 * Editing mode reveals the raw fence text; reading mode hides it and
 * shows the card-frame UI.
 */
function cursorInsideBlock(
  state: EditorState,
  block: DbFencedBlock,
): boolean {
  const pos = state.selection.main.head;
  return pos >= block.from && pos <= block.to;
}

function buildDbDecorations(
  state: EditorState,
  blocks: DbFencedBlock[],
): DecorationSet {
  type Item = {
    from: number;
    to: number;
    deco: Decoration;
    order: number;
  };
  const items: Item[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const blockId = blockIdOf(block, i);
    const editing = cursorInsideBlock(state, block);

    if (editing) {
      // ── Editing: show raw fence text with subtle styling ──
      items.push({
        from: block.openLineFrom,
        to: block.openLineFrom,
        deco: Decoration.line({ class: "cm-db-fence-line cm-db-fence-line-open" }),
        order: 0,
      });
      items.push({
        from: block.closeLineFrom,
        to: block.closeLineFrom,
        deco: Decoration.line({ class: "cm-db-fence-line cm-db-fence-line-close" }),
        order: 0,
      });
    } else {
      // ── Reading: hide fences, replaced by card header / closing border ──
      // Open fence becomes the header bar (toolbar widget lives inside it).
      items.push({
        from: block.openLineFrom,
        to: block.openLineTo,
        deco: Decoration.replace({
          widget: new DbToolbarPortalWidget(blockId, block),
          block: true,
        }),
        order: 0,
      });
      // Close fence becomes the card's bottom border.
      items.push({
        from: block.closeLineFrom,
        to: block.closeLineTo,
        deco: Decoration.replace({
          widget: new FenceHiddenWidget(),
          block: true,
        }),
        order: 1,
      });
    }

    // ── Body lines: line-level classes for card styling ──
    // First/last get modifier classes so only the outer edges round.
    if (block.body.length > 0) {
      const firstBodyLine = state.doc.lineAt(block.bodyFrom).number;
      const lastBodyLine = state.doc.lineAt(block.bodyTo).number;
      for (let n = firstBodyLine; n <= lastBodyLine; n++) {
        const line = state.doc.line(n);
        const classes = ["cm-db-body-line"];
        if (editing) classes.push("cm-db-body-editing");
        if (n === firstBodyLine) classes.push("cm-db-body-line-first");
        if (n === lastBodyLine) classes.push("cm-db-body-line-last");
        items.push({
          from: line.from,
          to: line.from,
          deco: Decoration.line({ class: classes.join(" ") }),
          order: 0,
        });
      }
    }

    // ── Toolbar widget while editing (inline, absolute in CSS) ──
    // When reading, the toolbar widget is the header replace above; when
    // editing, we still want the controls accessible, so a second instance
    // docks at the end of the open-fence line.
    if (editing) {
      items.push({
        from: block.openLineTo,
        to: block.openLineTo,
        deco: Decoration.widget({
          widget: new DbToolbarPortalWidget(blockId, block),
          side: 1,
        }),
        order: 2,
      });
    }

    // ── Result + status bar (block widgets after close fence) ──
    items.push({
      from: block.closeLineTo,
      to: block.closeLineTo,
      deco: Decoration.widget({
        widget: new DbResultPortalWidget(blockId, block),
        block: true,
        side: 1,
      }),
      order: 3,
    });
    items.push({
      from: block.closeLineTo,
      to: block.closeLineTo,
      deco: Decoration.widget({
        widget: new DbStatusBarPortalWidget(blockId, block),
        block: true,
        side: 1,
      }),
      order: 4,
    });
  }

  items.sort((a, b) => a.from - b.from || a.order - b.order);

  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to, deco } of items) {
    builder.add(from, to, deco);
  }
  return builder.finish();
}

function countDbBlocks(doc: CMText): number {
  let count = 0;
  for (let i = 1; i <= doc.lines; i++) {
    if (DB_OPEN_RE.test(doc.line(i).text)) count++;
  }
  return count;
}

// ───── Navigation: transaction filter ─────

function fenceSkipFilter(
  tr: Transaction,
  blocks: DbFencedBlock[],
): TransactionSpec | null {
  if (!tr.selection || blocks.length === 0) return null;

  const oldSel = tr.startState.selection.main;
  const newSel = tr.selection.main;

  if (!newSel.empty || !oldSel.empty) return null;

  const doc = tr.newDoc;
  const newLine = doc.lineAt(newSel.head);

  const block = blocks.find(
    (b) =>
      newLine.from === b.openLineFrom || newLine.from === b.closeLineFrom,
  );
  if (!block) return null;

  const goingDown = newSel.head > oldSel.head;
  const onOpen = newLine.from === block.openLineFrom;

  let target: number;
  if (onOpen) {
    target = goingDown ? block.bodyFrom : block.openLineFrom;
    if (!goingDown) {
      const prevPos = block.openLineFrom - 1;
      target = prevPos >= 0 ? prevPos : 0;
    }
  } else {
    if (goingDown) {
      target = Math.min(block.closeLineTo + 1, doc.length);
    } else {
      target = block.bodyTo;
    }
  }

  return {
    selection: EditorSelection.cursor(target),
    scrollIntoView: tr.scrollIntoView,
  };
}

// ───── Keymap ─────

/**
 * Resolve the block containing the cursor. Returns null if the cursor is
 * outside all db blocks.
 */
function blockAtCursor(
  view: EditorView,
  blocks: DbFencedBlock[],
): { entry: DbPortalEntry; block: DbFencedBlock } | null {
  const pos = view.state.selection.main.head;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (pos >= block.from && pos <= block.to) {
      const entry = entries.get(blockIdOf(block, i));
      if (entry) return { entry, block };
      return null;
    }
  }
  return null;
}

function makeKeymap(getBlocks: () => DbFencedBlock[]): KeyBinding[] {
  return [
    {
      key: "Mod-Enter",
      run: (view) => {
        const found = blockAtCursor(view, getBlocks());
        if (!found) return false;
        found.entry.actions.onRun?.();
        return true;
      },
    },
    {
      key: "Mod-.",
      run: (view) => {
        const found = blockAtCursor(view, getBlocks());
        if (!found) return false;
        found.entry.actions.onCancel?.();
        return true;
      },
    },
  ];
}

// ───── Public extension factory ─────

export function createDbBlockExtension(): Extension {
  let cachedBlocks: DbFencedBlock[] = [];
  let lastBlockCount = 0;

  const field = StateField.define<DecorationSet>({
    create(state) {
      cachedBlocks = findDbBlocks(state.doc);
      lastBlockCount = cachedBlocks.length;
      return buildDbDecorations(state, cachedBlocks);
    },
    update(decos, tr) {
      // Rebuild when the document changes (structure) OR when the main
      // selection moves across block boundaries (cursor-reveal toggle).
      if (tr.docChanged) {
        const newCount = countDbBlocks(tr.state.doc);
        if (newCount !== lastBlockCount) {
          lastBlockCount = newCount;
        }
        cachedBlocks = findDbBlocks(tr.state.doc);
        return buildDbDecorations(tr.state, cachedBlocks);
      }
      if (tr.selection) {
        // Selection moved — only rebuild if this crosses an edit-mode
        // boundary of some block. Cheap check: scan cached blocks.
        const oldPos = tr.startState.selection.main.head;
        const newPos = tr.state.selection.main.head;
        const crossed = cachedBlocks.some((b) => {
          const oldInside = oldPos >= b.from && oldPos <= b.to;
          const newInside = newPos >= b.from && newPos <= b.to;
          return oldInside !== newInside;
        });
        if (crossed) {
          return buildDbDecorations(tr.state, cachedBlocks);
        }
      }
      return decos;
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

  const dbKeymap = keymap.of(makeKeymap(() => cachedBlocks));

  return [field, atomicFenceLines, navFilter, dbKeymap];
}

// ───── Exports for tests ─────

export const __internal = {
  DB_OPEN_RE,
  FENCE_CLOSE_RE,
  countDbBlocks,
  buildDbDecorations,
  fenceSkipFilter,
};
