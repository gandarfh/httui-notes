import { useRef, useCallback, useState } from "react";
import { Box, IconButton, HStack, Flex, Text, Image } from "@chakra-ui/react";
import { LuSend, LuSquare, LuPaperclip, LuX } from "react-icons/lu";
import { open } from "@tauri-apps/plugin-dialog";
import { useChatContext } from "@/contexts/ChatContext";
import { saveAttachmentTmp, type AttachmentInput } from "@/lib/tauri/chat";

const MAX_ATTACHMENTS = 20;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"];
const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

interface Attachment {
  path: string;
  mediaType: string;
  previewUrl: string; // for display only
  name: string;
}

export function ChatInput() {
  const { sendMessage, isStreaming, abort, activeSessionId } = useChatContext();
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, []);

  const addAttachmentFromPath = useCallback((filePath: string) => {
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    const mediaType = IMAGE_MIME[ext] ?? "application/octet-stream";
    const name = filePath.split("/").pop() ?? filePath;

    setAttachments((prev) => {
      if (prev.length >= MAX_ATTACHMENTS) return prev;
      if (prev.some((a) => a.path === filePath)) return prev;
      return [
        ...prev,
        {
          path: filePath,
          mediaType,
          previewUrl: `asset://localhost/${filePath}`,
          name,
        },
      ];
    });
  }, []);

  const addAttachmentFromBlob = useCallback(
    async (blob: Blob, fileName: string) => {
      if (blob.size > MAX_FILE_SIZE) return;
      const buffer = new Uint8Array(await blob.arrayBuffer());
      const path = await saveAttachmentTmp(
        Array.from(buffer),
        blob.type || "image/png"
      );
      setAttachments((prev) => {
        if (prev.length >= MAX_ATTACHMENTS) return prev;
        return [
          ...prev,
          {
            path,
            mediaType: blob.type || "image/png",
            previewUrl: URL.createObjectURL(blob),
            name: fileName,
          },
        ];
      });
    },
    []
  );

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleFilePicker = useCallback(async () => {
    const paths = await open({
      multiple: true,
      filters: [
        { name: "Images", extensions: IMAGE_EXTENSIONS },
      ],
    });
    if (!paths) return;
    const selected = Array.isArray(paths) ? paths : [paths];
    for (const p of selected) {
      addAttachmentFromPath(p);
    }
  }, [addAttachmentFromPath]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) {
            addAttachmentFromBlob(blob, `paste-${Date.now()}.png`);
          }
        }
      }
    },
    [addAttachmentFromBlob]
  );

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    const hasContent = trimmed || attachments.length > 0;
    if (!hasContent || isStreaming || activeSessionId === null) return;

    const attInputs: AttachmentInput[] = attachments.map((a) => ({
      path: a.path,
      media_type: a.mediaType,
    }));

    setText("");
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    await sendMessage(trimmed, attInputs);
  }, [text, attachments, isStreaming, activeSessionId, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
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
      {/* Attachment previews */}
      {attachments.length > 0 && (
        <Flex gap={1} mb={1.5} flexWrap="wrap">
          {attachments.map((att, i) => (
            <Box
              key={att.path}
              position="relative"
              w="48px"
              h="48px"
              rounded="md"
              overflow="hidden"
              border="1px solid"
              borderColor="border"
              role="group"
            >
              <Image
                src={att.previewUrl}
                alt={att.name}
                w="100%"
                h="100%"
                objectFit="cover"
              />
              <IconButton
                aria-label="Remove"
                size="2xs"
                variant="solid"
                position="absolute"
                top={-1}
                right={-1}
                rounded="full"
                opacity={0}
                _groupHover={{ opacity: 1 }}
                onClick={() => removeAttachment(i)}
              >
                <LuX />
              </IconButton>
            </Box>
          ))}
          <Text fontSize="2xs" color="fg.muted" alignSelf="end">
            {attachments.length}/{MAX_ATTACHMENTS}
          </Text>
        </Flex>
      )}

      <HStack align="end" gap={1}>
        <IconButton
          aria-label="Attach image"
          size="sm"
          variant="ghost"
          disabled={activeSessionId === null || attachments.length >= MAX_ATTACHMENTS}
          onClick={handleFilePicker}
        >
          <LuPaperclip />
        </IconButton>

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
          onPaste={handlePaste}
          placeholder={
            activeSessionId ? "Message... (Cmd+Enter to send)" : "Create a session first"
          }
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
            disabled={
              (!text.trim() && attachments.length === 0) ||
              activeSessionId === null
            }
            onClick={handleSend}
          >
            <LuSend />
          </IconButton>
        )}
      </HStack>
    </Box>
  );
}
