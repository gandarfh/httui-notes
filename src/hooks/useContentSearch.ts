import { useState, useCallback, useRef, useMemo } from "react";
import { searchContent } from "@/lib/tauri/commands";
import type { ContentSearchResult } from "@/lib/tauri/commands";
import { useEscapeClose } from "./useEscapeClose";

interface UseContentSearchOpts {
  onSelect: (filePath: string) => void;
  onClose: () => void;
}

export function useContentSearch({ onSelect, onClose }: UseContentSearchOpts) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContentSearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEscapeClose(onClose);

  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    setSelectedIndex(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (q.trim()) {
        searchContent(q.trim()).then(setResults).catch(() => setResults([]));
      } else {
        setResults([]);
      }
    }, 150);
  }, []);

  const handleSelect = useCallback(
    (index: number) => {
      const result = results[index];
      if (result) {
        onClose();
        onSelect(result.file_path);
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

  const grouped = useMemo(
    () =>
      results.reduce<Record<string, ContentSearchResult[]>>((acc, r) => {
        if (!acc[r.file_path]) acc[r.file_path] = [];
        acc[r.file_path].push(r);
        return acc;
      }, {}),
    [results],
  );

  return {
    query,
    results,
    grouped,
    selectedIndex,
    safeIndex,
    setSelectedIndex,
    handleSearch,
    handleSelect,
    handleKeyDown,
  };
}
