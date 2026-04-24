import { invoke } from "@tauri-apps/api/core";

/**
 * Compute block hash server-side, including environment + connection context.
 * T31: Hash includes active environment ID and connection ID for cache isolation.
 * T35: Hash computed server-side so frontend cannot spoof it.
 */
export async function hashBlockContent(
  content: string,
  connectionId?: string | null,
): Promise<string> {
  return invoke("compute_block_hash", {
    content,
    connectionId: connectionId ?? null,
  });
}

/**
 * Build the cache hash key for a db block run. Keeps cache entries isolated
 * across active environments by folding in a snapshot of *only* the env vars
 * referenced by the body — so a query that doesn't use any envs has a stable
 * hash regardless of which environment is active.
 *
 * Shared between `DbFencedPanel` (writes the cache on run) and
 * `document.ts#populateCachedResults` (reads the cache when rebuilding the
 * block context graph for `{{ref}}` autocomplete / resolution). Both sides
 * MUST stay in lockstep or reads will miss valid cache entries.
 */
export async function computeDbCacheHash(
  body: string,
  connectionId: string,
  envVars: Record<string, string>,
): Promise<string> {
  const usedEnvEntries = Object.entries(envVars)
    .filter(([k]) => body.includes(`{{${k}}}`))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const keyed = usedEnvEntries
    ? `${body}\n__ENV__\n${usedEnvEntries}`
    : body;
  return hashBlockContent(keyed, connectionId);
}
