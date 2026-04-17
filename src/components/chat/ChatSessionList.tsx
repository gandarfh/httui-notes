import { useState } from "react";
import { Box, HStack, Text, IconButton, Input } from "@chakra-ui/react";
import { LuPlus, LuTrash2, LuSearch } from "react-icons/lu";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const filtered = searchQuery.trim()
    ? sessions.filter((s) =>
        s.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sessions;

  return (
    <Box borderBottom="1px solid" borderColor="border" bg="bg">
      <HStack px={2} py={1.5} justify="space-between">
        <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
          Sessions
        </Text>
        <HStack gap={0}>
          <IconButton
            aria-label="Search sessions"
            size="2xs"
            variant="ghost"
            onClick={() => setShowSearch((v) => !v)}
            color={showSearch ? "blue.400" : undefined}
          >
            <LuSearch />
          </IconButton>
          <IconButton
            aria-label="New session"
            size="2xs"
            variant="ghost"
            onClick={() => createSession()}
          >
            <LuPlus />
          </IconButton>
        </HStack>
      </HStack>

      {showSearch && (
        <Box px={2} pb={1}>
          <Input
            size="xs"
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
            autoFocus
          />
        </Box>
      )}

      {filtered.length > 0 && (
        <Box maxH="160px" overflowY="auto" px={1} pb={1}>
          {filtered.map((s) => (
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

      {searchQuery && filtered.length === 0 && (
        <Box px={3} pb={2}>
          <Text fontSize="2xs" color="fg.muted">No sessions found</Text>
        </Box>
      )}
    </Box>
  );
}
