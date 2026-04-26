import { useMemo } from "react";
import { searchContent } from "@/lib/tauri/commands";
import type { ContentSearchResult } from "@/lib/tauri/commands";
import { useDebounceSearch } from "./useDebounceSearch";

interface UseContentSearchOpts {
  onSelect: (filePath: string) => void;
  onClose: () => void;
}

export function useContentSearch({ onSelect, onClose }: UseContentSearchOpts) {
  const base = useDebounceSearch<ContentSearchResult>({
    searchFn: (q) => {
      const trimmed = q.trim();
      return trimmed ? searchContent(trimmed) : null;
    },
    debounceMs: 150,
    onSelect: (r) => onSelect(r.file_path),
    onClose,
  });

  const grouped = useMemo(
    () =>
      base.results.reduce<Record<string, ContentSearchResult[]>>((acc, r) => {
        if (!acc[r.file_path]) acc[r.file_path] = [];
        acc[r.file_path].push(r);
        return acc;
      }, {}),
    [base.results],
  );

  return { ...base, grouped };
}
