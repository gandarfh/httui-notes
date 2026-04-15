/**
 * Compute SHA-256 hash of block content for cache invalidation.
 * Uses Web Crypto API (available in Tauri webview).
 */
export async function hashBlockContent(content: string): Promise<string> {
  const encoded = new TextEncoder().encode(content);
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
