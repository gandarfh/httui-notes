import { memo, useState, useCallback, useRef } from "react";
import { Box, Flex, HStack, IconButton, Image, Text } from "@chakra-ui/react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { LuBot, LuPencil, LuRefreshCw, LuFileDown } from "react-icons/lu";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { ChatMessage } from "@/lib/tauri/chat";
import type { ToolActivity } from "@/hooks/useChat";
import { ChatMarkdown } from "./ChatMarkdown";
import { ToolUseBlock } from "./ToolUseBlock";

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
  toolActivity?: Map<string, ToolActivity>;
  isLastAssistant?: boolean;
  onEdit?: (turnIndex: number, newText: string) => void;
  onRegenerate?: () => void;
}

export const ChatMessageBubble = memo(function ChatMessageBubble({
  message,
  streamingContent,
  toolActivity,
  isLastAssistant,
  onEdit,
  onRegenerate,
}: ChatMessageBubbleProps) {
  const isUser = message.role === "user";
  const parsed = parseMessageContent(message.content_json);
  const content = streamingContent ?? parsed.text;

  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const editRef = useRef<HTMLTextAreaElement>(null);

  const startEdit = useCallback(() => {
    setEditText(parsed.text);
    setEditing(true);
    setTimeout(() => editRef.current?.focus(), 0);
  }, [parsed.text]);

  const confirmEdit = useCallback(() => {
    if (editText.trim() && onEdit) {
      onEdit(message.turn_index, editText.trim());
    }
    setEditing(false);
  }, [editText, onEdit, message.turn_index]);

  if (isUser) {
    if (editing) {
      return (
        <Box display="flex" justifyContent="flex-end" px={3} py={1.5}>
          <Box maxW="85%" w="100%">
            <textarea
              ref={editRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  confirmEdit();
                }
                if (e.key === "Escape") setEditing(false);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                background: "var(--chakra-colors-bg-subtle)",
                border: "1px solid var(--chakra-colors-brand-500)",
                borderRadius: "var(--chakra-radii-md)",
                padding: "8px 12px",
                fontSize: "14px",
                fontFamily: "var(--chakra-fonts-body)",
                resize: "none",
                minHeight: "60px",
                outline: "none",
                color: "var(--chakra-colors-fg)",
              }}
            />
            <HStack justify="flex-end" mt={1} gap={1}>
              <Text fontSize="2xs" color="fg.muted">Esc cancel · Cmd+Enter send</Text>
              <Box
                as="button"
                px={2} py={0.5} rounded="sm" fontSize="xs" bg="bg.subtle"
                border="1px solid" borderColor="border" cursor="pointer"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Box>
              <Box
                as="button"
                px={2} py={0.5} rounded="sm" fontSize="xs" bg="brand.500" color="white" cursor="pointer"
                onClick={confirmEdit}
              >
                Send
              </Box>
            </HStack>
          </Box>
        </Box>
      );
    }

    return (
      <Box display="flex" justifyContent="flex-end" px={3} py={1.5} role="group">
        {onEdit && message.id > 0 && (
          <IconButton
            aria-label="Edit message"
            size="2xs"
            variant="ghost"
            opacity={0}
            _groupHover={{ opacity: 0.5 }}
            onClick={startEdit}
            alignSelf="center"
            mr={1}
          >
            <LuPencil />
          </IconButton>
        )}
        <Box
          maxW="85%"
          bg="brand.500/10"
          border="1px solid"
          borderColor="brand.500/20"
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

          {/* Persisted tool calls (from DB) */}
          {message.tool_calls.length > 0 &&
            message.tool_calls.map((tc) => (
              <ToolUseBlock key={tc.tool_use_id} toolCall={tc} />
            ))}

          {/* Live tool activity (during streaming) */}
          {toolActivity &&
            Array.from(toolActivity.entries()).map(([id, act]) => (
              <ToolUseBlock key={id} activity={act} />
            ))}

          {message.is_partial && (
            <Text fontSize="2xs" color="orange.400" mt={1}>
              Response was interrupted
            </Text>
          )}
          <HStack mt={1} gap={1}>
            <Text fontSize="2xs" color="fg.muted">
              {formatTime(message.created_at)}
              {message.tokens_out != null && ` · ${message.tokens_out} tokens`}
            </Text>
            {message.id > 0 && (
              <IconButton
                aria-label="Save as note"
                size="2xs"
                variant="ghost"
                onClick={async () => {
                  const path = await save({
                    filters: [{ name: "Markdown", extensions: ["md"] }],
                    defaultPath: "chat-response.md",
                  });
                  if (path) {
                    await writeFile(path, new TextEncoder().encode(content));
                  }
                }}
              >
                <LuFileDown size={10} />
              </IconButton>
            )}
            {isLastAssistant && onRegenerate && message.id > 0 && (
              <IconButton
                aria-label="Regenerate"
                size="2xs"
                variant="ghost"
                onClick={onRegenerate}
              >
                <LuRefreshCw size={10} />
              </IconButton>
            )}
          </HStack>
        </Box>
      </HStack>
    </Box>
  );
});
