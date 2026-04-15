import { marked } from "marked";

/**
 * Parse markdown to HTML for TipTap consumption.
 * Preserves custom fenced code blocks (http, db-*, e2e) as-is.
 */
export function markdownToHtml(markdown: string): string {
  // Preserve custom fenced blocks by temporarily replacing them
  const customBlocks: string[] = [];
  const preserved = markdown.replace(
    /```(http|db-[\w:-]+|e2e|mermaid)\n([\s\S]*?)```/g,
    (_match, lang: string, content: string) => {
      const index = customBlocks.length;
      if (lang === "mermaid") {
        customBlocks.push(
          `<div data-type="mermaid" data-content="${escapeAttr(content.trimEnd())}"></div>`,
        );
      } else {
        customBlocks.push(
          `<pre><code class="language-${lang}">${escapeHtml(content.trimEnd())}</code></pre>`,
        );
      }
      return `<!--CUSTOM_BLOCK_${index}-->`;
    },
  );

  // Convert math blocks ($$...$$) before inline math to avoid conflicts
  const withMathBlocks = preserved.replace(
    /\$\$([\s\S]*?)\$\$/g,
    (_match, expr: string) =>
      `<div data-type="math-block" data-content="${escapeAttr(expr.trim())}"></div>`,
  );

  // Convert inline math ($...$) — avoid matching $$
  const withMathInline = withMathBlocks.replace(
    /(?<!\$)\$(?!\$)([^\n$]+?)\$(?!\$)/g,
    (_match, expr: string) =>
      `<span data-type="math-inline" data-content="${escapeAttr(expr.trim())}"></span>`,
  );

  // Convert wikilinks [[target]] or [[target|label]]
  const withWikilinks = withMathInline.replace(
    /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g,
    (_match, target: string, label?: string) => {
      const t = target.trim();
      const l = (label ?? target).trim();
      return `<span data-type="wikilink" data-target="${escapeAttr(t)}" data-label="${escapeAttr(l)}">${escapeHtml(l)}</span>`;
    },
  );

  // Parse standard markdown to HTML
  const html = marked.parse(withWikilinks, { async: false, gfm: true }) as string;

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

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "&#10;");
}
