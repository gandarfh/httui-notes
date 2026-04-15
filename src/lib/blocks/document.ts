import type { Editor } from "@tiptap/core";
import type { BlockContext } from "./references";
import { getBlockResult } from "@/lib/tauri/commands";
import { hashBlockContent } from "./hash";

const EXECUTABLE_BLOCK_TYPES = ["httpBlock", "dbBlock", "e2eBlock"];

/**
 * Collect all executable blocks above a given position in the TipTap document.
 * For each block with an alias, fetches its cached result from SQLite.
 */
export async function collectBlocksAbove(
  editor: Editor,
  beforePos: number,
  filePath: string,
): Promise<BlockContext[]> {
  const { doc } = editor.state;
  const blocks: BlockContext[] = [];

  doc.descendants((node, pos) => {
    if (pos >= beforePos) return false;

    if (EXECUTABLE_BLOCK_TYPES.includes(node.type.name)) {
      const alias = (node.attrs.alias as string) ?? "";
      if (alias) {
        blocks.push({
          alias,
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
