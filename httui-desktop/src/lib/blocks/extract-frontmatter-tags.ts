// Epic 52 Story 04 — TS frontmatter tag extraction.
//
// Used by the per-save hook driving `useTagIndexStore.setTagsForFile`
// after a runbook write. Synchronous so the hook can fire during
// the save callback without an extra IPC round-trip — the Rust
// `httui_core::frontmatter::parse_frontmatter` already does the
// authoritative parse on the vault-walker path
// (`scan_vault_tags_cmd`); this is the lightweight per-edit
// counterpart.
//
// Drift contract: if the Rust parser learns block-list `tags:` (the
// canvas-mock schema only specifies the flow shape), this helper
// must learn it too. Cross-checked by `parse_flow_list_returns_empty
// _for_block_list_or_other_shapes` in the Rust tests + the matching
// `extractFrontmatterTags returns [] on block-list shape` test below.
//
// The full frontmatter typed parse stays Rust-side. This helper
// only returns tags because that's the per-save store mutator
// signature; status / owner / title come from the
// `parse_frontmatter_cmd` Tauri command path used by DocHeader.

/** Extract the flow-list `tags:` value from a runbook's YAML
 *  frontmatter. Returns `[]` when the document has no frontmatter,
 *  no `tags:` key, an unrecognised block-list shape, or any other
 *  non-flow value. Tags are unquoted and trimmed; empty entries
 *  (`tags: [a, , b]`) are filtered out. Duplicates within the same
 *  file are deduped (mirrors `useTagIndexStore.loadFromVault`). */
export function extractFrontmatterTags(content: string): string[] {
  const yaml = splitFrontmatterYaml(content);
  if (yaml === null) return [];

  const lines = yaml.split("\n");
  for (const line of lines) {
    // Top-level keys only — indented lines belong to nested
    // structures we don't decode here.
    if (line.startsWith(" ") || line.startsWith("\t")) continue;
    const trimmed = line.replace(/[\r\n]+$/, "");
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx < 0) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    if (key !== "tags") continue;
    const valuePart = trimmed.slice(colonIdx + 1).trim();
    return parseFlowList(valuePart);
  }
  return [];
}

/** Split the YAML region (between the `---` fences) out of the
 *  document. Returns the raw YAML body without the fences, or
 *  `null` when the document doesn't start with `---\n` / `---\r\n`
 *  or has no closing fence. UTF-8 BOM tolerated. */
function splitFrontmatterYaml(content: string): string | null {
  const stripped = content.startsWith("﻿") ? content.slice(1) : content;
  let rest: string;
  if (stripped.startsWith("---\n")) {
    rest = stripped.slice(4);
  } else if (stripped.startsWith("---\r\n")) {
    rest = stripped.slice(5);
  } else {
    return null;
  }

  const buf: string[] = [];
  while (rest.length > 0) {
    const lineEndAbs = rest.indexOf("\n");
    const lineEnd = lineEndAbs < 0 ? rest.length : lineEndAbs + 1;
    const line = rest.slice(0, lineEnd);
    const lineTrimmed = line.replace(/[\r\n]+$/, "");
    if (lineTrimmed === "---") {
      return buf.join("");
    }
    buf.push(line);
    rest = rest.slice(lineEnd);
  }
  // Hit EOF without seeing the closing fence.
  return null;
}

/** Parse a flow-style list `[a, b, "c"]`. Returns `[]` on any other
 *  shape. Quoted strings (single or double) get unquoted; entries
 *  that trim to empty are filtered. Duplicates removed. */
function parseFlowList(value: string): string[] {
  const v = value.trim();
  if (!v.startsWith("[") || !v.endsWith("]")) return [];
  const inner = v.slice(1, -1);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of inner.split(",")) {
    const unquoted = unquote(item.trim());
    if (unquoted === "") continue;
    if (seen.has(unquoted)) continue;
    seen.add(unquoted);
    out.push(unquoted);
  }
  return out;
}

function unquote(value: string): string {
  const v = value.trim();
  if (v.length < 2) return v;
  const first = v[0];
  const last = v[v.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return v.slice(1, -1);
  }
  return v;
}
