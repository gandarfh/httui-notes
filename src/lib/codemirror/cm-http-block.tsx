/**
 * CodeMirror extension for HTTP block rendering (stage 3 of the HTTP block
 * redesign — see `docs/http-block-redesign.md`).
 *
 * Mirrors the DB block extension structurally:
 *  - Block scanner over the full document to locate `http` fences.
 *  - StateField producing decorations: open/close fence styling, body line
 *    classes, method coloring on the first body line, toolbar widget +
 *    close-panel widget for portal mounting.
 *  - Module-level portal registry so a React panel (`HttpFencedPanel`,
 *    landed in stage 4) can mount toolbar/result/statusbar React trees
 *    inside the CM6 widget DOM.
 *  - Keymap: ⌘↵ run, ⌘. cancel — currently dispatch into the registry's
 *    actions, which the React panel will fill in stage 4.
 *
 * This module owns nothing about execution — it's pure presentation +
 * routing of keystrokes / portal slots.
 */

import {
  EditorState,
  Prec,
  RangeSetBuilder,
  StateField,
  type Extension,
  type Text as CMText,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  keymap,
  type DecorationSet,
  type KeyBinding,
} from "@codemirror/view";
import type {
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from "@codemirror/autocomplete";

import {
  parseHttpFenceInfo,
  type HttpBlockMetadata,
  type HttpMethod,
} from "@/lib/blocks/http-fence";
import { createReferenceCompletionSource } from "@/lib/blocks/cm-autocomplete";
import { collectBlocksAboveCM } from "@/lib/blocks/document";
import { useEnvironmentStore } from "@/stores/environment";

// ───── Types ─────

export interface HttpFencedBlock {
  from: number;
  to: number;
  info: string;
  metadata: HttpBlockMetadata;
  openLineFrom: number;
  openLineTo: number;
  bodyFrom: number;
  bodyTo: number;
  closeLineFrom: number;
  closeLineTo: number;
  body: string;
}

const HTTP_OPEN_RE = /^```http(.*)$/;
const FENCE_CLOSE_RE = /^```+\s*$/;

const HTTP_METHODS: ReadonlySet<string> = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

// ───── Block scanner ─────

export function findHttpBlocks(doc: CMText): HttpFencedBlock[] {
  const blocks: HttpFencedBlock[] = [];
  let inBlock = false;
  let openFrom = 0;
  let openTo = 0;
  let info = "";
  let bodyStart = 0;
  const bodyLines: string[] = [];

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;

    if (!inBlock) {
      const match = text.match(HTTP_OPEN_RE);
      if (match) {
        inBlock = true;
        openFrom = line.from;
        openTo = line.to;
        info = match[1].trim();
        bodyStart = line.to + 1;
        bodyLines.length = 0;
      }
    } else {
      if (FENCE_CLOSE_RE.test(text)) {
        const metadata = parseHttpFenceInfo(`http ${info}`.trim()) ?? {};
        blocks.push({
          from: openFrom,
          to: line.to,
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

function countHttpBlocks(doc: CMText): number {
  let count = 0;
  for (let i = 1; i <= doc.lines; i++) {
    if (HTTP_OPEN_RE.test(doc.line(i).text)) count++;
  }
  return count;
}

// ───── Portal registry ─────

export type HttpWidgetSlot = "toolbar" | "form" | "result" | "statusbar";

export interface HttpPortalActions {
  /** Run the block. Called by ⌘↵ or the toolbar ▶ button. */
  onRun?: () => void;
  /** Cancel an in-flight run. Called by ⌘. or the toolbar ⏹ button. */
  onCancel?: () => void;
  /** Open the settings drawer. Called by the ⚙ button. */
  onOpenSettings?: () => void;
  /** Copy the request as a cURL one-liner. Called by ⌘⇧C. */
  onCopyAsCurl?: () => void;
}

export interface HttpPortalEntry {
  blockId: string;
  block: HttpFencedBlock;
  toolbar?: HTMLElement;
  /** Container for the form-mode panel. Only populated when the block's
   * `mode=form` and the cursor is OUTSIDE the block (reading mode). */
  form?: HTMLElement;
  result?: HTMLElement;
  statusbar?: HTMLElement;
  actions: HttpPortalActions;
}

const entries = new Map<string, HttpPortalEntry>();
const listeners = new Set<() => void>();
let portalVersion = 0;

function notify() {
  portalVersion++;
  for (const fn of listeners) fn();
}

let bodyNotifyTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleBodyNotify() {
  if (bodyNotifyTimer !== null) clearTimeout(bodyNotifyTimer);
  bodyNotifyTimer = setTimeout(() => {
    bodyNotifyTimer = null;
    notify();
  }, 250);
}

export function subscribeToHttpPortals(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getHttpPortalVersion(): number {
  return portalVersion;
}

export function getHttpWidgetContainers(): ReadonlyMap<string, HttpPortalEntry> {
  return entries;
}

/**
 * Set or update the run/cancel callbacks for a block. Called by the React
 * panel when it mounts. The CM6 keymap reads these to dispatch actions
 * without an event bus.
 */
export function setHttpBlockActions(
  blockId: string,
  actions: HttpPortalActions,
): void {
  const entry = entries.get(blockId);
  if (!entry) return;
  entry.actions = { ...entry.actions, ...actions };
}

function registerSlot(
  blockId: string,
  block: HttpFencedBlock,
  slot: HttpWidgetSlot,
  element: HTMLElement,
) {
  const prev = entries.get(blockId);
  const next: HttpPortalEntry = prev
    ? { ...prev, block, [slot]: element }
    : { blockId, block, actions: {}, [slot]: element };
  entries.set(blockId, next);
  notify();
}

function unregisterSlot(blockId: string, slot: HttpWidgetSlot) {
  const prev = entries.get(blockId);
  if (!prev) return;
  const next: HttpPortalEntry = { ...prev, [slot]: undefined };
  if (!next.toolbar && !next.form && !next.result && !next.statusbar) {
    entries.delete(blockId);
  } else {
    entries.set(blockId, next);
  }
  notify();
}

function blockIdOf(_block: HttpFencedBlock, index: number): string {
  return `http_idx_${index}`;
}

function syncRegistryBlocks(blocks: HttpFencedBlock[]): void {
  let meaningfulChange = false;
  for (let i = 0; i < blocks.length; i++) {
    const id = blockIdOf(blocks[i], i);
    const entry = entries.get(id);
    if (!entry) continue;
    const prev = entry.block;
    const fresh = blocks[i];
    if (prev === fresh) continue;

    const prevMeta = prev.metadata;
    const nextMeta = fresh.metadata;
    const metaChanged =
      prevMeta.alias !== nextMeta.alias ||
      prevMeta.timeoutMs !== nextMeta.timeoutMs ||
      prevMeta.displayMode !== nextMeta.displayMode ||
      prevMeta.mode !== nextMeta.mode;
    const bodyChanged = prev.body !== fresh.body;

    if (metaChanged) {
      entry.block = fresh;
      meaningfulChange = true;
    } else if (bodyChanged) {
      entry.block = fresh;
      scheduleBodyNotify();
    } else {
      prev.from = fresh.from;
      prev.to = fresh.to;
      prev.bodyFrom = fresh.bodyFrom;
      prev.bodyTo = fresh.bodyTo;
      prev.openLineFrom = fresh.openLineFrom;
      prev.openLineTo = fresh.openLineTo;
      prev.closeLineFrom = fresh.closeLineFrom;
      prev.closeLineTo = fresh.closeLineTo;
      prev.info = fresh.info;
    }
  }
  if (meaningfulChange) notify();
}

// ───── Widget height caching ─────

const widgetHeightCache = new Map<string, number>();

function cacheKey(blockId: string, slot: HttpWidgetSlot): string {
  return `${blockId}:${slot}`;
}

function observeWidgetHeight(
  dom: HTMLElement,
  blockId: string,
  slot: HttpWidgetSlot,
  view: EditorView,
): void {
  if (typeof ResizeObserver === "undefined") return;
  const seed = dom.offsetHeight;
  if (seed > 0) widgetHeightCache.set(cacheKey(blockId, slot), seed);
  const ro = new ResizeObserver(() => {
    const prev = widgetHeightCache.get(cacheKey(blockId, slot));
    const next = dom.offsetHeight;
    if (next > 0 && prev !== next) {
      widgetHeightCache.set(cacheKey(blockId, slot), next);
      view.requestMeasure();
    }
  });
  ro.observe(dom);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (dom as any).__cmWidgetResizeObserver = ro;
}

function disconnectWidgetObserver(
  dom: HTMLElement | undefined,
  blockId: string,
  slot: HttpWidgetSlot,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ro = (dom as any)?.__cmWidgetResizeObserver as ResizeObserver | undefined;
  ro?.disconnect();
  widgetHeightCache.delete(cacheKey(blockId, slot));
}

// ───── Widgets ─────

class HttpToolbarPortalWidget extends WidgetType {
  constructor(readonly blockId: string, readonly block: HttpFencedBlock) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const div = document.createElement("div");
    div.className = "cm-http-toolbar-portal";
    div.contentEditable = "false";
    registerSlot(this.blockId, this.block, "toolbar", div);
    observeWidgetHeight(div, this.blockId, "toolbar", view);
    return div;
  }

  updateDOM(dom: HTMLElement): boolean {
    registerSlot(this.blockId, this.block, "toolbar", dom);
    return true;
  }

  destroy(dom: HTMLElement): void {
    disconnectWidgetObserver(dom, this.blockId, "toolbar");
    unregisterSlot(this.blockId, "toolbar");
  }

  eq(other: HttpToolbarPortalWidget): boolean {
    return this.blockId === other.blockId;
  }

  get estimatedHeight(): number {
    const cached = widgetHeightCache.get(cacheKey(this.blockId, "toolbar"));
    return cached ?? 44;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class HttpClosePanelWidget extends WidgetType {
  constructor(readonly blockId: string, readonly block: HttpFencedBlock) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-http-close-panel";
    wrap.contentEditable = "false";

    const spacer = document.createElement("div");
    spacer.className = "cm-http-fence-hidden";
    wrap.appendChild(spacer);

    const result = document.createElement("div");
    result.className = "cm-http-result-portal";
    registerSlot(this.blockId, this.block, "result", result);
    wrap.appendChild(result);

    const status = document.createElement("div");
    status.className = "cm-http-statusbar-portal";
    registerSlot(this.blockId, this.block, "statusbar", status);
    wrap.appendChild(status);

    observeWidgetHeight(wrap, this.blockId, "result", view);
    return wrap;
  }

  updateDOM(dom: HTMLElement): boolean {
    const result = dom.querySelector(".cm-http-result-portal");
    const status = dom.querySelector(".cm-http-statusbar-portal");
    if (result instanceof HTMLElement) {
      registerSlot(this.blockId, this.block, "result", result);
    }
    if (status instanceof HTMLElement) {
      registerSlot(this.blockId, this.block, "statusbar", status);
    }
    return true;
  }

  destroy(dom: HTMLElement): void {
    disconnectWidgetObserver(dom, this.blockId, "result");
    unregisterSlot(this.blockId, "result");
    unregisterSlot(this.blockId, "statusbar");
  }

  eq(other: HttpClosePanelWidget): boolean {
    return this.blockId === other.blockId;
  }

  get estimatedHeight(): number {
    const cached = widgetHeightCache.get(cacheKey(this.blockId, "result"));
    return cached ?? 60;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * Form-mode body widget. When `metadata.mode === "form"` and the cursor is
 * OUTSIDE the block, this widget replaces the body lines and lets the
 * React panel mount a tabular Params/Headers editor inside it.
 */
class HttpFormPortalWidget extends WidgetType {
  constructor(readonly blockId: string, readonly block: HttpFencedBlock) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const div = document.createElement("div");
    div.className = "cm-http-form-portal";
    div.contentEditable = "false";
    registerSlot(this.blockId, this.block, "form", div);
    observeWidgetHeight(div, this.blockId, "form", view);
    return div;
  }

  updateDOM(dom: HTMLElement): boolean {
    registerSlot(this.blockId, this.block, "form", dom);
    return true;
  }

  destroy(dom: HTMLElement): void {
    disconnectWidgetObserver(dom, this.blockId, "form");
    unregisterSlot(this.blockId, "form");
  }

  eq(other: HttpFormPortalWidget): boolean {
    // Re-mounting on body changes would lose React form state (focused
    // input, scroll). The body itself is rendered via React state derived
    // from `entry.block`, which still updates via syncRegistryBlocks.
    return this.blockId === other.blockId;
  }

  get estimatedHeight(): number {
    const cached = widgetHeightCache.get(cacheKey(this.blockId, "form"));
    return cached ?? 200;
  }

  ignoreEvent(): boolean {
    // Form inputs handle their own events; CM6 should not interpret clicks
    // inside as cursor-positioning.
    return true;
  }
}

// ───── Decorations ─────

function cursorInsideBlock(
  state: EditorState,
  block: HttpFencedBlock,
): boolean {
  const pos = state.selection.main.head;
  return pos >= block.from && pos <= block.to;
}

/**
 * Find the offset range of the METHOD token on the first non-blank,
 * non-comment line of the body, so we can decorate it with a method-colored
 * mark. Returns null if no recognizable method is found.
 */
function findMethodRange(
  state: EditorState,
  block: HttpFencedBlock,
): { from: number; to: number; method: HttpMethod } | null {
  if (block.body.length === 0) return null;
  const firstBodyLine = state.doc.lineAt(block.bodyFrom).number;
  const lastBodyLine = state.doc.lineAt(block.bodyTo).number;
  for (let n = firstBodyLine; n <= lastBodyLine; n++) {
    const line = state.doc.line(n);
    const text = line.text;
    const trimmed = text.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Z]+)(?=\s|$)/);
    if (!m) return null;
    if (!HTTP_METHODS.has(m[1])) return null;
    const indent = text.indexOf(m[1]);
    return {
      from: line.from + indent,
      to: line.from + indent + m[1].length,
      method: m[1] as HttpMethod,
    };
  }
  return null;
}

function methodClass(method: HttpMethod): string {
  return `cm-http-method cm-http-method-${method.toLowerCase()}`;
}

function buildHttpDecorations(
  state: EditorState,
  blocks: HttpFencedBlock[],
): DecorationSet {
  type Item = { from: number; to: number; deco: Decoration; order: number };
  const items: Item[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const blockId = blockIdOf(block, i);
    const editing = cursorInsideBlock(state, block);

    if (editing) {
      items.push({
        from: block.openLineFrom,
        to: block.openLineFrom,
        deco: Decoration.line({
          class: "cm-http-fence-line cm-http-fence-line-open",
        }),
        order: 0,
      });
      items.push({
        from: block.closeLineFrom,
        to: block.closeLineFrom,
        deco: Decoration.line({
          class: "cm-http-fence-line cm-http-fence-line-close",
        }),
        order: 0,
      });
      // Result panel still visible while editing — single block widget
      // after close fence (side: 1) so cursor navigation past the block
      // stays consistent with the reading-mode replacement.
      items.push({
        from: block.closeLineTo,
        to: block.closeLineTo,
        deco: Decoration.widget({
          widget: new HttpClosePanelWidget(blockId, block),
          block: true,
          side: 1,
        }),
        order: 3,
      });
    } else {
      items.push({
        from: block.openLineFrom,
        to: block.openLineTo,
        deco: Decoration.replace({
          widget: new HttpToolbarPortalWidget(blockId, block),
          block: true,
        }),
        order: 0,
      });
      items.push({
        from: block.closeLineFrom,
        to: block.closeLineTo,
        deco: Decoration.replace({
          widget: new HttpClosePanelWidget(blockId, block),
          block: true,
        }),
        order: 1,
      });
    }

    // Body rendering: when `mode=form` and the cursor is OUTSIDE the block,
    // replace the body lines with the form-mode widget. Inside the block
    // (editing) we always show the raw body for direct keyboard editing,
    // regardless of the persisted mode.
    const formMode = block.metadata.mode === "form";
    if (block.body.length > 0 && !editing && formMode) {
      // `Decoration.replace` over the body range removes those lines from
      // the rendered DOM and inserts our widget in their place. We need a
      // valid replace range that corresponds to whole lines; bodyFrom is
      // the start of the first body line and bodyTo is the end of the
      // last, so the range is exactly right.
      items.push({
        from: block.bodyFrom,
        to: block.bodyTo,
        deco: Decoration.replace({
          widget: new HttpFormPortalWidget(blockId, block),
          block: true,
        }),
        order: 0,
      });
    } else if (block.body.length > 0) {
      // Raw body line classes + method coloring (default render).
      const firstBodyLine = state.doc.lineAt(block.bodyFrom).number;
      const lastBodyLine = state.doc.lineAt(block.bodyTo).number;
      for (let n = firstBodyLine; n <= lastBodyLine; n++) {
        const line = state.doc.line(n);
        const classes = ["cm-http-body-line"];
        if (editing) classes.push("cm-http-body-editing");
        if (n === firstBodyLine) classes.push("cm-http-body-line-first");
        if (n === lastBodyLine) classes.push("cm-http-body-line-last");

        // Per-line syntax classification — overrides the generic markdown
        // highlighter (which colors `?`/`#`/`-` lines unpredictably) with
        // semantics that match the HTTP-message format. Order:
        //   1. comment + desc:  → cm-http-line-desc
        //   2. comment generic  → cm-http-line-comment
        //   3. query continuation (`^[?&]`) → cm-http-line-query
        //   4. header (`Key: Value`)        → cm-http-line-header
        //   5. body (after first blank)     → cm-http-line-body
        const text = line.text;
        const trimmed = text.trim();
        if (trimmed.startsWith("# desc:")) {
          classes.push("cm-http-line-desc");
        } else if (trimmed.startsWith("#")) {
          classes.push("cm-http-line-comment");
        } else if (/^\s*[?&]/.test(text)) {
          classes.push("cm-http-line-query");
        } else if (n > firstBodyLine && /^\s*[A-Za-z][\w-]*:/.test(text)) {
          // First body line is `METHOD URL` — never a header. From the second
          // body line on, a `Key:` start signals a header (until the first
          // blank line; we don't track that here, but `cm-http-line-body`
          // overrides for body lines below).
          classes.push("cm-http-line-header");
        }

        items.push({
          from: line.from,
          to: line.from,
          deco: Decoration.line({ class: classes.join(" ") }),
          order: 0,
        });

        // Mark the header KEY (everything before the first `:`) on header
        // lines so CSS can color it independently from the value.
        if (
          n > firstBodyLine &&
          !trimmed.startsWith("#") &&
          /^\s*[A-Za-z][\w-]*:/.test(text)
        ) {
          const colonIdx = text.indexOf(":");
          if (colonIdx > 0) {
            const indent = text.length - text.trimStart().length;
            items.push({
              from: line.from + indent,
              to: line.from + colonIdx,
              deco: Decoration.mark({ class: "cm-http-header-key" }),
              order: 2,
            });
          }
        }
      }

      // Method coloring on the first request line
      const methodRange = findMethodRange(state, block);
      if (methodRange) {
        items.push({
          from: methodRange.from,
          to: methodRange.to,
          deco: Decoration.mark({ class: methodClass(methodRange.method) }),
          order: 2,
        });
      }
    }
  }

  items.sort((a, b) => a.from - b.from || a.order - b.order);

  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to, deco } of items) {
    builder.add(from, to, deco);
  }
  return builder.finish();
}

// ───── Keymap ─────

function blockAtCursor(
  view: EditorView,
  blocks: HttpFencedBlock[],
): { entry: HttpPortalEntry; block: HttpFencedBlock } | null {
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

function makeKeymap(getBlocks: () => HttpFencedBlock[]): KeyBinding[] {
  return [
    {
      key: "Mod-Enter",
      run: (view) => {
        const found = blockAtCursor(view, getBlocks());
        if (!found) return false;
        if (!found.entry.actions.onRun) return false;
        found.entry.actions.onRun();
        return true;
      },
    },
    {
      key: "Mod-.",
      run: (view) => {
        const found = blockAtCursor(view, getBlocks());
        if (!found || !found.entry.actions.onCancel) return false;
        found.entry.actions.onCancel();
        return true;
      },
    },
    {
      key: "Mod-Shift-c",
      run: (view) => {
        const found = blockAtCursor(view, getBlocks());
        if (!found || !found.entry.actions.onCopyAsCurl) return false;
        found.entry.actions.onCopyAsCurl();
        return true;
      },
    },
  ];
}

// ───── Public extension factory ─────

export function createHttpBlockExtension(): Extension {
  let cachedBlocks: HttpFencedBlock[] = [];
  let lastBlockCount = 0;

  const field = StateField.define<DecorationSet>({
    create(state) {
      cachedBlocks = findHttpBlocks(state.doc);
      lastBlockCount = cachedBlocks.length;
      syncRegistryBlocks(cachedBlocks);
      return buildHttpDecorations(state, cachedBlocks);
    },
    update(decos, tr) {
      if (tr.docChanged) {
        const newCount = countHttpBlocks(tr.state.doc);
        if (newCount !== lastBlockCount) {
          lastBlockCount = newCount;
        }
        cachedBlocks = findHttpBlocks(tr.state.doc);
        syncRegistryBlocks(cachedBlocks);
        return buildHttpDecorations(tr.state, cachedBlocks);
      }
      if (tr.selection) {
        const oldPos = tr.startState.selection.main.head;
        const newPos = tr.state.selection.main.head;
        const crossed = cachedBlocks.some((b) => {
          const oldInside = oldPos >= b.from && oldPos <= b.to;
          const newInside = newPos >= b.from && newPos <= b.to;
          return oldInside !== newInside;
        });
        if (crossed) {
          return buildHttpDecorations(tr.state, cachedBlocks);
        }
      }
      return decos;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  const httpKeymap = Prec.high(keymap.of(makeKeymap(() => cachedBlocks)));

  return [field, httpKeymap];
}

// ───── Autocomplete source ─────

/**
 * `{{ref}}` completion inside an HTTP block body — block aliases above the
 * cursor + non-secret env-variable keys. Reuses the generic completion
 * source from `cm-autocomplete.ts`.
 */
export function createHttpBlockCompletionSource(
  getFilePath: () => string | undefined,
): CompletionSource {
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const pos = ctx.pos;
    const blocks = findHttpBlocks(ctx.state.doc);
    const inside = blocks.find((b) => pos >= b.bodyFrom && pos <= b.bodyTo);
    if (!inside) return null;

    const filePath = getFilePath();
    if (!filePath) return null;

    const contexts = await collectBlocksAboveCM(
      ctx.state.doc,
      inside.from,
      filePath,
    );
    const envVars = await useEnvironmentStore
      .getState()
      .getActiveVariables();
    const envKeys = Object.keys(envVars);

    const source = createReferenceCompletionSource(
      () => contexts,
      () => envKeys,
    );
    return source(ctx);
  };
}
