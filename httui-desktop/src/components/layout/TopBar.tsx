import {
  HStack,
  Text,
  IconButton,
  Box,
  Badge,
  Menu,
  Portal,
} from "@chakra-ui/react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useEnvironmentStore } from "@/stores/environment";
import { useSettingsStore } from "@/stores/settings";
import {
  LuMenu,
  LuPlus,
  LuChevronDown,
  LuGlobe,
  LuSettings,
  LuMessageSquare,
  LuDatabase,
} from "react-icons/lu";

interface TopBarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  chatOpen: boolean;
  onToggleChat: () => void;
  schemaPanelOpen: boolean;
  onToggleSchemaPanel: () => void;
}

export function TopBar({
  sidebarOpen,
  onToggleSidebar,
  chatOpen,
  onToggleChat,
  schemaPanelOpen,
  onToggleSchemaPanel,
}: TopBarProps) {
  const { vaultPath, vaults, switchVault, openVault } = useWorkspace();
  const environments = useEnvironmentStore((s) => s.environments);
  const activeEnvironment = useEnvironmentStore((s) => s.activeEnvironment);
  const switchEnvironment = useEnvironmentStore((s) => s.switchEnvironment);
  const openManager = useEnvironmentStore((s) => s.openManager);
  const openSettings = useSettingsStore((s) => s.openSettings);
  const vaultName = vaultPath ? vaultPath.split("/").pop() || vaultPath : null;

  return (
    <HStack
      data-tauri-drag-region
      h="48px"
      pl="80px"
      pr={2}
      bg="bg"
      borderBottomWidth="1px"
      borderColor="border"
      justify="space-between"
      flexShrink={0}
    >
      {/* Left — brand + vault breadcrumb */}
      <HStack gap={1}>
        <IconButton
          aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          variant="ghost"
          size="sm"
          onClick={onToggleSidebar}
        >
          <LuMenu />
        </IconButton>
        <Text fontWeight="semibold" fontSize="sm">
          Notes
        </Text>

        {vaultName && (
          <>
            <Text fontSize="xs" color="fg.muted" mx={0.5}>
              ›
            </Text>
            <Menu.Root>
              <Menu.Trigger asChild>
                <Box
                  as="button"
                  display="flex"
                  alignItems="center"
                  gap={1}
                  px={1.5}
                  py={0.5}
                  rounded="md"
                  fontSize="xs"
                  cursor="pointer"
                  color="fg.muted"
                  _hover={{ bg: "bg.subtle", color: "fg" }}
                >
                  <Text maxW="160px" truncate>
                    {vaultName}
                  </Text>
                  <LuChevronDown size={10} />
                </Box>
              </Menu.Trigger>
              <Portal>
                <Menu.Positioner>
                  <Menu.Content>
                    {vaults.map((v) => (
                      <Menu.Item
                        key={v}
                        value={v}
                        onSelect={() => switchVault(v)}
                        fontWeight={v === vaultPath ? "bold" : "normal"}
                      >
                        {v.split("/").pop()}
                      </Menu.Item>
                    ))}
                    {vaults.length > 0 && <Menu.Separator />}
                    <Menu.Item value="open" onSelect={openVault}>
                      <LuPlus size={14} />
                      <Text>Open folder...</Text>
                    </Menu.Item>
                  </Menu.Content>
                </Menu.Positioner>
              </Portal>
            </Menu.Root>
          </>
        )}
      </HStack>

      {/* Right — environment + actions */}
      <HStack gap={1}>
        <Menu.Root>
          <Menu.Trigger asChild>
            <Box
              as="button"
              display="flex"
              alignItems="center"
              gap={1.5}
              px={2.5}
              py={1}
              rounded="md"
              fontSize="xs"
              cursor="pointer"
              _hover={{ bg: "bg.subtle" }}
            >
              <LuGlobe size={14} />
              <Text maxW="128px" truncate>
                {activeEnvironment?.name ?? "No env"}
              </Text>
              {activeEnvironment && (
                <Badge size="xs" colorPalette="green" variant="subtle">
                  active
                </Badge>
              )}
              <LuChevronDown size={12} />
            </Box>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content>
                <Menu.Item
                  value="none"
                  onSelect={() => switchEnvironment(null)}
                  fontWeight={!activeEnvironment ? "bold" : "normal"}
                  color={!activeEnvironment ? "fg" : "fg.muted"}
                >
                  No environment
                </Menu.Item>
                {environments.length > 0 && <Menu.Separator />}
                {environments.map((env) => (
                  <Menu.Item
                    key={env.id}
                    value={env.id}
                    onSelect={() => switchEnvironment(env.id)}
                    fontWeight={env.is_active ? "bold" : "normal"}
                  >
                    {env.name}
                  </Menu.Item>
                ))}
                <Menu.Separator />
                <Menu.Item value="manage" onSelect={openManager}>
                  <LuSettings size={14} />
                  <Text>Manage environments...</Text>
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>

        <Box w="1px" h="16px" bg="border" mx={1} />

        <IconButton
          aria-label={
            schemaPanelOpen ? "Close schema panel" : "Open schema panel"
          }
          variant="ghost"
          size="sm"
          onClick={onToggleSchemaPanel}
          color={schemaPanelOpen ? "brand.400" : undefined}
        >
          <LuDatabase />
        </IconButton>
        <IconButton
          aria-label={chatOpen ? "Close chat" : "Open chat"}
          variant="ghost"
          size="sm"
          onClick={onToggleChat}
          color={chatOpen ? "brand.400" : undefined}
        >
          <LuMessageSquare />
        </IconButton>
        <IconButton
          aria-label="Settings"
          variant="ghost"
          size="sm"
          onClick={openSettings}
        >
          <LuSettings />
        </IconButton>
      </HStack>
    </HStack>
  );
}
