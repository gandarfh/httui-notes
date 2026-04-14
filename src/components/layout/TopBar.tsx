import { HStack, Text, IconButton, Box, Menu, Portal } from "@chakra-ui/react";
import { ColorModeButton } from "@/components/ui/color-mode";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  LuMenu,
  LuSearch,
  LuFolder,
  LuPlus,
  LuChevronDown,
} from "react-icons/lu";

interface TopBarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function TopBar({ sidebarOpen, onToggleSidebar }: TopBarProps) {
  const { vaultPath, vaults, switchVault, openVault } = useWorkspace();
  const vaultName = vaultPath ? vaultPath.split("/").pop() || vaultPath : null;

  return (
    <HStack
      h="48px"
      px={2}
      bg="bg"
      borderBottomWidth="1px"
      borderColor="border"
      justify="space-between"
      flexShrink={0}
    >
      {/* Left */}
      <HStack gap={2}>
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
      </HStack>

      {/* Center */}
      <HStack gap={2}>
        <Menu.Root>
          <Menu.Trigger asChild>
            <Box
              as="button"
              display="flex"
              alignItems="center"
              gap={1.5}
              px={3}
              py={1}
              rounded="md"
              fontSize="sm"
              cursor="pointer"
              _hover={{ bg: "bg.subtle" }}
            >
              <LuFolder size={14} />
              <Text fontSize="xs" maxW="128px" truncate>
                {vaultName ?? "Open Vault"}
              </Text>
              <LuChevronDown size={12} />
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
      </HStack>

      {/* Right */}
      <HStack gap={1}>
        <IconButton
          aria-label="Search"
          variant="ghost"
          size="sm"
          disabled
        >
          <LuSearch />
        </IconButton>
        <ColorModeButton />
      </HStack>
    </HStack>
  );
}
