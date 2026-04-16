import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Flex,
  HStack,
  VStack,
  Text,
  Input,
  IconButton,
  Badge,
  Portal,
} from "@chakra-ui/react";
import {
  LuPlus,
  LuCopy,
  LuTrash2,
  LuX,
  LuEye,
  LuEyeOff,
  LuCheck,
  LuLock,
  LuLockOpen,
} from "react-icons/lu";
import { useEnvironmentContext } from "@/contexts/EnvironmentContext";
import type { EnvVariable } from "@/lib/tauri/commands";

export function EnvironmentManager() {
  const {
    environments,
    activeEnvironment,
    managerOpen,
    closeManager,
    switchEnvironment,
    createEnvironment,
    deleteEnvironment,
    duplicateEnvironment,
    loadVariables,
    setVariable,
    deleteVariable,
  } = useEnvironmentContext();

  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
  const [variables, setVariables] = useState<EnvVariable[]>([]);
  const [newEnvName, setNewEnvName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  // Select first environment on open or when list changes
  useEffect(() => {
    if (!managerOpen) return;
    if (selectedEnvId && environments.some((e) => e.id === selectedEnvId)) return;
    setSelectedEnvId(environments[0]?.id ?? null);
  }, [managerOpen, environments, selectedEnvId]);

  // Load variables when selected environment changes
  useEffect(() => {
    if (!selectedEnvId) {
      setVariables([]);
      return;
    }
    let cancelled = false;
    loadVariables(selectedEnvId).then((vars) => {
      if (!cancelled) setVariables(vars);
    });
    return () => { cancelled = true; };
  }, [selectedEnvId, loadVariables]);

  const refreshVariables = useCallback(async () => {
    if (!selectedEnvId) return;
    const vars = await loadVariables(selectedEnvId);
    setVariables(vars);
  }, [selectedEnvId, loadVariables]);

  const handleCreate = useCallback(async () => {
    if (!newEnvName.trim()) return;
    await createEnvironment(newEnvName.trim());
    setNewEnvName("");
    setCreating(false);
  }, [newEnvName, createEnvironment]);

  const handleDuplicate = useCallback(
    async (id: string, name: string) => {
      await duplicateEnvironment(id, `${name} (copy)`);
    },
    [duplicateEnvironment],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteEnvironment(id);
      if (selectedEnvId === id) setSelectedEnvId(null);
    },
    [deleteEnvironment, selectedEnvId],
  );

  const handleSetVariable = useCallback(
    async (key: string, value: string, isSecret?: boolean) => {
      if (!selectedEnvId || !key.trim()) return;
      await setVariable(selectedEnvId, key, value, isSecret);
      await refreshVariables();
    },
    [selectedEnvId, setVariable, refreshVariables],
  );

  const handleDeleteVariable = useCallback(
    async (id: string) => {
      await deleteVariable(id);
      await refreshVariables();
    },
    [deleteVariable, refreshVariables],
  );

  const toggleReveal = (varId: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(varId)) {
        next.delete(varId);
      } else {
        next.add(varId);
      }
      return next;
    });
  };

  if (!managerOpen) return null;

  return (
    <Portal>
      {/* Backdrop */}
      <Box
        position="fixed"
        inset={0}
        bg="blackAlpha.600"
        zIndex={1400}
        onClick={closeManager}
      />
      {/* Panel */}
      <Box
        position="fixed"
        top={0}
        right={0}
        h="100vh"
        w="640px"
        maxW="90vw"
        bg="bg"
        borderLeftWidth="1px"
        borderColor="border"
        zIndex={1401}
        display="flex"
        flexDirection="column"
      >
        {/* Header */}
        <Flex
          align="center"
          justify="space-between"
          px={4}
          py={3}
          borderBottomWidth="1px"
          borderColor="border"
        >
          <Text fontWeight="semibold" fontSize="sm">
            Environments
          </Text>
          <IconButton
            aria-label="Close"
            variant="ghost"
            size="sm"
            onClick={closeManager}
          >
            <LuX />
          </IconButton>
        </Flex>

        <Flex flex={1} overflow="hidden">
          {/* Sidebar: environment list */}
          <VStack
            w="180px"
            flexShrink={0}
            borderRightWidth="1px"
            borderColor="border"
            p={2}
            gap={1}
            align="stretch"
            overflow="auto"
          >
            {environments.map((env) => (
              <Flex
                key={env.id}
                align="center"
                gap={1}
                px={2}
                py={1.5}
                rounded="md"
                cursor="pointer"
                bg={selectedEnvId === env.id ? "bg.subtle" : undefined}
                _hover={{ bg: "bg.subtle" }}
                onClick={() => setSelectedEnvId(env.id)}
              >
                <Text fontSize="xs" flex={1} truncate>
                  {env.name}
                </Text>
                {env.is_active && (
                  <Badge size="xs" colorPalette="green" variant="subtle">
                    active
                  </Badge>
                )}
              </Flex>
            ))}

            {creating ? (
              <Flex gap={1} align="center">
                <Input
                  size="xs"
                  placeholder="Name..."
                  value={newEnvName}
                  onChange={(e) => setNewEnvName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") setCreating(false);
                  }}
                  autoFocus
                />
                <IconButton
                  aria-label="Confirm"
                  size="2xs"
                  variant="ghost"
                  colorPalette="green"
                  onClick={handleCreate}
                >
                  <LuCheck />
                </IconButton>
              </Flex>
            ) : (
              <Flex
                align="center"
                gap={1}
                px={2}
                py={1}
                cursor="pointer"
                color="fg.muted"
                fontSize="xs"
                _hover={{ bg: "bg.subtle" }}
                rounded="md"
                onClick={() => setCreating(true)}
              >
                <LuPlus size={12} />
                New environment
              </Flex>
            )}
          </VStack>

          {/* Main: variables for selected environment */}
          <Box flex={1} overflow="auto" p={3}>
            {selectedEnvId ? (
              <VariablesEditor
                envName={environments.find((e) => e.id === selectedEnvId)?.name ?? ""}
                isActive={activeEnvironment?.id === selectedEnvId}
                variables={variables}
                revealedKeys={revealedKeys}
                onSetActive={() => switchEnvironment(selectedEnvId)}
                onDuplicate={() =>
                  handleDuplicate(
                    selectedEnvId,
                    environments.find((e) => e.id === selectedEnvId)?.name ?? "",
                  )
                }
                onDelete={() => handleDelete(selectedEnvId)}
                onSetVariable={handleSetVariable}
                onDeleteVariable={handleDeleteVariable}
                onToggleReveal={toggleReveal}
              />
            ) : (
              <Flex
                align="center"
                justify="center"
                h="100%"
                color="fg.muted"
                fontSize="sm"
              >
                {environments.length === 0
                  ? "Create an environment to get started"
                  : "Select an environment"}
              </Flex>
            )}
          </Box>
        </Flex>
      </Box>
    </Portal>
  );
}

function VariablesEditor({
  envName,
  isActive,
  variables,
  revealedKeys,
  onSetActive,
  onDuplicate,
  onDelete,
  onSetVariable,
  onDeleteVariable,
  onToggleReveal,
}: {
  envName: string;
  isActive: boolean;
  variables: EnvVariable[];
  revealedKeys: Set<string>;
  onSetActive: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSetVariable: (key: string, value: string, isSecret?: boolean) => Promise<void>;
  onDeleteVariable: (id: string) => Promise<void>;
  onToggleReveal: (varId: string) => void;
}) {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const handleAddVariable = async () => {
    if (!newKey.trim()) return;
    await onSetVariable(newKey.trim(), newValue);
    setNewKey("");
    setNewValue("");
  };

  return (
    <VStack align="stretch" gap={3}>
      {/* Env header with actions */}
      <Flex align="center" gap={2}>
        <Text fontWeight="semibold" fontSize="sm">
          {envName}
        </Text>
        {isActive ? (
          <Badge colorPalette="green" variant="subtle" size="sm">
            active
          </Badge>
        ) : (
          <Badge
            as="button"
            colorPalette="gray"
            variant="outline"
            size="sm"
            cursor="pointer"
            onClick={onSetActive}
          >
            Set active
          </Badge>
        )}
        <HStack gap={0} ml="auto">
          <IconButton
            aria-label="Duplicate"
            size="xs"
            variant="ghost"
            onClick={onDuplicate}
          >
            <LuCopy />
          </IconButton>
          <IconButton
            aria-label="Delete"
            size="xs"
            variant="ghost"
            colorPalette="red"
            onClick={onDelete}
          >
            <LuTrash2 />
          </IconButton>
        </HStack>
      </Flex>

      {/* Variable list */}
      <Box border="1px solid" borderColor="border" rounded="md" overflow="hidden">
        {variables.map((v, i) => (
          <VariableRow
            key={v.id}
            variable={v}
            revealed={revealedKeys.has(v.id)}
            isLast={i === variables.length - 1}
            onSave={(value, isSecret) => onSetVariable(v.key, value, isSecret)}
            onDelete={() => onDeleteVariable(v.id)}
            onToggleReveal={() => onToggleReveal(v.id)}
          />
        ))}

        {/* Add new variable */}
        <Flex
          align="center"
          borderTop={variables.length > 0 ? "1px solid" : undefined}
          borderColor="border"
        >
          <Input
            size="xs"
            placeholder="KEY"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            fontFamily="mono"
            fontSize="xs"
            variant="flushed"
            px={2}
            flex={1}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddVariable();
            }}
          />
          <Box borderLeft="1px solid" borderColor="border" alignSelf="stretch" />
          <Input
            size="xs"
            placeholder="value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            fontFamily="mono"
            fontSize="xs"
            variant="flushed"
            px={2}
            flex={1}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddVariable();
            }}
          />
          <IconButton
            aria-label="Add variable"
            size="2xs"
            variant="ghost"
            colorPalette="green"
            mx={1}
            onClick={handleAddVariable}
            disabled={!newKey.trim()}
          >
            <LuPlus />
          </IconButton>
        </Flex>
      </Box>

      <Text fontSize="xs" color="fg.muted">
        Use <Text as="span" fontFamily="mono">{"{{KEY}}"}</Text> in HTTP blocks to reference variables from the active environment.
      </Text>
    </VStack>
  );
}

function VariableRow({
  variable,
  revealed,
  isLast,
  onSave,
  onDelete,
  onToggleReveal,
}: {
  variable: EnvVariable;
  revealed: boolean;
  isLast: boolean;
  onSave: (value: string, isSecret?: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
  onToggleReveal: () => void;
}) {
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
