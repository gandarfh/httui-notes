import {
  useState,
  useCallback,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Box, Flex, Text, Kbd } from "@chakra-ui/react";
import type { Editor, Range } from "@tiptap/core";

export interface SlashMenuItem {
  title: string;
  icon: string;
  shortcut?: string;
  command: (props: { editor: Editor; range: Range }) => void;
}

interface SlashMenuProps {
  items: SlashMenuItem[];
  command: (item: SlashMenuItem) => void;
}

export const SlashMenu = forwardRef<
  { onKeyDown: (props: { event: KeyboardEvent }) => boolean },
  SlashMenuProps
>(function SlashMenu({ items, command }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const safeIndex =
    items.length === 0 ? 0 : Math.min(selectedIndex, items.length - 1);

  const scrollToIndex = useCallback((index: number) => {
    itemRefs.current[index]?.scrollIntoView({ block: "nearest" });
  }, []);

  const selectItem = useCallback(
    (index: number) => {
      const item = items[index];
      if (item) command(item);
    },
    [items, command],
  );

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((i) => {
          const next = (i + items.length - 1) % items.length;
          scrollToIndex(next);
          return next;
        });
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((i) => {
          const next = (i + 1) % items.length;
          scrollToIndex(next);
          return next;
        });
        return true;
      }
      if (event.key === "Enter") {
        selectItem(safeIndex);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) return null;

  return (
    <Box
      ref={scrollRef}
      bg="bg.panel"
      borderWidth="1px"
      borderColor="border"
      rounded="lg"
      shadow="xl"
      w="320px"
      maxH="380px"
      overflowY="auto"
      py={1}
    >
      {/* Header */}
      <Box px={3} py={2}>
        <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
          Blocos basicos
        </Text>
      </Box>

      {/* Items */}
      {items.map((item, index) => (
        <Flex
          key={item.title}
          ref={(el: HTMLDivElement | null) => {
            itemRefs.current[index] = el;
          }}
          as="button"
          w="calc(100% - 8px)"
          mx="1"
          align="center"
          gap={3}
          px={2}
          py={2}
          cursor="pointer"
          rounded="md"
          borderWidth="2px"
          borderColor={index === safeIndex ? "brand.400" : "transparent"}
          bg={index === safeIndex ? "bg.subtle" : "transparent"}
          _hover={{ bg: "bg.subtle" }}
          onClick={() => selectItem(index)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <Text
            fontSize="sm"
            fontWeight="medium"
            color="fg.muted"
            w="28px"
            textAlign="center"
            flexShrink={0}
            fontFamily="mono"
          >
            {item.icon}
          </Text>
          <Text fontSize="sm" color="fg" flex={1} textAlign="left">
            {item.title}
          </Text>
          {item.shortcut && (
            <Kbd size="sm" variant="outline" color="fg.subtle">
              {item.shortcut}
            </Kbd>
          )}
        </Flex>
      ))}

      {/* Footer */}
      <Flex
        px={3}
        py={2}
        mt={1}
        borderTopWidth="1px"
        borderColor="border"
        align="center"
        justify="space-between"
      >
        <Text fontSize="xs" color="fg.muted">
          Fechar menu
        </Text>
        <Kbd size="sm" variant="outline" color="fg.subtle">
          esc
        </Kbd>
      </Flex>
    </Box>
  );
});
