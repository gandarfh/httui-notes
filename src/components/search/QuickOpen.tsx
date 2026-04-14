import { useState, useCallback, useEffect, useRef } from "react";
import { Box, Flex, Input, Portal, Text } from "@chakra-ui/react";
import { searchFiles } from "@/lib/tauri/commands";
import type { SearchResult } from "@/lib/tauri/commands";
import { LuFileText } from "react-icons/lu";

interface QuickOpenProps {
  open: boolean;
  onClose: () => void;
  vaultPath: string | null;
  onSelectFile: (filePath: string) => void;
}

export function QuickOpen({
  open,
  onClose,
  vaultPath,
  onSelectFile,
}: QuickOpenProps) {
  if (!open) return null;

  return (
    <QuickOpenInner
      onClose={onClose}
      vaultPath={vaultPath}
      onSelectFile={onSelectFile}
    />
  );
}

function QuickOpenInner({
  onClose,
  vaultPath,
  onSelectFile,
}: Omit<QuickOpenProps, "open">) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  // Load all files on mount
  useEffect(() => {
    if (vaultPath) {
      searchFiles(vaultPath, "").then(setResults).catch(() => {});
    }
  }, [vaultPath]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

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
        onSelectFile(result.path);
      }
    },
    [results, onSelectFile, onClose],
  );

  const safeIndex =
    results.length === 0 ? 0 : Math.min(selectedIndex, results.length - 1);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = (safeIndex + 1) % results.length;
        setSelectedIndex(next);
        itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const next = (safeIndex + results.length - 1) % results.length;
        setSelectedIndex(next);
        itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
      }
      if (e.key === "Enter") {
        e.preventDefault();
        handleSelect(safeIndex);
      }
    },
    [safeIndex, results.length, handleSelect],
  );

  return (
    <Portal>
      {/* Backdrop */}
      <Box
        ref={backdropRef}
        position="fixed"
        inset={0}
        bg="blackAlpha.400"
        zIndex={9998}
        onClick={onClose}
      />
      {/* Panel */}
      <Box
        position="fixed"
        top="80px"
        left="50%"
        transform="translateX(-50%)"
        w="500px"
        maxW="90vw"
        bg="bg.panel"
        borderWidth="1px"
        borderColor="border"
        rounded="lg"
        shadow="2xl"
        zIndex={9999}
        overflow="hidden"
      >
        <Box p={2}>
          <Input
            ref={inputRef}
            placeholder="Buscar arquivo..."
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            size="md"
            variant="flushed"
            autoComplete="off"
          />
        </Box>
        <Box maxH="300px" overflowY="auto" pb={1}>
          {results.length === 0 && query && (
            <Flex px={3} py={4} justify="center">
              <Text fontSize="sm" color="fg.muted">
                Nenhum resultado
              </Text>
            </Flex>
          )}
          {results.map((result, index) => (
            <Flex
              key={result.path}
              ref={(el: HTMLDivElement | null) => {
                itemRefs.current[index] = el;
              }}
              align="center"
              gap={2}
              px={3}
              py={1.5}
              mx={1}
              rounded="md"
              cursor="pointer"
              bg={index === safeIndex ? "bg.emphasized" : "transparent"}
              _hover={{ bg: "bg.emphasized" }}
              onClick={() => handleSelect(index)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <LuFileText size={14} />
              <Box flex={1}>
                <Text fontSize="sm" color="fg">
                  {result.name}
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  {result.path}
                </Text>
              </Box>
            </Flex>
          ))}
        </Box>
      </Box>
    </Portal>
  );
}
