import { marked } from "marked";

/**
 * Parse markdown to HTML for TipTap consumption.
 * Preserves custom fenced code blocks (http, db-*, e2e) as-is.
 */
export function markdownToHtml(markdown: string): string {
  // Preserve custom fenced blocks by temporarily replacing them
  const customBlocks: string[] = [];
  const preserved = markdown.replace(
    /```(http|db-[\w:-]+|e2e)\n([\s\S]*?)```/g,
    (_match, lang, content) => {
      const index = customBlocks.length;
      customBlocks.push(
        `<pre><code class="language-${lang}">${escapeHtml(content.trimEnd())}</code></pre>`,
      );
      return `<!--CUSTOM_BLOCK_${index}-->`;
    },
  );

  // Parse standard markdown to HTML
  const html = marked.parse(preserved, { async: false, gfm: true }) as string;

  // Restore custom blocks
  return html.replace(
    /<!--CUSTOM_BLOCK_(\d+)-->/g,
    (_match, index) => customBlocks[parseInt(index)],
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
