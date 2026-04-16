import type { Editor } from "@tiptap/core";
import { parseReferences, resolveAllReferences, type BlockContext } from "./references";
import { collectAllBlocks } from "./document";
import { executeBlock, saveBlockResult } from "@/lib/tauri/commands";
import { hashBlockContent } from "./hash";

const DEPENDENCY_TIMEOUT_MS = 10_000;

export interface DependencyResult {
  blocks: BlockContext[];
  executed: string[]; // aliases of blocks that were executed
}

/**
 * Extract all aliases referenced in block content (URL, headers, body fields).
 */
export function extractReferencedAliases(content: string): string[] {
  // Parse the block data to check all fields
  let data: { url?: string; headers?: { value: string }[]; body?: string };
  try {
    data = JSON.parse(content);
  } catch {
    return [];
  }

  const texts: string[] = [];
  if (data.url) texts.push(data.url);
  if (data.headers) {
    for (const h of data.headers) {
      if (h.value) texts.push(h.value);
    }
  }
  if (data.body) texts.push(data.body);

  const aliases = new Set<string>();
  for (const text of texts) {
    for (const ref of parseReferences(text)) {
      aliases.add(ref.alias);
    }
  }
  return [...aliases];
}

/**
 * Build topological execution order for dependencies.
 * Returns aliases in the order they should be executed.
 * Throws on cycles.
 */
export function topologicalSort(
  targetAliases: string[],
  allBlocks: BlockContext[],
): string[] {
  const blockMap = new Map(allBlocks.map((b) => [b.alias, b]));
  const order: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>(); // cycle detection

  function visit(alias: string) {
    if (visited.has(alias)) return;
    if (visiting.has(alias)) {
      throw new Error(`Circular dependency detected: "${alias}" references itself`);
    }

    const block = blockMap.get(alias);
    if (!block) return; // alias not found, will be caught later by resolveReference

    visiting.add(alias);

    // Find this block's dependencies
    const deps = extractReferencedAliases(block.content);
    for (const dep of deps) {
      visit(dep);
    }

    visiting.delete(alias);
    visited.add(alias);
    order.push(alias);
  }

  for (const alias of targetAliases) {
    visit(alias);
  }

  return order;
}

/**
 * Resolve and execute all dependencies needed by the current block.
 * Executes blocks without cache in topological order.
 * Returns updated block contexts with cached results.
 */
export async function resolveAndExecuteDependencies(
  editor: Editor,
  currentPos: number,
  filePath: string,
  blockContent: string,
  onProgress?: (status: string) => void,
): Promise<DependencyResult> {
  const allBlocks = await collectAllBlocks(editor, filePath);
  const referencedAliases = extractReferencedAliases(blockContent);

  if (referencedAliases.length === 0) {
    return { blocks: allBlocks, executed: [] };
  }

  // Build execution order
  const executionOrder = topologicalSort(referencedAliases, allBlocks);

  // Filter to only blocks that need execution (no cache)
  const blocksToExecute = executionOrder.filter((alias) => {
    const block = allBlocks.find((b) => b.alias === alias);
    return block && !block.cachedResult;
  });

  if (blocksToExecute.length === 0) {
    return { blocks: allBlocks, executed: [] };
  }

  // Execute with timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEPENDENCY_TIMEOUT_MS);
  const executed: string[] = [];

  try {
    for (const alias of blocksToExecute) {
      if (controller.signal.aborted) {
        throw new Error("Dependency resolution timed out");
      }

      const block = allBlocks.find((b) => b.alias === alias);
      if (!block) continue;

      // Verify block is above current position
      if (block.pos >= currentPos) {
        throw new Error(`Dependency "${alias}" is below the current block`);
      }

      onProgress?.(`Executing "${alias}"...`);

      // Parse block data for execution
      let blockData: { url?: string; headers?: { key: string; value: string }[]; body?: string; method?: string; params?: unknown[] };
      try {
        blockData = JSON.parse(block.content);
      } catch {
        throw new Error(`Failed to parse block data for "${alias}"`);
      }

      // Resolve references in the dependency block (its deps are already executed)
      if (blockData.url) {
        const r = resolveAllReferences(blockData.url, allBlocks, block.pos);
        if (r.errors.length > 0) throw new Error(`"${alias}" URL: ${r.errors[0].message}`);
        blockData.url = r.resolved;
      }
      if (blockData.headers) {
        blockData.headers = blockData.headers.map((h) => {
          const r = resolveAllReferences(h.value, allBlocks, block.pos);
          if (r.errors.length > 0) throw new Error(`"${alias}" header "${h.key}": ${r.errors[0].message}`);
          return { ...h, value: r.resolved };
        });
      }
      if (blockData.body) {
        const r = resolveAllReferences(blockData.body, allBlocks, block.pos);
        if (r.errors.length > 0) throw new Error(`"${alias}" body: ${r.errors[0].message}`);
        blockData.body = r.resolved;
      }

      const result = await executeBlock("http", blockData);

      // Save to cache
      const hash = await hashBlockContent(block.content);
      const resultData = result.data as Record<string, unknown>;
      await saveBlockResult(
        filePath,
        hash,
        result.status,
        JSON.stringify(resultData),
        result.duration_ms,
      );

      // Update block context with result
      block.cachedResult = {
        status: result.status,
        response: JSON.stringify(resultData),
      };

      executed.push(alias);
    }
  } finally {
    clearTimeout(timeout);
  }

  return { blocks: allBlocks, executed };
}
