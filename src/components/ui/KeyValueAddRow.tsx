import { useState } from "react";
import { Box, Flex, IconButton, Input } from "@chakra-ui/react";
import { LuPlus } from "react-icons/lu";

interface KeyValueAddRowProps {
  /** Called when the user confirms a new key/value pair (Enter or +). */
  onAdd: (key: string, value: string) => void | Promise<void>;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  /** When provided, drawn above the row as a top-border separator. */
  withTopBorder?: boolean;
  /** Visual styling — defaults match the env-vars footer in EnvironmentManager. */
  monospace?: boolean;
}

/**
 * A simple "add new key/value" footer row used at the bottom of KV editors.
 * Keys + values are committed via Enter or the + button. Empty keys are
 * rejected (the + button stays disabled until `key.trim()` is non-empty).
 */
export function KeyValueAddRow({
  onAdd,
  keyPlaceholder = "KEY",
  valuePlaceholder = "value",
  withTopBorder = false,
  monospace = true,
}: KeyValueAddRowProps) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  const submit = async () => {
    const trimmed = key.trim();
    if (!trimmed) return;
    await onAdd(trimmed, value);
    setKey("");
    setValue("");
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") void submit();
  };

  const fontProps = monospace
    ? { fontFamily: "mono" as const, fontSize: "xs" as const }
    : { fontSize: "xs" as const };

  return (
    <Flex
      align="center"
      borderTop={withTopBorder ? "1px solid" : undefined}
      borderColor="border"
    >
      <Input
        size="xs"
        placeholder={keyPlaceholder}
        value={key}
        onChange={(e) => setKey(e.target.value)}
        variant="flushed"
        px={2}
        flex={1}
        onKeyDown={onKey}
        {...fontProps}
      />
      <Box borderLeft="1px solid" borderColor="border" alignSelf="stretch" />
      <Input
        size="xs"
        placeholder={valuePlaceholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        variant="flushed"
        px={2}
        flex={1}
        onKeyDown={onKey}
        {...fontProps}
      />
      <IconButton
        aria-label="Add"
        size="2xs"
        variant="ghost"
        colorPalette="green"
        mx={1}
        onClick={submit}
        disabled={!key.trim()}
      >
        <LuPlus />
      </IconButton>
    </Flex>
  );
}
