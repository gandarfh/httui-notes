import { useState, useRef, useEffect } from "react";
import { Box, HStack, Input } from "@chakra-ui/react";
import { LuFolder, LuFileText } from "react-icons/lu";

export function InlineInput({
  type,
  depth,
  defaultValue,
  onConfirm,
  onCancel,
}: {
  type: "note" | "folder";
  depth: number;
  defaultValue?: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      mounted.current = true;
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <HStack
      px={2}
      py={0.5}
      pl={`${depth * 16 + 8}px`}
      gap={1.5}
    >
      <Box color="fg.subtle" flexShrink={0}>
        {type === "folder" ? <LuFolder size={14} /> : <LuFileText size={14} />}
      </Box>
      <Input
        ref={inputRef}
        size="xs"
        variant="flushed"
        fontSize="xs"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const trimmed = value.trim();
            if (trimmed) onConfirm(trimmed);
            else onCancel();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={() => {
          if (!mounted.current) return;
          const trimmed = value.trim();
          if (trimmed) onConfirm(trimmed);
          else onCancel();
        }}
        placeholder={type === "folder" ? "nome-da-pasta" : "nome-da-nota"}
      />
    </HStack>
  );
}
