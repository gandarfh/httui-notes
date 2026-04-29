import { Box, HStack, Text } from "@chakra-ui/react";
import {
  LuMessageSquare,
  LuHistory,
  LuChartColumn,
  LuSettings,
  LuFolderSearch,
  LuPaperclip,
  LuSend,
  LuShield,
  LuGitCompareArrows,
  LuCheck,
  LuX,
} from "react-icons/lu";
import { ChatMessageBubble } from "@/components/chat/ChatMessageBubble";
import type { ChatMessage } from "@/lib/tauri/chat";
import { Badge } from "@chakra-ui/react";

/* ── Types ────────────────────────────────────────────── */

interface MockChatPanelProps {
  messages: ChatMessage[];
  permission?: {
    file: string;
    added: number;
    removed: number;
  };
}

/* ── Tab Button ───────────────────────────────────────── */

function TabButton({
  active,
  icon,
  label,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <HStack
      gap={1}
      px={3}
      py={2}
      cursor="default"
      borderBottom="2px solid"
      borderColor={active ? "brand.400" : "transparent"}
      color={active ? "fg" : "fg.muted"}
      fontSize="xs"
      fontWeight={active ? "600" : "400"}
    >
      {icon}
      <Text>{label}</Text>
    </HStack>
  );
}

/* ── Main Chat Panel ──────────────────────────────────── */

export function MockChatPanel({ messages, permission }: MockChatPanelProps) {
  return (
    <Box
      border="1px solid"
      borderColor="border"
      rounded="lg"
      overflow="hidden"
      bg="bg"
    >
      {/* Tab bar */}
      <HStack
        gap={0}
        borderBottom="1px solid"
        borderColor="border"
        flexShrink={0}
      >
        <TabButton active icon={<LuMessageSquare size={13} />} label="Chat" />
        <TabButton
          active={false}
          icon={<LuHistory size={13} />}
          label="Sessions"
        />
        <TabButton
          active={false}
          icon={<LuChartColumn size={13} />}
          label="Usage"
        />
        <Box ml="auto" px={2} cursor="default">
          <LuSettings size={14} color="var(--chakra-colors-fg-muted)" />
        </Box>
      </HStack>

      {/* CWD bar */}
      <HStack
        px={3}
        py={1}
        borderBottom="1px solid"
        borderColor="border"
        fontSize="2xs"
        color="fg.muted"
        gap={1}
      >
        <LuFolderSearch size={10} />
        <Text>~/projects/my-api</Text>
      </HStack>

      {/* Messages — real ChatMessageBubble components */}
      <Box py={2}>
        {messages.map((msg, i) => (
          <ChatMessageBubble key={i} message={msg} />
        ))}
      </Box>

      {/* Permission banner (update_note style — matches real PermissionBanner) */}
      {permission && (
        <Box
          borderTop="1px solid"
          borderColor="orange.500/30"
          bg="orange.500/5"
          px={3}
          py={2}
        >
          <HStack gap={2}>
            <Box color="orange.400" flexShrink={0}>
              <LuShield size={14} />
            </Box>
            <Text fontWeight="medium" fontSize="xs" truncate flex={1}>
              {permission.file}
            </Text>
            {permission.added > 0 && (
              <Badge size="sm" colorPalette="green" variant="subtle">
                +{permission.added}
              </Badge>
            )}
            {permission.removed > 0 && (
              <Badge size="sm" colorPalette="red" variant="subtle">
                -{permission.removed}
              </Badge>
            )}
            <Box
              display="flex"
              alignItems="center"
              gap={1}
              px={2}
              py={0.5}
              rounded="md"
              fontSize="xs"
              fontWeight="medium"
              bg="brand.500"
              color="brand.950"
              cursor="default"
            >
              <LuGitCompareArrows size={12} />
              View Diff
            </Box>
            <Box
              display="flex"
              alignItems="center"
              gap={1}
              px={2}
              py={0.5}
              rounded="md"
              fontSize="xs"
              fontWeight="medium"
              bg="bg.subtle"
              border="1px solid"
              borderColor="border"
              cursor="default"
            >
              <LuX size={12} />
              Deny
            </Box>
            <Box
              display="flex"
              alignItems="center"
              gap={1}
              px={2}
              py={0.5}
              rounded="md"
              fontSize="xs"
              fontWeight="medium"
              bg="green.600"
              color="white"
              cursor="default"
            >
              <LuCheck size={12} />
              Allow
            </Box>
          </HStack>
        </Box>
      )}

      {/* Input area */}
      <HStack px={3} py={2} borderTop="1px solid" borderColor="border" gap={2}>
        <Box color="fg.muted" cursor="default">
          <LuPaperclip size={16} />
        </Box>
        <Box
          flex={1}
          bg="bg.subtle"
          border="1px solid"
          borderColor="border"
          rounded="md"
          px={3}
          py={1.5}
        >
          <Text fontSize="sm" color="fg.muted">
            Message... (Cmd+Enter to send)
          </Text>
        </Box>
        <Box color="fg.muted" cursor="default">
          <LuSend size={16} />
        </Box>
      </HStack>
    </Box>
  );
}
