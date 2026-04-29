import { Box, IconButton, Text } from "@chakra-ui/react";
import { LuArrowDown } from "react-icons/lu";
import { useChatStore } from "@/stores/chat";
import { useStickyScroll } from "@/hooks/useStickyScroll";
import { ChatMessageBubble } from "./ChatMessageBubble";

export function ChatConversation() {
  const messages = useChatStore((s) => s.messages);
  const streamingContent = useChatStore((s) => s.streamingContent);
  const streamingSegments = useChatStore((s) => s.streamingSegments);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const error = useChatStore((s) => s.error);
  const toolActivity = useChatStore((s) => s.toolActivity);
  const editAndResend = useChatStore((s) => s.editAndResend);
  const regenerate = useChatStore((s) => s.regenerate);
  const resumeFailed = useChatStore((s) => s.resumeFailed);
  const resetAndContinue = useChatStore((s) => s.resetAndContinue);
  const { scrollRef, showJumpButton, scrollToBottom } = useStickyScroll([
    messages,
    streamingContent,
  ]);

  const hasMessages = messages.length > 0 || streamingContent;

  return (
    <Box flex={1} position="relative" overflow="hidden">
      <Box ref={scrollRef} h="100%" overflowY="auto" py={2}>
        {!hasMessages && (
          <Box
            display="flex"
            alignItems="center"
            justifyContent="center"
            h="100%"
            color="fg.muted"
            fontSize="sm"
          >
            <Text>Start a conversation</Text>
          </Box>
        )}

        {messages.map((msg, idx) => {
          const lastAssistantIdx = [...messages]
            .reverse()
            .findIndex((m) => m.role === "assistant");
          const isLastAssistant =
            lastAssistantIdx >= 0 &&
            idx === messages.length - 1 - lastAssistantIdx;
          return (
            <ChatMessageBubble
              key={msg.id}
              message={msg}
              isLastAssistant={isLastAssistant}
              onEdit={!isStreaming ? editAndResend : undefined}
              onRegenerate={!isStreaming ? regenerate : undefined}
            />
          );
        })}

        {/* Streaming assistant message (not yet persisted) */}
        {isStreaming && (streamingContent || toolActivity.size > 0) && (
          <ChatMessageBubble
            message={{
              id: -1,
              session_id: 0,
              role: "assistant",
              turn_index: messages.length,
              content_json: "[]",
              tokens_in: null,
              tokens_out: null,
              is_partial: false,
              created_at: Math.floor(Date.now() / 1000),
              tool_calls: [],
            }}
            streamingContent={streamingContent}
            streamingSegments={streamingSegments}
            toolActivity={toolActivity}
          />
        )}

        {/* Streaming indicator without content yet */}
        {isStreaming && !streamingContent && (
          <Box px={3} py={2}>
            <Box
              display="inline-flex"
              gap={1}
              px={3}
              py={2}
              rounded="lg"
              bg="bg.subtle"
            >
              <Box
                w="6px"
                h="6px"
                rounded="full"
                bg="fg.muted"
                css={{
                  animation: "pulse 1.4s infinite",
                  animationDelay: "0s",
                  "@keyframes pulse": {
                    "0%, 80%, 100%": { opacity: 0.3 },
                    "40%": { opacity: 1 },
                  },
                }}
              />
              <Box
                w="6px"
                h="6px"
                rounded="full"
                bg="fg.muted"
                css={{
                  animation: "pulse 1.4s infinite",
                  animationDelay: "0.2s",
                }}
              />
              <Box
                w="6px"
                h="6px"
                rounded="full"
                bg="fg.muted"
                css={{
                  animation: "pulse 1.4s infinite",
                  animationDelay: "0.4s",
                }}
              />
            </Box>
          </Box>
        )}

        {error && (
          <Box px={3} py={2}>
            <Box
              bg="red.500/10"
              border="1px solid"
              borderColor="red.500/20"
              rounded="md"
              px={3}
              py={2}
              fontSize="sm"
              color="red.400"
            >
              {error}
              {resumeFailed && (
                <Box
                  as="button"
                  display="block"
                  mt={2}
                  px={3}
                  py={1}
                  rounded="md"
                  fontSize="xs"
                  fontWeight="medium"
                  bg="brand.600"
                  color="white"
                  cursor="pointer"
                  _hover={{ bg: "brand.700" }}
                  onClick={resetAndContinue}
                >
                  Continue as new conversation
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Box>

      {/* Jump to bottom button */}
      {showJumpButton && (
        <IconButton
          aria-label="Scroll to bottom"
          size="sm"
          variant="solid"
          position="absolute"
          bottom={2}
          left="50%"
          transform="translateX(-50%)"
          rounded="full"
          shadow="lg"
          onClick={scrollToBottom}
        >
          <LuArrowDown />
        </IconButton>
      )}
    </Box>
  );
}
