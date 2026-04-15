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

// HTTP executable blocks
turndown.addRule("httpBlock", {
  filter: (node) => {
    return (
      node.nodeName === "DIV" &&
      node.getAttribute("data-type") === "http-block"
    );
  },
  replacement: (_content, node) => {
    const content = (node as HTMLElement).getAttribute("data-content") || "";
    return `\n\`\`\`http\n${content}\n\`\`\`\n`;
  },
});

// GFM pipe tables
turndown.addRule("table", {
  filter: "table",
  replacement: (_content, node) => {
    const table = node as HTMLTableElement;
    const rows: string[][] = [];

    table.querySelectorAll("tr").forEach((tr) => {
      const cells: string[] = [];
      tr.querySelectorAll("th, td").forEach((cell) => {
        cells.push((cell.textContent || "").trim());
      });
      rows.push(cells);
    });

    if (rows.length === 0) return "";

    const colCount = Math.max(...rows.map((r) => r.length));
    const colWidths = Array.from({ length: colCount }, (_, i) =>
      Math.max(3, ...rows.map((r) => (r[i] || "").length)),
    );

    const formatRow = (cells: string[]) =>
      "| " +
      Array.from({ length: colCount }, (_, i) =>
        (cells[i] || "").padEnd(colWidths[i]),
      ).join(" | ") +
      " |";

    const separator =
      "| " +
      colWidths.map((w) => "-".repeat(w)).join(" | ") +
      " |";

    const lines = [formatRow(rows[0]), separator];
    for (let i = 1; i < rows.length; i++) {
      lines.push(formatRow(rows[i]));
    }

    return "\n\n" + lines.join("\n") + "\n\n";
  },
});

// Mermaid diagram blocks
turndown.addRule("mermaidBlock", {
  filter: (node) => {
    return (
      node.nodeName === "DIV" &&
      node.getAttribute("data-type") === "mermaid"
    );
  },
  replacement: (_content, node) => {
    const content = (node as HTMLElement).getAttribute("data-content") || "";
    return `\n\`\`\`mermaid\n${content}\n\`\`\`\n`;
  },
});

// Math inline ($...$)
turndown.addRule("mathInline", {
  filter: (node) => {
    return (
      node.nodeName === "SPAN" &&
      node.getAttribute("data-type") === "math-inline"
    );
  },
  replacement: (_content, node) => {
    const content = (node as HTMLElement).getAttribute("data-content") || "";
    return `$${content}$`;
  },
});

// Math block ($$...$$)
turndown.addRule("mathBlock", {
  filter: (node) => {
    return (
      node.nodeName === "DIV" &&
      node.getAttribute("data-type") === "math-block"
    );
  },
  replacement: (_content, node) => {
    const content = (node as HTMLElement).getAttribute("data-content") || "";
    return `\n$$${content}$$\n`;
  },
});

// Wikilinks ([[target]] or [[target|label]])
turndown.addRule("wikilink", {
  filter: (node) => {
    return (
      node.nodeName === "SPAN" &&
      node.getAttribute("data-type") === "wikilink"
    );
  },
  replacement: (_content, node) => {
    const target = (node as HTMLElement).getAttribute("data-target") || "";
    const label = (node as HTMLElement).getAttribute("data-label") || "";
    if (label && label !== target) {
      return `[[${target}|${label}]]`;
    }
    return `[[${target}]]`;
  },
});

// Prevent turndown from processing table sub-elements individually
turndown.addRule("tableCell", {
  filter: ["thead", "tbody", "tfoot", "tr", "th", "td"],
  replacement: (content) => content,
});

/**
 * Convert HTML (from TipTap) to markdown for filesystem storage.
 */
export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html);
}
