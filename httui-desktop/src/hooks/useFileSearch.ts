import { searchFiles } from "@/lib/tauri/commands";
import type { SearchResult } from "@/lib/tauri/commands";
import { useDebounceSearch } from "./useDebounceSearch";

interface UseFileSearchOpts {
  vaultPath: string | null;
  onSelect: (filePath: string) => void;
  onClose: () => void;
}

export function useFileSearch({
  vaultPath,
  onSelect,
  onClose,
}: UseFileSearchOpts) {
  return useDebounceSearch<SearchResult>({
    searchFn: (q) => (vaultPath ? searchFiles(vaultPath, q) : null),
    loadOnMount: vaultPath ? () => searchFiles(vaultPath, "") : undefined,
    loadOnMountDeps: [vaultPath],
    debounceMs: 100,
    onSelect: (r) => onSelect(r.path),
    onClose,
  });
}
