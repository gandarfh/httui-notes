import { Box, HStack, Text, IconButton } from "@chakra-ui/react";
import { LuPlus, LuTrash2 } from "react-icons/lu";
import { useChatContext } from "@/contexts/ChatContext";

function timeAgo(unixSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - unixSeconds;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function ChatSessionList() {
  const { sessions, activeSessionId, selectSession, createSession, archiveSession } =
    useChatContext();

  return (
    <Box borderBottom="1px solid" borderColor="border" bg="bg">
      <HStack px={2} py={1.5} justify="space-between">
        <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
          Sessions
        </Text>
        <IconButton
          aria-label="New session"
          size="2xs"
          variant="ghost"
          onClick={() => createSession()}
        >
          <LuPlus />
        </IconButton>
      </HStack>

      {sessions.length > 0 && (
        <Box maxH="160px" overflowY="auto" px={1} pb={1}>
          {sessions.map((s) => (
            <HStack
              key={s.id}
              px={2}
              py={1}
              rounded="sm"
              cursor="pointer"
              bg={s.id === activeSessionId ? "bg.emphasized" : "transparent"}
              _hover={{ bg: s.id === activeSessionId ? "bg.emphasized" : "bg.subtle" }}
              onClick={() => selectSession(s.id)}
              role="group"
            >
              <Text
                flex={1}
                fontSize="xs"
                truncate
                fontWeight={s.id === activeSessionId ? "semibold" : "normal"}
              >
                {s.title}
              </Text>
              <Text fontSize="2xs" color="fg.muted" flexShrink={0}>
                {timeAgo(s.updated_at)}
              </Text>
              <IconButton
                aria-label="Archive session"
                size="2xs"
                variant="ghost"
                opacity={0}
                _groupHover={{ opacity: 0.6 }}
                onClick={(e) => {
                  e.stopPropagation();
                  archiveSession(s.id);
                }}
              >
                <LuTrash2 />
              </IconButton>
            </HStack>
          ))}
        </Box>
      )}
    </Box>
  );
}
