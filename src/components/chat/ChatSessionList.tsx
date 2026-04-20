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

interface ChatSessionListProps {
  onSelectSession: () => void;
}

export function ChatSessionList({ onSelectSession }: ChatSessionListProps) {
  const { sessions, activeSessionId, selectSession, createSession, archiveSession } =
    useChatContext();
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const filtered = searchQuery.trim()
    ? sessions.filter((s) =>
        s.title.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : sessions;

  return (
    <Box flex={1} overflow="hidden" display="flex" flexDirection="column">
      <HStack px={2} py={1.5} justify="space-between" flexShrink={0}>
        <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
          {filtered.length} session{filtered.length !== 1 ? "s" : ""}
        </Text>
        <HStack gap={0}>
          <IconButton
            aria-label="Search sessions"
            size="2xs"
            variant="ghost"
            onClick={() => setShowSearch((v) => !v)}
            color={showSearch ? "brand.400" : undefined}
          >
            <LuSearch />
          </IconButton>
          <IconButton
            aria-label="New session"
            size="2xs"
            variant="ghost"
            onClick={() => {
              createSession();
              onSelectSession();
            }}
          >
            <LuPlus />
          </IconButton>
        </HStack>
      </HStack>

      {showSearch && (
        <Box px={2} pb={1} flexShrink={0}>
          <Input
            size="xs"
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") {
                setShowSearch(false);
                setSearchQuery("");
              }
            }}
            onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
            autoFocus
          />
        </Box>
      )}

      <Box flex={1} overflowY="auto" px={1} pb={1}>
        {filtered.map((s) => (
          <HStack
            key={s.id}
            px={2}
            py={1.5}
            rounded="md"
            cursor="pointer"
            bg={s.id === activeSessionId ? "brand.500/10" : "transparent"}
            borderLeft="2px solid"
            borderColor={s.id === activeSessionId ? "brand.500" : "transparent"}
            _hover={{ bg: s.id === activeSessionId ? "brand.500/10" : "bg.subtle" }}
            onClick={() => {
              selectSession(s.id);
              onSelectSession();
            }}
            role="group"
          >
            <Box flex={1} minW={0}>
              <Text
                fontSize="xs"
                truncate
                fontWeight={s.id === activeSessionId ? "semibold" : "normal"}
              >
                {s.title}
              </Text>
              <Text fontSize="2xs" color="fg.muted">
                {timeAgo(s.updated_at)}
              </Text>
            </Box>
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

        {searchQuery && filtered.length === 0 && (
          <Box px={2} py={4} textAlign="center">
            <Text fontSize="2xs" color="fg.muted">No sessions found</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
