import type { Editor } from "@tiptap/core";
import type { Text as CMText } from "@codemirror/state";
import type { BlockContext } from "./references";
import { getBlockResult } from "@/lib/tauri/commands";
import { hashBlockContent } from "./hash";
import { findFencedBlocks } from "@/lib/codemirror/cm-block-widgets";
import { extractAlias, langToBlockType } from "@/lib/codemirror/block-widget-context";

const EXECUTABLE_BLOCK_TYPES = ["httpBlock", "dbBlock", "e2eBlock"];
const EXECUTABLE_LANGS = ["http", "db", "e2e"];

/**
 * Collect all executable blocks above a given position in the TipTap document.
 * For each block with an alias, fetches its cached result from SQLite.
 * Also accepts a fake editor with __cmView for CM6 compatibility.
 */
export async function collectBlocksAbove(
  editor: Editor,
  beforePos: number,
  filePath: string,
): Promise<BlockContext[]> {
  // Detect CM6 fake editor and route to CM6 version
  const cmView = (editor as unknown as { __cmView?: import("@codemirror/view").EditorView }).__cmView;
  if (cmView) {
    return collectBlocksAboveCM(cmView.state.doc, beforePos, filePath);
  }

  const { doc } = editor.state;
  const blocks: BlockContext[] = [];

  doc.descendants((node, pos) => {
    if (pos >= beforePos) return false;

    if (EXECUTABLE_BLOCK_TYPES.includes(node.type.name)) {
      const alias = (node.attrs.alias as string) ?? "";
      if (alias) {
        blocks.push({
          alias,
          blockType: (node.attrs.blockType as string) ?? "",
          pos,
          content: (node.attrs.content as string) ?? "",
          cachedResult: null,
        });
      }
    }

    return false; // don't descend into children (blocks are top-level)
  });

  // Fetch cached results in parallel
  await Promise.all(
    blocks.map(async (block) => {
      if (!block.content) return;
      try {
        const hash = await hashBlockContent(block.content);
        const cached = await getBlockResult(filePath, hash);
        if (cached) {
          block.cachedResult = {
            status: cached.status,
            response: cached.response,
          };
        }
      } catch {
        // Cache lookup failed, leave as null
      }
    }),
  );

  return blocks;
}

/**
 * Collect ALL executable blocks in the document (for dependency resolution).
 * Unlike collectBlocksAbove, this has no position filter.
 * Also accepts a fake editor with __cmView for CM6 compatibility.
 */
export async function collectAllBlocks(
  editor: Editor,
  filePath: string,
): Promise<BlockContext[]> {
  // Detect CM6 fake editor and route to CM6 version
  const cmView = (editor as unknown as { __cmView?: import("@codemirror/view").EditorView }).__cmView;
  if (cmView) {
    return collectAllBlocksCM(cmView.state.doc, filePath);
  }

  const { doc } = editor.state;
  const blocks: BlockContext[] = [];

  doc.descendants((node, pos) => {
    if (EXECUTABLE_BLOCK_TYPES.includes(node.type.name)) {
      const alias = (node.attrs.alias as string) ?? "";
      if (alias) {
        blocks.push({
          alias,
          blockType: (node.attrs.blockType as string) ?? "",
          pos,
          content: (node.attrs.content as string) ?? "",
          cachedResult: null,
        });
      }
    }
    return false;
  });

  await Promise.all(
    blocks.map(async (block) => {
      if (!block.content) return;
      try {
        const hash = await hashBlockContent(block.content);
        const cached = await getBlockResult(filePath, hash);
        if (cached) {
          block.cachedResult = {
            status: cached.status,
            response: cached.response,
          };
        }
      } catch {
        // Cache lookup failed
      }
    }),
  );

  return blocks;
}

// ---------------------------------------------------------------------------
// CodeMirror 6 variants — work on CM Text (markdown) instead of ProseMirror doc
// ---------------------------------------------------------------------------

/** Check if a fenced block language tag is an executable block type */
function isExecutableLang(lang: string): boolean {
  if (EXECUTABLE_LANGS.includes(lang)) return true;
  if (lang.startsWith("db-")) return true;
  return false;
}

/** Populate cached results for a list of BlockContexts (shared helper) */
async function populateCachedResults(
  blocks: BlockContext[],
  filePath: string,
): Promise<void> {
  await Promise.all(
    blocks.map(async (block) => {
      if (!block.content) return;
      try {
        const hash = await hashBlockContent(block.content);
        const cached = await getBlockResult(filePath, hash);
        if (cached) {
          block.cachedResult = {
            status: cached.status,
            response: cached.response,
          };
        }
      } catch {
        // Cache lookup failed, leave as null
      }
    }),
  );
}

/**
 * Collect all executable blocks above a given position in a CM6 document.
 * CM6 equivalent of collectBlocksAbove (TipTap version).
 */
export async function collectBlocksAboveCM(
  doc: CMText,
  beforePos: number,
  filePath: string,
): Promise<BlockContext[]> {
  const fenced = findFencedBlocks(doc);
  const blocks: BlockContext[] = [];

  for (const fb of fenced) {
    if (fb.to >= beforePos) continue;
    if (!isExecutableLang(fb.lang)) continue;
    const alias = extractAlias(fb.info);
    if (!alias) continue;

    blocks.push({
      alias,
      blockType: langToBlockType(fb.lang),
      pos: fb.from,
      content: fb.content,
      cachedResult: null,
    });
  }

  await populateCachedResults(blocks, filePath);
  return blocks;
}

/**
 * Collect ALL executable blocks in a CM6 document (for dependency resolution).
 * CM6 equivalent of collectAllBlocks (TipTap version).
 */
export async function collectAllBlocksCM(
  doc: CMText,
  filePath: string,
): Promise<BlockContext[]> {
  const fenced = findFencedBlocks(doc);
  const blocks: BlockContext[] = [];

  for (const fb of fenced) {
    if (!isExecutableLang(fb.lang)) continue;
    const alias = extractAlias(fb.info);
    if (!alias) continue;

    blocks.push({
      alias,
      blockType: langToBlockType(fb.lang),
      pos: fb.from,
      content: fb.content,
      cachedResult: null,
    });
  }

  await populateCachedResults(blocks, filePath);
  return blocks;
}
