// Wraps the `<MarkdownEditor>` mount with a `<DocHeaderShell>` card on
// top + the `<ConflictBanner>` (when stale-on-disk). Pulled out of
// `PaneNode` so the per-file `useFileDocHeaderCompact` hook lives at
// the top of a stable component (hooks can't run inside the
// conditional that picks "diff vs file" tab content).
//
// Closes the consumer-side mount carry from Epic 50 Story 06: click
// on the H1 toggles compact mode and persists to
// `.httui/workspace.toml` via the existing
// `set_file_docheader_compact` Tauri command.
//
// Minimum viable mount — `frontmatter` is currently undefined; the
// card falls back to filename-as-H1 (`pickH1Title`). Wiring per-chip
// data (author / branch / last-run summary) + frontmatter parse is
// the next slice and stays in this same component.

import { useEffect, useMemo, useRef } from "react";
import { Box } from "@chakra-ui/react";

import { MarkdownEditor } from "@/components/editor/MarkdownEditor";
import { ConflictBanner } from "../ConflictBanner";
import { DocHeaderShell } from "../docheader/DocHeaderShell";
import type { BranchSummaryData } from "../docheader/docheader-meta";
import { useFileDocHeaderCompact } from "@/hooks/useFileDocHeaderCompact";
import { useFileMtime } from "@/hooks/useFileMtime";
import { useGitStatus } from "@/hooks/useGitStatus";
import { extractFrontmatter } from "@/lib/blocks/extract-frontmatter-tags";
import type { DocHeaderFrontmatter } from "../docheader/docheader-derive";

export interface DocHeaderedEditorProps {
  filePath: string;
  vaultPath: string;
  content: string;
  vimEnabled: boolean;
  showConflict: boolean;
  /** Whether the active tab has unsaved edits (drives the meta-strip
   * `· unsaved` suffix on the `Edited Xm ago` chip). PaneNode reads
   * this from `unsavedFiles.has(filePath)`. */
  dirty: boolean;
  onConflictReload: () => void;
  onConflictKeep: () => void;
  onChange: (content: string) => void;
  onNavigateFile?: (filePath: string) => void;
}

export function DocHeaderedEditor({
  filePath,
  vaultPath,
  content,
  vimEnabled,
  showConflict,
  dirty,
  onConflictReload,
  onConflictKeep,
  onChange,
  onNavigateFile,
}: DocHeaderedEditorProps) {
  const { compact, setCompact } = useFileDocHeaderCompact(vaultPath, filePath);
  const { mtime, refresh: refreshMtime } = useFileMtime(vaultPath, filePath);
  const { status: gitStatus } = useGitStatus(vaultPath);

  // Refresh the mtime poll on the dirty → clean rising edge — this
  // means a save just succeeded (the auto-save path flips
  // `unsavedFiles` from true → false after `writeNote` resolves).
  // Without this, the meta strip would lag until the next focus
  // event arrives, leaving "Edited 2m ago · unsaved" stale on
  // screen post-save.
  const prevDirtyRef = useRef(dirty);
  useEffect(() => {
    if (prevDirtyRef.current && !dirty) {
      refreshMtime();
    }
    prevDirtyRef.current = dirty;
  }, [dirty, refreshMtime]);

  const branch = useMemo<BranchSummaryData | null>(() => {
    if (!gitStatus) return null;
    // Per-file `+N ~M` requires a future Tauri command (`git_diff_stat
    // _for_file`) — for now we only surface the branch name. The
    // BranchSummaryData shape allows zero counts; formatBranchSummary
    // omits them, so the chip just shows "Branch <name>".
    return {
      branch: gitStatus.branch,
      addedLines: 0,
      modifiedLines: 0,
    };
  }, [gitStatus]);

  // Parse frontmatter inline (synchronous TS port of the Rust slice-1
  // schema — title + abstract + tags only). Re-runs every keystroke,
  // but the parser short-circuits on `---\n` absence so the common
  // body-edit case is a single string-prefix check. The Rust
  // `parse_frontmatter` stays the authoritative parser on the vault-
  // walker path; this is the per-edit synchronous counterpart.
  const frontmatter = useMemo<DocHeaderFrontmatter | null>(() => {
    const fm = extractFrontmatter(content);
    if (
      fm.title === undefined &&
      fm.abstract === undefined &&
      fm.tags.length === 0
    ) {
      // No frontmatter at all → null lets the card fall back through
      // first-heading → filename. Distinct from "fenced but empty"
      // which still renders the card chrome.
      return null;
    }
    return {
      title: fm.title,
      abstract: fm.abstract,
      tags: fm.tags,
    };
  }, [content]);

  return (
    <Box
      data-testid="doc-headered-editor"
      flex={1}
      overflow="hidden"
      display="flex"
      flexDirection="column"
    >
      {showConflict && (
        <ConflictBanner
          filePath={filePath}
          onReload={onConflictReload}
          onKeep={onConflictKeep}
        />
      )}
      <DocHeaderShell
        filePath={filePath}
        frontmatter={frontmatter}
        compact={compact}
        onToggleCompact={() => {
          void setCompact(!compact);
        }}
        mtimeMs={mtime}
        dirty={dirty}
        branch={branch}
      />
      <Box flex={1} overflow="hidden">
        <MarkdownEditor
          content={content}
          onChange={onChange}
          filePath={filePath}
          vimEnabled={vimEnabled}
          onNavigateFile={onNavigateFile}
        />
      </Box>
    </Box>
  );
}
