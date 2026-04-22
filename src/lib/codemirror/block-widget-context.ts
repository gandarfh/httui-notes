import type { EditorView } from "@codemirror/view";

/**
 * Context passed to block widget React components inside the CM6 editor.
 * Replaces TipTap's NodeViewProps for executable blocks.
 */
export interface BlockWidgetContext {
  /** The CodeMirror EditorView instance — for dispatching transactions */
  view: EditorView;
  /** Character offset of the fenced block opening (```) */
  from: number;
  /** Character offset of the fenced block closing (```) */
  to: number;
  /** Raw content between the fences (JSON string for executable blocks) */
  content: string;
  /** Info string after the language tag (e.g. "alias=req1 displayMode=split") */
  info: string;
  /** Language tag (http | db | db-* | e2e | mermaid) */
  lang: string;
  /** File path of the current document — for cache and reference resolution */
  filePath: string;
  /** Replace the content between the fences with new content */
  updateContent: (newContent: string) => void;
  /** Replace the info string (alias, displayMode, etc.) */
  updateInfo: (newInfo: string) => void;
}

/** Extract alias from a fenced block info string */
export function extractAlias(info: string): string | undefined {
  const match = info.match(/alias=(\S+)/);
  return match?.[1];
}

/** Extract displayMode from a fenced block info string */
export function extractDisplayMode(info: string): string | undefined {
  const match = info.match(/displayMode=(\S+)/);
  return match?.[1];
}

/** Build an info string from alias and displayMode */
export function buildInfoString(alias?: string, displayMode?: string): string {
  const parts: string[] = [];
  if (alias) parts.push(`alias=${alias}`);
  if (displayMode) parts.push(`displayMode=${displayMode}`);
  return parts.join(" ");
}

/** Map language string to block type */
export function langToBlockType(lang: string): string {
  if (lang === "http") return "http";
  if (lang === "e2e") return "e2e";
  if (lang === "db" || lang.startsWith("db-")) return "db";
  return lang;
}
