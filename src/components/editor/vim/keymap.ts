import { TextSelection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/core";
import { VimMode } from "./types";
import type { VimKeyBinding } from "./types";

// --- Helpers ---

function clampToLine(editor: Editor, targetPos: number): number {
  const { state } = editor;
  const $pos = state.doc.resolve(
    Math.max(1, Math.min(targetPos, state.doc.content.size - 1)),
  );
  const lineStart = $pos.start();
  const lineEnd = lineStart + $pos.parent.content.size;
  // In normal mode, cursor sits ON last char (not after it)
  const maxPos = Math.max(lineStart, lineEnd - 1);
  return Math.max(lineStart, Math.min(targetPos, maxPos));
}

function snapToTextblock(editor: Editor, pos: number): number {
  const { state } = editor;
  const maxPos = state.doc.content.size - 1;
  const safePos = Math.max(1, Math.min(pos, maxPos));
  const $pos = state.doc.resolve(safePos);

  // If already inside a textblock, good
  if ($pos.parent.isTextblock) return safePos;

  // Search forward for next textblock position
  for (let p = safePos; p <= maxPos; p++) {
    const $p = state.doc.resolve(p);
    if ($p.parent.isTextblock) return p;
  }

  // Search backward
  for (let p = safePos; p >= 1; p--) {
    const $p = state.doc.resolve(p);
    if ($p.parent.isTextblock) return p;
  }

  return safePos;
}

function moveTo(editor: Editor, pos: number) {
  const { state, view } = editor;
  const safePos = snapToTextblock(editor, pos);
  const resolved = state.doc.resolve(safePos);
  view.dispatch(
    state.tr.setSelection(new TextSelection(resolved, resolved)).scrollIntoView(),
  );
}

// --- Motions ---

function moveRight(editor: Editor): boolean {
  const { state } = editor;
  const { from } = state.selection;
  const target = clampToLine(editor, from + 1);
  if (target === from) return false;
  moveTo(editor, target);
  return true;
}

function moveLeft(editor: Editor): boolean {
  const { state } = editor;
  const { from } = state.selection;
  const $from = state.doc.resolve(from);
  const lineStart = $from.start();
  if (from <= lineStart) return false;
  moveTo(editor, from - 1);
  return true;
}

function moveDown(editor: Editor): boolean {
  // Walk through document positions to find the next textblock
  const { state } = editor;
  const { from } = state.selection;
  const $from = state.doc.resolve(from);

  // Get current block boundaries
  const depth = $from.depth;
  let blockEnd: number;
  try {
    blockEnd = $from.end(depth);
  } catch {
    blockEnd = from;
  }

  // Search forward from after current block for next valid text position
  const maxPos = state.doc.content.size;
  for (let pos = blockEnd + 1; pos <= maxPos; pos++) {
    try {
      const $pos = state.doc.resolve(pos);
      if ($pos.parent.isTextblock) {
        // Found next textblock — position at start or matching column
        const offsetInLine = from - $from.start();
        const targetOffset = Math.min(offsetInLine, Math.max(0, $pos.parent.content.size - 1));
        moveTo(editor, $pos.start() + Math.max(0, targetOffset));
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

function moveUp(editor: Editor): boolean {
  // Walk backwards through document positions to find the previous textblock
  const { state } = editor;
  const { from } = state.selection;
  const $from = state.doc.resolve(from);

  // Get current block boundaries
  const depth = $from.depth;
  let blockStart: number;
  try {
    blockStart = $from.start(depth);
  } catch {
    blockStart = from;
  }

  // Search backward from before current block for previous valid text position
  for (let pos = blockStart - 1; pos >= 0; pos--) {
    try {
      const $pos = state.doc.resolve(pos);
      if ($pos.parent.isTextblock) {
        // Found previous textblock — position at matching column
        const offsetInLine = from - $from.start();
        const targetOffset = Math.min(offsetInLine, Math.max(0, $pos.parent.content.size - 1));
        moveTo(editor, $pos.start() + Math.max(0, targetOffset));
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

function wordForward(editor: Editor): boolean {
  const { state } = editor;
  const { from } = state.selection;
  const $from = state.doc.resolve(from);
  const text = $from.parent.textContent;
  const offset = from - $from.start();
  const separators = " \t\n`~!@#$%^&*()-=+[{]}\\|;:'\",.<>/?";

  let foundSep = false;
  for (let i = offset; i < text.length; i++) {
    if (separators.includes(text[i])) foundSep = true;
    if (foundSep && !separators.includes(text[i])) {
      moveTo(editor, $from.start() + i);
      return true;
    }
  }
  // Jump to end of line
  moveTo(editor, clampToLine(editor, $from.start() + text.length));
  return true;
}

function wordBackward(editor: Editor): boolean {
  const { state } = editor;
  const { from } = state.selection;
  const $from = state.doc.resolve(from);
  const text = $from.parent.textContent;
  const offset = from - $from.start();
  const separators = " \t\n`~!@#$%^&*()-=+[{]}\\|;:'\",.<>/?";

  for (let i = offset - 2; i >= 0; i--) {
    if (separators.includes(text[i]) && !separators.includes(text[i + 1])) {
      moveTo(editor, $from.start() + i + 1);
      return true;
    }
  }
  moveTo(editor, $from.start());
  return true;
}

function wordEnd(editor: Editor): boolean {
  const { state } = editor;
  const { from } = state.selection;
  const $from = state.doc.resolve(from);
  const text = $from.parent.textContent;
  const offset = from - $from.start();
  const separators = " \t\n`~!@#$%^&*()-=+[{]}\\|;:'\",.<>/?";

  let inWord = false;
  for (let i = offset + 1; i < text.length; i++) {
    if (!separators.includes(text[i])) inWord = true;
    if (inWord && (i + 1 >= text.length || separators.includes(text[i + 1]))) {
      moveTo(editor, $from.start() + i);
      return true;
    }
  }
  moveTo(editor, clampToLine(editor, $from.start() + text.length));
  return true;
}

function lineStart(editor: Editor): boolean {
  const { state } = editor;
  const { from } = state.selection;
  const $from = state.doc.resolve(from);
  moveTo(editor, $from.start());
  return true;
}

function lineEnd(editor: Editor): boolean {
  const { state } = editor;
  const { from } = state.selection;
  const $from = state.doc.resolve(from);
  const endPos = $from.start() + Math.max(0, $from.parent.content.size - 1);
  moveTo(editor, endPos);
  return true;
}

function firstNonWhitespace(editor: Editor): boolean {
  const { state } = editor;
  const { from } = state.selection;
  const $from = state.doc.resolve(from);
  const text = $from.parent.textContent;
  const idx = text.search(/\S/);
  moveTo(editor, $from.start() + (idx >= 0 ? idx : 0));
  return true;
}

function docStart(editor: Editor): boolean {
  moveTo(editor, 1);
  return true;
}

function docEnd(editor: Editor): boolean {
  const { state } = editor;
  // Go to last line, first char
  const lastChild = state.doc.lastChild;
  if (!lastChild) return false;
  const pos = state.doc.content.size - lastChild.nodeSize + 1;
  moveTo(editor, pos);
  return true;
}

// --- Actions ---

function deleteChar(editor: Editor): boolean {
  const { state, view } = editor;
  const { from } = state.selection;
  const $from = state.doc.resolve(from);
  const lineEnd = $from.start() + $from.parent.content.size;
  if (from >= lineEnd) return false;
  view.dispatch(state.tr.delete(from, from + 1).scrollIntoView());
  return true;
}

function deleteLine(editor: Editor): boolean {
  const { state, view } = editor;
  const { from } = state.selection;
  const $from = state.doc.resolve(from);
  const start = $from.before();
  const end = $from.after();
  view.dispatch(state.tr.delete(start, end).scrollIntoView());
  return true;
}

function deleteToEndOfLine(editor: Editor): boolean {
  const { state, view } = editor;
  const { from } = state.selection;
  const $from = state.doc.resolve(from);
  const lineEnd = $from.start() + $from.parent.content.size;
  if (from >= lineEnd) return false;
  view.dispatch(state.tr.delete(from, lineEnd).scrollIntoView());
  return true;
}

function joinLines(editor: Editor): boolean {
  const { state, view } = editor;
  const { from } = state.selection;
  const $from = state.doc.resolve(from);
  const afterBlock = $from.after();
  if (afterBlock >= state.doc.content.size) return false;
  // Delete the boundary between current and next block, add space
  const lineEnd = $from.start() + $from.parent.content.size;
  view.dispatch(
    state.tr
      .delete(lineEnd, afterBlock + 1)
      .insertText(" ", lineEnd)
      .scrollIntoView(),
  );
  return true;
}

function newLineBelow(editor: Editor): boolean {
  const { state, view } = editor;
  const { from } = state.selection;
  const $from = state.doc.resolve(from);
  const after = $from.after();
  const tr = state.tr.insert(after, state.schema.nodes.paragraph.create());
  const pos = tr.doc.resolve(after + 1);
  view.dispatch(tr.setSelection(new TextSelection(pos, pos)).scrollIntoView());
  return true;
}

function newLineAbove(editor: Editor): boolean {
  const { state, view } = editor;
  const { from } = state.selection;
  const $from = state.doc.resolve(from);
  const before = $from.before();
  const tr = state.tr.insert(before, state.schema.nodes.paragraph.create());
  const pos = tr.doc.resolve(before + 1);
  view.dispatch(tr.setSelection(new TextSelection(pos, pos)).scrollIntoView());
  return true;
}

async function pasteFromClipboard(editor: Editor): Promise<boolean> {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      const { state, view } = editor;
      const { from } = state.selection;
      view.dispatch(state.tr.insertText(text, from + 1).scrollIntoView());
      return true;
    }
  } catch {
    // Clipboard access denied
  }
  return false;
}

function copyLine(editor: Editor): boolean {
  const { state } = editor;
  const { from } = state.selection;
  const $from = state.doc.resolve(from);
  const text = $from.parent.textContent;
  navigator.clipboard.writeText(text + "\n").catch(() => {});
  return true;
}

// --- Visual mode helpers ---

function getVisualAnchor(editor: Editor): number | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storage = (editor.storage as any)?.vimMode as { visualAnchor?: number | null } | undefined;
  return storage?.visualAnchor ?? null;
}

function visualMove(editor: Editor, newHead: number): boolean {
  const anchor = getVisualAnchor(editor);
  if (anchor === null) return false;
  const { state, view } = editor;
  const size = state.doc.content.size;
  const safeHead = Math.max(1, Math.min(newHead, size - 1));
  // Selection extends from anchor to head+1 (visual covers the char under cursor)
  const from = Math.min(anchor, safeHead);
  const to = Math.max(anchor, safeHead) + 1;
  const safeTo = Math.min(to, size);
  const $anchor = state.doc.resolve(from);
  const $head = state.doc.resolve(safeTo);
  view.dispatch(state.tr.setSelection(new TextSelection($anchor, $head)).scrollIntoView());
  return true;
}

function visualMoveRight(editor: Editor): boolean {
  const { state } = editor;
  const head = state.selection.to - 1; // to is exclusive
  const $head = state.doc.resolve(head);
  const lineEnd = $head.start() + $head.parent.content.size;
  if (head >= lineEnd - 1) return false;
  return visualMove(editor, head + 1);
}

function visualMoveLeft(editor: Editor): boolean {
  const { state } = editor;
  const head = state.selection.to - 1;
  const $head = state.doc.resolve(head);
  if (head <= $head.start()) return false;
  return visualMove(editor, head - 1);
}

function visualMoveDown(editor: Editor): boolean {
  const { state } = editor;
  const head = state.selection.to - 1;
  const $head = state.doc.resolve(head);
  const depth = $head.depth;
  let blockEnd: number;
  try { blockEnd = $head.end(depth); } catch { blockEnd = head; }
  const maxPos = state.doc.content.size;
  for (let pos = blockEnd + 1; pos <= maxPos; pos++) {
    try {
      const $pos = state.doc.resolve(pos);
      if ($pos.parent.isTextblock) {
        const offsetInLine = head - $head.start();
        const targetOffset = Math.min(offsetInLine, Math.max(0, $pos.parent.content.size - 1));
        return visualMove(editor, $pos.start() + Math.max(0, targetOffset));
      }
    } catch { continue; }
  }
  return false;
}

function visualMoveUp(editor: Editor): boolean {
  const { state } = editor;
  const head = state.selection.to - 1;
  const $head = state.doc.resolve(head);
  const depth = $head.depth;
  let blockStart: number;
  try { blockStart = $head.start(depth); } catch { blockStart = head; }
  for (let pos = blockStart - 1; pos >= 0; pos--) {
    try {
      const $pos = state.doc.resolve(pos);
      if ($pos.parent.isTextblock) {
        const offsetInLine = head - $head.start();
        const targetOffset = Math.min(offsetInLine, Math.max(0, $pos.parent.content.size - 1));
        return visualMove(editor, $pos.start() + Math.max(0, targetOffset));
      }
    } catch { continue; }
  }
  return false;
}

function visualDelete(editor: Editor): boolean {
  const { state, view } = editor;
  const { from, to } = state.selection;
  if (from === to) return false;
  view.dispatch(state.tr.delete(from, to).scrollIntoView());
  return true;
}

function visualCopy(editor: Editor): boolean {
  const { state } = editor;
  const { from, to } = state.selection;
  if (from === to) return false;
  const text = state.doc.textBetween(from, to);
  navigator.clipboard.writeText(text).catch(() => {});
  return true;
}

// --- Keymap ---

export const vimKeymap: VimKeyBinding[] = [
  // Motions
  { key: "h", mode: VimMode.Normal, command: moveLeft },
  { key: "l", mode: VimMode.Normal, command: moveRight },
  { key: "j", mode: VimMode.Normal, command: moveDown },
  { key: "k", mode: VimMode.Normal, command: moveUp },
  { key: "w", mode: VimMode.Normal, command: wordForward },
  { key: "b", mode: VimMode.Normal, command: wordBackward },
  { key: "e", mode: VimMode.Normal, command: wordEnd },
  { key: "0", mode: VimMode.Normal, command: lineStart },
  { key: "$", mode: VimMode.Normal, command: lineEnd },
  { key: "^", mode: VimMode.Normal, command: firstNonWhitespace },
  { key: "G", mode: VimMode.Normal, command: docEnd },

  // Actions
  { key: "x", mode: VimMode.Normal, command: deleteChar },
  { key: "D", mode: VimMode.Normal, command: deleteToEndOfLine },
  { key: "J", mode: VimMode.Normal, command: joinLines },
  { key: "u", mode: VimMode.Normal, command: (ed) => ed.commands.undo() },
  { key: "Ctrl-r", mode: VimMode.Normal, command: (ed) => ed.commands.redo() },
  { key: "o", mode: VimMode.Normal, command: newLineBelow },
  { key: "O", mode: VimMode.Normal, command: newLineAbove },
  {
    key: "p",
    mode: VimMode.Normal,
    command: (ed) => {
      pasteFromClipboard(ed);
      return true;
    },
  },

  // Multi-key (handled in extension)
  { key: "d d", mode: VimMode.Normal, command: deleteLine },
  { key: "g g", mode: VimMode.Normal, command: docStart },
  { key: "y y", mode: VimMode.Normal, command: copyLine },

  // Visual mode — motions
  { key: "h", mode: VimMode.Visual, command: visualMoveLeft },
  { key: "l", mode: VimMode.Visual, command: visualMoveRight },
  { key: "j", mode: VimMode.Visual, command: visualMoveDown },
  { key: "k", mode: VimMode.Visual, command: visualMoveUp },

  // Visual mode — actions
  { key: "d", mode: VimMode.Visual, command: visualDelete },
  { key: "x", mode: VimMode.Visual, command: visualDelete },
  { key: "y", mode: VimMode.Visual, command: visualCopy },
];
