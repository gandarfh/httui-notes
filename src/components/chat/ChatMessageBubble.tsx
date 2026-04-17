import { memo } from "react";
import { Box, Flex, HStack, Image, Text } from "@chakra-ui/react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { LuBot } from "react-icons/lu";
import type { ChatMessage } from "@/lib/tauri/chat";
import { ChatMarkdown } from "./ChatMarkdown";

interface ContentBlock {
  type: string;
  text?: string;
  path?: string;
  media_type?: string;
}

function parseMessageContent(contentJson: string): {
  text: string;
  images: { path: string; mediaType: string }[];
} {
  try {
    const blocks: ContentBlock[] = JSON.parse(contentJson);
    if (Array.isArray(blocks)) {
      const text = blocks
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("\n");
      const images = blocks
        .filter((b) => b.type === "image" && b.path)
        .map((b) => ({ path: b.path!, mediaType: b.media_type ?? "image/png" }));
      return { text, images };
    }
    if (typeof blocks === "string") return { text: blocks, images: [] };
  } catch {
    return { text: contentJson, images: [] };
  }
  return { text: "", images: [] };
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
  const parsed = parseMessageContent(message.content_json);
  const content = streamingContent ?? parsed.text;

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
          {parsed.images.length > 0 && (
            <Flex gap={1} mb={content ? 1.5 : 0} flexWrap="wrap">
              {parsed.images.map((img, i) => (
                <Image
                  key={i}
                  src={convertFileSrc(img.path)}
                  alt="attachment"
                  maxH="120px"
                  maxW="200px"
                  rounded="md"
                  objectFit="cover"
                />
              ))}
            </Flex>
          )}
          {content && (
            <Text fontSize="sm" whiteSpace="pre-wrap">
              {content}
            </Text>
          )}
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
