import { memo } from "react";
import { Box, HStack, Text } from "@chakra-ui/react";
import { LuBot, LuUser } from "react-icons/lu";
import type { ChatMessage } from "@/lib/tauri/chat";
import { ChatMarkdown } from "./ChatMarkdown";

function parseMessageContent(contentJson: string): string {
  try {
    const blocks = JSON.parse(contentJson);
    if (Array.isArray(blocks)) {
      return blocks
        .filter((b: { type: string }) => b.type === "text")
        .map((b: { text: string }) => b.text)
        .join("\n");
    }
    if (typeof blocks === "string") return blocks;
  } catch {
    return contentJson;
  }
  return "";
}

function formatTime(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface ChatMessageBubbleProps {
  message: ChatMessage;
  streamingContent?: string;
}

export const ChatMessageBubble = memo(function ChatMessageBubble({
  message,
  streamingContent,
}: ChatMessageBubbleProps) {
  const isUser = message.role === "user";
  const content = streamingContent ?? parseMessageContent(message.content_json);

  if (isUser) {
    return (
      <Box display="flex" justifyContent="flex-end" px={3} py={1.5}>
        <Box
          maxW="85%"
          bg="blue.500/10"
          border="1px solid"
          borderColor="blue.500/20"
          rounded="lg"
          roundedBottomRight="sm"
          px={3}
          py={2}
        >
          <Text fontSize="sm" whiteSpace="pre-wrap">
            {content}
          </Text>
          <Text fontSize="2xs" color="fg.muted" textAlign="right" mt={1}>
            {formatTime(message.created_at)}
          </Text>
        </Box>
      </Box>
    );
  }

  // Assistant message
  return (
    <Box px={3} py={1.5}>
      <HStack align="start" gap={2}>
        <Box
          flexShrink={0}
          w="24px"
          h="24px"
          rounded="full"
          bg="purple.500/20"
          display="flex"
          alignItems="center"
          justifyContent="center"
          mt={0.5}
        >
          <LuBot size={14} />
        </Box>
        <Box flex={1} minW={0}>
          <ChatMarkdown content={content} />
          {message.is_partial && (
            <Text fontSize="2xs" color="orange.400" mt={1}>
              Response was interrupted
            </Text>
          )}
          <Text fontSize="2xs" color="fg.muted" mt={1}>
            {formatTime(message.created_at)}
            {message.tokens_out != null && ` · ${message.tokens_out} tokens`}
          </Text>
        </Box>
      </HStack>
    </Box>
  );
});
