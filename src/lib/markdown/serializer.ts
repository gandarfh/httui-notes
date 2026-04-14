import TurndownService from "turndown";

const turndown = new TurndownService({
  headingStyle: "atx",
  hr: "---",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  fence: "```",
  emDelimiter: "*",
  strongDelimiter: "**",
});

// Task lists (checkboxes)
turndown.addRule("taskListItem", {
  filter: (node) => {
    return (
      node.nodeName === "LI" &&
      node.getAttribute("data-type") === "taskItem"
    );
  },
  replacement: (content, node) => {
    const checked = (node as HTMLElement).getAttribute("data-checked") === "true";
    const checkbox = checked ? "[x]" : "[ ]";
    return `${checkbox} ${content.trim()}\n`;
  },
});

// Preserve custom fenced code blocks (http, db-*, e2e)
turndown.addRule("customCodeBlock", {
  filter: (node) => {
    if (node.nodeName !== "PRE") return false;
    const code = node.querySelector("code");
    if (!code) return false;
    const lang = code.className?.replace("language-", "") || "";
    return /^(http|db-|e2e)/.test(lang);
  },
  replacement: (_content, node) => {
    const code = (node as HTMLElement).querySelector("code");
    if (!code) return "";
    const lang = code.className?.replace("language-", "") || "";
    const text = code.textContent || "";
    return `\n\`\`\`${lang}\n${text}\n\`\`\`\n`;
  },
});

/**
 * Convert HTML (from TipTap) to markdown for filesystem storage.
 */
export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html);
}
