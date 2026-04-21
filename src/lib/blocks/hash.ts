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
