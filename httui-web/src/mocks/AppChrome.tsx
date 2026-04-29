import type { ReactNode } from "react";
import { Box, Flex, HStack, Text, Badge, Kbd } from "@chakra-ui/react";
import {
  LuMenu,
  LuFolder,
  LuChevronDown,
  LuGlobe,
  LuSearch,
  LuMessageSquare,
  LuMoon,
  LuX,
} from "react-icons/lu";

/**
 * Faithful mock of the real app layout:
 * macOS titlebar → TopBar → Tabs → Content → StatusBar
 *
 * Based on: TopBar.tsx, StatusBar.tsx, PaneNode.tsx
 */

function MockTopBar() {
  return (
    <HStack
      h="48px"
      pl="80px"
      pr={2}
      bg="bg"
      borderBottomWidth="1px"
      borderColor="border"
      justify="space-between"
      flexShrink={0}
    >
      {/* Left */}
      <HStack gap={2}>
        <Box color="fg.muted">
          <LuMenu size={16} />
        </Box>
        <Text fontWeight="semibold" fontSize="sm">
          Notes
        </Text>
      </HStack>

      {/* Center */}
      <HStack gap={2}>
        <HStack
          gap={1.5}
          px={3}
          py={1}
          rounded="md"
          fontSize="sm"
          cursor="default"
          _hover={{ bg: "bg.subtle" }}
        >
          <LuFolder size={14} />
          <Text fontSize="xs">my-api</Text>
          <LuChevronDown size={12} />
        </HStack>

        <HStack
          gap={1.5}
          px={3}
          py={1}
          rounded="md"
          fontSize="sm"
          cursor="default"
          _hover={{ bg: "bg.subtle" }}
        >
          <LuGlobe size={14} />
          <Text fontSize="xs">local</Text>
          <Badge size="xs" colorPalette="green" variant="subtle">
            active
          </Badge>
          <LuChevronDown size={12} />
        </HStack>
      </HStack>

      {/* Right */}
      <HStack gap={1} color="fg.muted">
        <Box p={1.5} rounded="md" cursor="default">
          <LuSearch size={16} />
        </Box>
        <Box p={1.5} rounded="md" cursor="default" color="brand.400">
          <LuMessageSquare size={16} />
        </Box>
        <Box p={1.5} rounded="md" cursor="default">
          <LuMoon size={16} />
        </Box>
      </HStack>
    </HStack>
  );
}

function MockTabs() {
  return (
    <HStack
      h="32px"
      bg="bg.subtle"
      borderBottomWidth="1px"
      borderColor="border"
      gap={0}
      px={0}
      flexShrink={0}
    >
      <HStack
        gap={1.5}
        px={3}
        h="100%"
        bg="bg"
        borderRightWidth="1px"
        borderColor="border"
        fontSize="xs"
        color="fg"
        cursor="default"
      >
        <Text>api-docs.md</Text>
        <Box color="fg.muted">
          <LuX size={10} />
        </Box>
      </HStack>
    </HStack>
  );
}

function MockStatusBar() {
  return (
    <HStack
      h="24px"
      px={3}
      justify="space-between"
      bg="bg.muted"
      borderTopWidth="1px"
      borderColor="border"
      fontSize="xs"
      color="fg.subtle"
      userSelect="none"
      flexShrink={0}
    >
      <HStack gap={3}>
        <Badge size="xs" variant="subtle" colorPalette="green">
          VIM
        </Badge>
        <Badge size="xs" variant="outline" colorPalette="gray">
          NORMAL
        </Badge>
        <Text>local</Text>
      </HStack>
      <HStack gap={3}>
        <HStack gap={1}>
          <Kbd size="sm">⌘P</Kbd>
          <Text>search</Text>
        </HStack>
        <HStack gap={1}>
          <Kbd size="sm">⌘\</Kbd>
          <Text>split</Text>
        </HStack>
        <Text>UTF-8</Text>
        <Text>Ln 1, Col 1</Text>
      </HStack>
    </HStack>
  );
}

function MockTitleBar() {
  return (
    <Flex align="center" h="28px" px={3} bg="bg.subtle" gap={2}>
      <Flex gap={1.5}>
        <Box w="12px" h="12px" rounded="full" bg="red.500" />
        <Box w="12px" h="12px" rounded="full" bg="yellow.500" />
        <Box w="12px" h="12px" rounded="full" bg="green.500" />
      </Flex>
    </Flex>
  );
}

interface AppChromeProps {
  children: ReactNode;
}

export function AppChrome({ children }: AppChromeProps) {
  return (
    <Box
      border="1px solid"
      borderColor="border"
      rounded="xl"
      overflow="hidden"
      bg="bg"
      shadow="0 16px 64px rgba(0,0,0,0.5)"
    >
      <MockTitleBar />
      <MockTopBar />
      <MockTabs />
      <Box p={5} minH="200px" overflowY="auto">
        {children}
      </Box>
      <MockStatusBar />
    </Box>
  );
}
