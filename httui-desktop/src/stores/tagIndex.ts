// Epic 52 Story 04 — vault-wide tag index store.
//
// Map of `tag → Set<file_path>` plus per-file reverse index. The
// consumer (vault-open Tauri walker) pushes tags via
// `setTagsForFile(filePath, tags)` after parsing each `.md` file's
// frontmatter; the file watcher (Epic 11) calls the same mutation
// on save. `removeFile(filePath)` drops a file's tags on delete /
// rename-away. The Zustand state itself uses plain records (not
// `Map`/`Set`) so React reactivity works without manual replace.

import { create } from "zustand";
import { devtools } from "zustand/middleware";

import { scanVaultTags } from "@/lib/tauri/tags";

interface TagIndexState {
  /** tag → record of file_path → true (use as a set; values are
   *  `true` so insertion is `bag[path] = true` cheap). */
  byTag: Readonly<Record<string, Readonly<Record<string, true>>>>;
  /** file_path → tags currently applied; lets us compute the diff
   *  cheaply on `setTagsForFile`. */
  byFile: Readonly<Record<string, ReadonlyArray<string>>>;
  setTagsForFile: (filePath: string, tags: ReadonlyArray<string>) => void;
  removeFile: (filePath: string) => void;
  clearAll: () => void;
  /** Bootstrap from the Rust vault walker. Calls
   *  `scan_vault_tags_cmd` for `vaultPath`, replaces every existing
   *  entry, and returns the number of files indexed. Used at
   *  vault-open / vault-switch. Per-file refreshes (file watcher,
   *  post-save) keep using `setTagsForFile`. */
  loadFromVault: (vaultPath: string) => Promise<number>;
  /** Read accessors — return arrays for clean consumer ergonomics. */
  getFilesByTag: (tag: string) => string[];
  getAllTags: () => string[];
}

export const useTagIndexStore = create<TagIndexState>()(
  devtools(
    (set, get) => ({
      byTag: {},
      byFile: {},

      setTagsForFile: (filePath, tags) =>
        set(
          (state) => {
            const oldTags = state.byFile[filePath] ?? [];
            const oldSet = new Set(oldTags);
            const newSet = new Set(tags);
            const toRemove: string[] = [];
            const toAdd: string[] = [];
            for (const t of oldSet) if (!newSet.has(t)) toRemove.push(t);
            for (const t of newSet) if (!oldSet.has(t)) toAdd.push(t);

            const nextByTag: Record<string, Record<string, true>> = {};
            for (const [tag, paths] of Object.entries(state.byTag)) {
              nextByTag[tag] = { ...paths };
            }
            for (const tag of toRemove) {
              const bag = nextByTag[tag];
              if (!bag) continue;
              const { [filePath]: _drop, ...rest } = bag;
              if (Object.keys(rest).length === 0) {
                delete nextByTag[tag];
              } else {
                nextByTag[tag] = rest;
              }
            }
            for (const tag of toAdd) {
              const bag = nextByTag[tag] ?? {};
              nextByTag[tag] = { ...bag, [filePath]: true };
            }

            const nextByFile = { ...state.byFile, [filePath]: tags.slice() };
            return { byTag: nextByTag, byFile: nextByFile };
          },
          undefined,
          "tag-index/setTagsForFile",
        ),

      removeFile: (filePath) =>
        set(
          (state) => {
            const old = state.byFile[filePath];
            if (!old) return state;
            const nextByTag: Record<string, Record<string, true>> = {};
            for (const [tag, paths] of Object.entries(state.byTag)) {
              if (!paths[filePath]) {
                nextByTag[tag] = paths;
                continue;
              }
              const { [filePath]: _drop, ...rest } = paths;
              if (Object.keys(rest).length === 0) {
                continue;
              }
              nextByTag[tag] = rest;
            }
            const { [filePath]: _drop, ...nextByFile } = state.byFile;
            return { byTag: nextByTag, byFile: nextByFile };
          },
          undefined,
          "tag-index/removeFile",
        ),

      clearAll: () => set({ byTag: {}, byFile: {} }, undefined, "tag-index/clearAll"),

      loadFromVault: async (vaultPath) => {
        const entries = await scanVaultTags(vaultPath);
        // Build the maps from scratch in one pass — calling
        // setTagsForFile per entry would dispatch N store updates
        // and N React renders. The walker already filters out files
        // with empty tag lists, so every entry is non-empty.
        const byTag: Record<string, Record<string, true>> = {};
        const byFile: Record<string, ReadonlyArray<string>> = {};
        for (const entry of entries) {
          // Defensive: ignore entries the backend mis-shaped (extra
          // walker calls might surface a future bug here without
          // crashing the whole store load).
          if (!entry || typeof entry.path !== "string" || !Array.isArray(entry.tags)) {
            continue;
          }
          // Dedup tags within a file before indexing — covers
          // user-typed `tags: [foo, foo]`.
          const uniq = Array.from(new Set(entry.tags));
          byFile[entry.path] = uniq;
          for (const tag of uniq) {
            const bag = byTag[tag] ?? {};
            bag[entry.path] = true;
            byTag[tag] = bag;
          }
        }
        set({ byTag, byFile }, undefined, "tag-index/loadFromVault");
        return Object.keys(byFile).length;
      },

      getFilesByTag: (tag) => Object.keys(get().byTag[tag] ?? {}).sort(),
      getAllTags: () => Object.keys(get().byTag).sort(),
    }),
    { name: "tag-index" },
  ),
);
