import { useCallback } from "react";
import { Flex, Text, Separator, Box, VStack } from "@chakra-ui/react";
import { NativeSelectRoot, NativeSelectField } from "@chakra-ui/react";
import { useColorMode } from "@/components/ui/color-mode";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useSettingsContext } from "@/contexts/SettingsContext";
import { Switch } from "@/components/ui/switch";

const AUTO_SAVE_OPTIONS = [
  { value: "0", label: "Disabled (manual save only)" },
  { value: "500", label: "500ms" },
  { value: "1000", label: "1 second" },
  { value: "2000", label: "2 seconds" },
  { value: "5000", label: "5 seconds" },
];

export function GeneralSection() {
  const { colorMode, toggleColorMode } = useColorMode();
  const { vaultPath, vaults } = useWorkspace();
  const { settings, updateSetting } = useSettingsContext();

  const handleAutoSaveChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateSetting("autoSaveMs", Number(e.target.value));
    },
    [updateSetting],
  );

  return (
    <Flex direction="column" gap={4}>
      {/* Appearance */}
      <Box>
        <Text fontWeight="semibold" fontSize="sm" mb={3}>
          Appearance
        </Text>
        <Flex align="center" justify="space-between">
          <Flex direction="column" gap={0}>
            <Text fontSize="sm">Dark mode</Text>
            <Text fontSize="xs" color="fg.muted">
              Switch between light and dark theme
            </Text>
          </Flex>
          <Switch
            checked={colorMode === "dark"}
            onCheckedChange={toggleColorMode}
            size="sm"
          />
        </Flex>
      </Box>

      <Separator />

      {/* Auto-save */}
      <Box>
        <Text fontWeight="semibold" fontSize="sm" mb={3}>
          Auto-save
        </Text>
        <Flex align="center" justify="space-between" gap={4}>
          <Flex direction="column" gap={0} flex={1}>
            <Text fontSize="sm">Save interval</Text>
            <Text fontSize="xs" color="fg.muted">
              How long to wait after you stop typing before saving
            </Text>
          </Flex>
          <NativeSelectRoot size="sm" w="200px">
            <NativeSelectField
              value={String(settings.autoSaveMs)}
              onChange={handleAutoSaveChange}
            >
              {AUTO_SAVE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </NativeSelectField>
          </NativeSelectRoot>
        </Flex>
        {settings.autoSaveMs === 0 && (
          <Box mt={2} px={3} py={2} borderRadius="md" bg="orange.subtle" borderWidth="1px" borderColor="orange.muted">
            <Text fontSize="xs" color="orange.fg">
              Auto-save is disabled. Use Cmd+S to save manually. Unsaved changes will be lost if you close the app.
            </Text>
          </Box>
        )}
      </Box>

      <Separator />

      {/* Workspace info */}
      <Box>
        <Text fontWeight="semibold" fontSize="sm" mb={3}>
          Workspace
        </Text>
        <VStack gap={2} align="stretch">
          <Flex justify="space-between" fontSize="xs">
            <Text color="fg.muted">Active vault</Text>
            <Text fontFamily="mono" fontWeight="medium" maxW="300px" truncate textAlign="right">
              {vaultPath ?? "None"}
            </Text>
          </Flex>
          <Flex justify="space-between" fontSize="xs">
            <Text color="fg.muted">Registered vaults</Text>
            <Text fontWeight="medium">{vaults.length}</Text>
          </Flex>
        </VStack>
      </Box>

      <Separator />

      {/* Session persistence info */}
      <Box>
        <Text fontWeight="semibold" fontSize="sm" mb={2}>
          Session persistence
        </Text>
        <Text fontSize="xs" color="fg.muted" lineHeight="tall">
          Your pane layout, open tabs, scroll positions, and editor preferences
          are automatically saved and restored when you reopen the app.
          Diff tabs and temporary views are not persisted.
        </Text>
      </Box>
    </Flex>
  );
}
