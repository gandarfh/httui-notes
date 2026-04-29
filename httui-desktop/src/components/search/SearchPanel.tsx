import { useEffect, useRef } from "react";
import { Box, Flex, Input, Portal, Text } from "@chakra-ui/react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useContentSearch } from "@/hooks/useContentSearch";
import { LuFileText, LuSearch } from "react-icons/lu";

interface SearchPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SearchPanel({ open, onClose }: SearchPanelProps) {
  if (!open) return null;
  return <SearchPanelInner onClose={onClose} />;
}

function SearchPanelInner({ onClose }: { onClose: () => void }) {
  const { handleFileSelect } = useWorkspace();
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const {
    query,
    results,
    grouped,
    safeIndex,
    setSelectedIndex,
    handleSearch,
    handleSelect,
    handleKeyDown,
  } = useContentSearch({
    onSelect: handleFileSelect,
    onClose,
  });

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    itemRefs.current[safeIndex]?.scrollIntoView({ block: "nearest" });
  }, [safeIndex]);

  let flatIndex = 0;

  return (
    <Portal>
      <Box
        position="fixed"
        inset={0}
        bg="blackAlpha.400"
        zIndex={9998}
        onClick={onClose}
      />
      <Box
        position="fixed"
        top="80px"
        left="50%"
        transform="translateX(-50%)"
        w="600px"
        maxW="90vw"
        bg="bg.panel"
        borderWidth="1px"
        borderColor="border"
        rounded="lg"
        shadow="2xl"
        zIndex={9999}
        overflow="hidden"
      >
        <Flex align="center" gap={2} px={3} py={2} borderBottomWidth="1px" borderColor="border">
          <LuSearch size={16} />
          <Input
            ref={inputRef}
            placeholder="Buscar no conteudo..."
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            size="md"
            variant="flushed"
            autoComplete="off"
          />
        </Flex>
        <Box maxH="400px" overflowY="auto" pb={1}>
          {results.length === 0 && query.trim() && (
            <Flex px={3} py={6} justify="center">
              <Text fontSize="sm" color="fg.muted">
                Nenhum resultado
              </Text>
            </Flex>
          )}
          {results.length === 0 && !query.trim() && (
            <Flex px={3} py={6} justify="center">
              <Text fontSize="sm" color="fg.muted">
                Digite para buscar no conteudo dos arquivos
              </Text>
            </Flex>
          )}
          {Object.entries(grouped).map(([filePath, items]) => (
            <Box key={filePath}>
              <Flex align="center" gap={1.5} px={3} py={1.5} bg="bg.subtle">
                <LuFileText size={12} />
                <Text fontSize="xs" fontWeight="medium" color="fg.subtle">
                  {filePath}
                </Text>
              </Flex>
              {items.map((item) => {
                const idx = flatIndex++;
                return (
                  <Flex
                    key={`${item.file_path}-${idx}`}
                    ref={(el: HTMLDivElement | null) => {
                      itemRefs.current[idx] = el;
                    }}
                    px={4}
                    py={1.5}
                    cursor="pointer"
                    bg={idx === safeIndex ? "bg.emphasized" : "transparent"}
                    _hover={{ bg: "bg.emphasized" }}
                    onClick={() => handleSelect(idx)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <Text
                      fontSize="xs"
                      color="fg.subtle"
                      lineClamp={2}
                      dangerouslySetInnerHTML={{ __html: item.snippet }}
                      css={{
                        "& mark": {
                          bg: "yellow.300/40",
                          color: "fg",
                          rounded: "sm",
                          px: "1px",
                        },
                      }}
                    />
                  </Flex>
                );
              })}
            </Box>
          ))}
        </Box>
        <Flex
          px={3}
          py={1.5}
          borderTopWidth="1px"
          borderColor="border"
          justify="space-between"
        >
          <Text fontSize="xs" color="fg.muted">
            {results.length} resultado{results.length !== 1 ? "s" : ""}
          </Text>
        </Flex>
      </Box>
    </Portal>
  );
}
