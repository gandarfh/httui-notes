import { useState, useCallback, useEffect, useRef } from "react";
import { searchFiles } from "@/lib/tauri/commands";
import type { SearchResult } from "@/lib/tauri/commands";
import { useEscapeClose } from "./useEscapeClose";

interface UseFileSearchOpts {
  vaultPath: string | null;
  onSelect: (filePath: string) => void;
  onClose: () => void;
}

export function useFileSearch({ vaultPath, onSelect, onClose }: UseFileSearchOpts) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEscapeClose(onClose);

  // Load all files on mount
  useEffect(() => {
    if (vaultPath) {
      searchFiles(vaultPath, "").then(setResults).catch(() => {});
    }
  }, [vaultPath]);

  const handleSearch = useCallback(
    (q: string) => {
      setQuery(q);
      setSelectedIndex(0);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (vaultPath) {
          searchFiles(vaultPath, q).then(setResults).catch(() => {});
        }
      }, 100);
    },
    [vaultPath],
  );

  const handleSelect = useCallback(
    (index: number) => {
      const result = results[index];
      if (result) {
        onClose();
        onSelect(result.path);
      }
    },
    [results, onSelect, onClose],
  );

  const safeIndex =
    results.length === 0 ? 0 : Math.min(selectedIndex, results.length - 1);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((safeIndex + 1) % results.length);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((safeIndex + results.length - 1) % results.length);
      }
      if (e.key === "Enter") {
        e.preventDefault();
        handleSelect(safeIndex);
      }
    },
    [safeIndex, results.length, handleSelect],
  );

  return {
    query,
    results,
    selectedIndex,
    safeIndex,
    setSelectedIndex,
    handleSearch,
    handleSelect,
    handleKeyDown,
  };
}
