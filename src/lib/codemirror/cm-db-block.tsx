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

/** Index-based block id. Stable across alias/body edits. */
function blockIdOf(_block: DbFencedBlock, index: number): string {
  return `db_block_${index}`;
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

const fenceLineDecoration = Decoration.line({ class: "cm-db-fence-line" });
const bodyLineDecoration = Decoration.line({ class: "cm-db-body-line" });

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

    // Fence line classes
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

    // Toolbar widget on open-fence line (inline, side: 1)
    items.push({
      from: block.openLineTo,
      to: block.openLineTo,
      deco: Decoration.widget({
        widget: new DbToolbarPortalWidget(blockId, block),
        side: 1,
      }),
      order: 1,
    });

    // Result + status bar (block widgets after close fence)
    items.push({
      from: block.closeLineTo,
      to: block.closeLineTo,
      deco: Decoration.widget({
        widget: new DbResultPortalWidget(blockId, block),
        block: true,
        side: 1,
      }),
      order: 2,
    });
    items.push({
      from: block.closeLineTo,
      to: block.closeLineTo,
      deco: Decoration.widget({
        widget: new DbStatusBarPortalWidget(blockId, block),
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
      if (!tr.docChanged) return decos;
      const newCount = countDbBlocks(tr.state.doc);
      if (newCount !== lastBlockCount) {
        lastBlockCount = newCount;
        cachedBlocks = findDbBlocks(tr.state.doc);
        return buildDbDecorations(tr.state, cachedBlocks);
      }
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
