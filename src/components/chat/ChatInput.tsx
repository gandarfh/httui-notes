import { useRef, useCallback, useState } from "react";
import { Box, IconButton, HStack } from "@chakra-ui/react";
import { LuSend, LuSquare } from "react-icons/lu";
import { useChatContext } from "@/contexts/ChatContext";

export function ChatInput() {
  const { sendMessage, isStreaming, abort, activeSessionId } = useChatContext();
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming || activeSessionId === null) return;
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    await sendMessage(trimmed);
  }, [text, isStreaming, activeSessionId, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Stop propagation so ProseMirror/TipTap doesn't capture keystrokes
      e.stopPropagation();
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <Box borderTop="1px solid" borderColor="border" p={2} bg="bg">
      <HStack align="end" gap={1}>
        <Box
          as="textarea"
          ref={textareaRef}
          value={text}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
            setText(e.target.value);
            adjustHeight();
          }}
          onKeyDown={handleKeyDown}
          onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
          onFocus={(e: React.FocusEvent) => e.stopPropagation()}
          placeholder={activeSessionId ? "Message... (Cmd+Enter to send)" : "Create a session first"}
          disabled={activeSessionId === null}
          rows={1}
          flex={1}
          bg="bg.subtle"
          border="1px solid"
          borderColor="border"
          rounded="md"
          px={3}
          py={2}
          fontSize="sm"
          fontFamily="body"
          resize="none"
          minH="40px"
          maxH="200px"
          overflowY="auto"
          _focus={{
            outline: "none",
            borderColor: "blue.500",
            boxShadow: "0 0 0 1px var(--chakra-colors-blue-500)",
          }}
          _placeholder={{ color: "fg.muted" }}
        />
        {isStreaming ? (
          <IconButton
            aria-label="Stop generating"
            size="sm"
            variant="ghost"
            colorPalette="red"
            onClick={abort}
          >
            <LuSquare />
          </IconButton>
        ) : (
          <IconButton
            aria-label="Send message"
            size="sm"
            variant="ghost"
            colorPalette="blue"
            disabled={!text.trim() || activeSessionId === null}
            onClick={handleSend}
          >
            <LuSend />
          </IconButton>
        )}
      </HStack>
    </Box>
  );
}
