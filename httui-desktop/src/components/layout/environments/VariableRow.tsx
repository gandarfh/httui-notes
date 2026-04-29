import { useState } from "react";
import { Box, Flex, IconButton, Input, Text } from "@chakra-ui/react";
import { LuEye, LuEyeOff, LuLock, LuLockOpen, LuX } from "react-icons/lu";
import type { EnvVariable } from "@/lib/tauri/commands";

interface VariableRowProps {
  variable: EnvVariable;
  revealed: boolean;
  isLast: boolean;
  onSave: (value: string, isSecret?: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
  onToggleReveal: () => void;
}

/**
 * One row in the env-vars editor: fixed key column + editable value, with
 * an encrypted/keychain toggle and a reveal toggle for secret values.
 *
 * Specific to env vars (not a generic key/value pair) because of the
 * `is_secret` semantics that route the value through the OS keychain.
 */
export function VariableRow({
  variable,
  revealed,
  isLast,
  onSave,
  onDelete,
  onToggleReveal,
}: VariableRowProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(variable.value);

  const isSecret = variable.is_secret;
  const shouldMask = isSecret && !revealed;

  const handleSave = async () => {
    if (editValue !== variable.value) {
      await onSave(editValue, isSecret);
    }
    setEditing(false);
  };

  const handleToggleSecret = async () => {
    await onSave(variable.value, !isSecret);
  };

  return (
    <Flex
      align="center"
      borderBottom={isLast ? undefined : "1px solid"}
      borderColor="border"
    >
      <Box
        px={2}
        py={1.5}
        fontFamily="mono"
        fontSize="xs"
        fontWeight="bold"
        color="fg.muted"
        minW="120px"
        bg="bg.subtle"
      >
        {variable.key}
      </Box>
      <Box borderLeft="1px solid" borderColor="border" alignSelf="stretch" />
      <Box flex={1} px={2} py={1.5}>
        {editing ? (
          <Input
            size="xs"
            variant="flushed"
            fontFamily="mono"
            fontSize="xs"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") {
                setEditValue(variable.value);
                setEditing(false);
              }
            }}
            autoFocus
          />
        ) : (
          <Text
            fontFamily="mono"
            fontSize="xs"
            cursor="pointer"
            onClick={() => {
              setEditValue(variable.value);
              setEditing(true);
            }}
            minH="20px"
          >
            {shouldMask ? "••••••••" : variable.value}
          </Text>
        )}
      </Box>
      <IconButton
        aria-label={isSecret ? "Mark as plain" : "Mark as secret"}
        size="2xs"
        variant="ghost"
        colorPalette={isSecret ? "purple" : "gray"}
        onClick={handleToggleSecret}
        title={isSecret ? "Encrypted in keychain" : "Click to encrypt"}
      >
        {isSecret ? <LuLock /> : <LuLockOpen />}
      </IconButton>
      {isSecret && (
        <IconButton
          aria-label={revealed ? "Hide value" : "Show value"}
          size="2xs"
          variant="ghost"
          onClick={onToggleReveal}
        >
          {revealed ? <LuEyeOff /> : <LuEye />}
        </IconButton>
      )}
      <IconButton
        aria-label="Delete variable"
        size="2xs"
        variant="ghost"
        colorPalette="red"
        mx={1}
        onClick={onDelete}
      >
        <LuX />
      </IconButton>
    </Flex>
  );
}
