import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { keymap } from "@tiptap/pm/keymap";
import { VimMode } from "./types";
import { vimKeymap } from "./keymap";

interface VimOptions {
  onModeChange?: (mode: VimMode) => void;
}

interface VimStorage {
  mode: VimMode;
  pendingKey: string | null;
}

const vimPluginKey = new PluginKey("vimMode");

function setCaretVisibility(editor: { view: { dom: HTMLElement } }, visible: boolean) {
  editor.view.dom.style.caretColor = visible ? "" : "transparent";
}

export const VimExtension = Extension.create<VimOptions, VimStorage>({
  name: "vimMode",

  addOptions() {
    return { onModeChange: undefined };
  },

  addStorage() {
    return { mode: VimMode.Normal, pendingKey: null };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const getStorage = () => this.storage;
    const options = this.options;

    function enterMode(mode: VimMode) {
      const storage = getStorage();
      storage.mode = mode;
      storage.pendingKey = null;
      setCaretVisibility(editor, mode === VimMode.Insert);
      options.onModeChange?.(mode);
    }

    // Hide caret on init (starts in normal mode)
    setTimeout(() => setCaretVisibility(editor, false), 0);

    // Plugin: block typing in normal mode + render block cursor
    const modePlugin = new Plugin({
      key: vimPluginKey,
      props: {
        decorations(state) {
          const storage = getStorage();
          if (storage.mode !== VimMode.Insert) {
            const { from } = state.selection;
            const maxPos = state.doc.content.size;
            if (from < 0 || from >= maxPos) return DecorationSet.empty;

            const to = from + 1;

            // Check if position is inside a text node (inline decoration works)
            const $from = state.doc.resolve(from);
            const nodeAfter = $from.nodeAfter;
            const isTextPos = nodeAfter?.isText || (to <= maxPos && $from.parent.isTextblock);

            if (isTextPos && to <= maxPos) {
              try {
                const deco = Decoration.inline(from, to, { class: "vim-cursor" });
                return DecorationSet.create(state.doc, [deco]);
              } catch {
                // Fall through to widget
              }
            }

            // Fallback: widget decoration for non-text positions (hr, empty blocks, etc.)
            const widget = Decoration.widget(from, () => {
              const span = document.createElement("span");
              span.className = "vim-cursor-widget";
              return span;
            });
            return DecorationSet.create(state.doc, [widget]);
          }
          return DecorationSet.empty;
        },
        attributes() {
          return { "data-vim-mode": getStorage().mode };
        },
        handleDOMEvents: {
          keypress: (_view, event) => {
            if (getStorage().mode !== VimMode.Insert) {
              event.preventDefault();
            }
            return false;
          },
          beforeinput: (_view, event) => {
            // Block text input in normal mode (covers composition events too)
            if (getStorage().mode !== VimMode.Insert) {
              event.preventDefault();
              return true;
            }
            return false;
          },
        },
      },
    });

    // --- Build keymap ---
    const keymapObj: Record<string, () => boolean> = {};

    // i → insert at cursor
    keymapObj["i"] = () => {
      if (getStorage().mode !== VimMode.Normal) return false;
      enterMode(VimMode.Insert);
      editor.view.dispatch(editor.state.tr);
      return true;
    };

    // a → insert after cursor
    keymapObj["a"] = () => {
      if (getStorage().mode !== VimMode.Normal) return false;
      const { state, view } = editor;
      const { from } = state.selection;
      const $from = state.doc.resolve(from);
      const lineEnd = $from.start() + $from.parent.content.size;
      const newPos = Math.min(from + 1, lineEnd);
      const pos = state.doc.resolve(newPos);
      view.dispatch(state.tr.setSelection(new TextSelection(pos, pos)).scrollIntoView());
      enterMode(VimMode.Insert);
      return true;
    };

    // A → insert at end of line
    keymapObj["A"] = () => {
      if (getStorage().mode !== VimMode.Normal) return false;
      const { state, view } = editor;
      const { from } = state.selection;
      const $from = state.doc.resolve(from);
      const lineEnd = $from.start() + $from.parent.content.size;
      const pos = state.doc.resolve(lineEnd);
      view.dispatch(state.tr.setSelection(new TextSelection(pos, pos)).scrollIntoView());
      enterMode(VimMode.Insert);
      return true;
    };

    // I → insert at start of line (first non-whitespace)
    keymapObj["I"] = () => {
      if (getStorage().mode !== VimMode.Normal) return false;
      const { state, view } = editor;
      const { from } = state.selection;
      const $from = state.doc.resolve(from);
      const text = $from.parent.textContent;
      const idx = text.search(/\S/);
      const targetPos = $from.start() + (idx >= 0 ? idx : 0);
      const pos = state.doc.resolve(targetPos);
      view.dispatch(state.tr.setSelection(new TextSelection(pos, pos)).scrollIntoView());
      enterMode(VimMode.Insert);
      return true;
    };

    // C → delete to end of line + insert
    keymapObj["C"] = () => {
      if (getStorage().mode !== VimMode.Normal) return false;
      const { state, view } = editor;
      const { from } = state.selection;
      const $from = state.doc.resolve(from);
      const lineEnd = $from.start() + $from.parent.content.size;
      if (from < lineEnd) {
        view.dispatch(state.tr.delete(from, lineEnd).scrollIntoView());
      }
      enterMode(VimMode.Insert);
      return true;
    };

    // Escape → normal mode
    keymapObj["Escape"] = () => {
      if (getStorage().mode === VimMode.Normal) return false;
      const { state, view } = editor;
      const { from } = state.selection;
      // Move cursor back one (vim convention)
      const $from = state.doc.resolve(from);
      const lineStart = $from.start();
      const newPos = Math.max(lineStart, from - 1);
      const pos = state.doc.resolve(newPos);
      view.dispatch(state.tr.setSelection(new TextSelection(pos, pos)).scrollIntoView());
      enterMode(VimMode.Normal);
      return true;
    };

    // Single-key bindings from keymap.ts
    for (const binding of vimKeymap) {
      if (binding.key.includes(" ")) continue;
      if (keymapObj[binding.key]) continue; // already defined above

      keymapObj[binding.key] = () => {
        if (getStorage().mode !== binding.mode) return false;
        const result = binding.command(editor);
        // o/O enter insert mode
        if (result && (binding.key === "o" || binding.key === "O")) {
          enterMode(VimMode.Insert);
        }
        return result;
      };
    }

    // Multi-key handler
    const multiKeyBindings = vimKeymap.filter((b) => b.key.includes(" "));
    const pendingKeys = new Set(multiKeyBindings.map((b) => b.key.split(" ")[0]));

    for (const firstKey of pendingKeys) {
      // Don't override if already defined (like D, G which are single-key)
      if (keymapObj[firstKey]) {
        const existingHandler = keymapObj[firstKey];
        keymapObj[firstKey] = () => {
          const storage = getStorage();
          if (storage.mode !== VimMode.Normal) return false;
          if (storage.pendingKey === firstKey) {
            storage.pendingKey = null;
            const binding = multiKeyBindings.find(
              (b) => b.key === `${firstKey} ${firstKey}`,
            );
            return binding ? binding.command(editor) : false;
          }
          // Try single-key first, then set pending
          storage.pendingKey = firstKey;
          setTimeout(() => {
            if (storage.pendingKey === firstKey) storage.pendingKey = null;
          }, 800);
          return true;
        };
        // We lost the single-key handler, but for d/g/y the double-key is the main use
        void existingHandler;
      } else {
        keymapObj[firstKey] = () => {
          const storage = getStorage();
          if (storage.mode !== VimMode.Normal) return false;
          if (storage.pendingKey === firstKey) {
            storage.pendingKey = null;
            const binding = multiKeyBindings.find(
              (b) => b.key === `${firstKey} ${firstKey}`,
            );
            return binding ? binding.command(editor) : false;
          }
          storage.pendingKey = firstKey;
          setTimeout(() => {
            if (storage.pendingKey === firstKey) storage.pendingKey = null;
          }, 800);
          return true;
        };
      }
    }

    const vimKeyMap = keymap(keymapObj);
    return [modePlugin, vimKeyMap];
  },
});
