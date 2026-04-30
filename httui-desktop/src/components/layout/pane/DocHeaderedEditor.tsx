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

import { Box } from "@chakra-ui/react";

import { MarkdownEditor } from "@/components/editor/MarkdownEditor";
import { ConflictBanner } from "../ConflictBanner";
import { DocHeaderShell } from "../docheader/DocHeaderShell";
import { useFileDocHeaderCompact } from "@/hooks/useFileDocHeaderCompact";

export interface DocHeaderedEditorProps {
  filePath: string;
  vaultPath: string;
  content: string;
  vimEnabled: boolean;
  showConflict: boolean;
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
  onConflictReload,
  onConflictKeep,
  onChange,
  onNavigateFile,
}: DocHeaderedEditorProps) {
  const { compact, setCompact } = useFileDocHeaderCompact(vaultPath, filePath);

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
        compact={compact}
        onToggleCompact={() => {
          void setCompact(!compact);
        }}
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
