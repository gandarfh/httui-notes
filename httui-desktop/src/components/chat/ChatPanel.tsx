import { useCallback, useState } from "react";
import { Box, Flex, HStack, Text, IconButton } from "@chakra-ui/react";
import {
  LuMessageSquare,
  LuHistory,
  LuSettings,
  LuFolderOpen,
  LuChartColumn,
} from "react-icons/lu";
import { open } from "@tauri-apps/plugin-dialog";
import { useChatStore } from "@/stores/chat";
import { ChatSessionList } from "./ChatSessionList";
import { ChatConversation } from "./ChatConversation";
import { ChatInput } from "./ChatInput";
import { PermissionBanner } from "./PermissionBanner";
import { PermissionManager } from "./PermissionManager";
import { UsagePanel } from "./UsagePanel";

interface ChatPanelProps {
  width: number;
}

type Tab = "chat" | "sessions" | "usage";

function truncatePath(path: string, segments = 2): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= segments) return path;
  return ".../" + parts.slice(-segments).join("/");
}

export function ChatPanel({ width }: ChatPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [permManagerOpen, setPermManagerOpen] = useState(false);
  const activeSession = useChatStore((s) => s.activeSession);
  const updateCwd = useChatStore((s) => s.updateCwd);

  const handleChangeCwd = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      await updateCwd(selected as string);
    }
  }, [updateCwd]);

  return (
    <Flex
      direction="column"
      w={`${width}px`}
      minW={`${width}px`}
      h="100%"
      borderLeft="1px solid"
      borderColor="border"
      bg="bg"
      overflow="hidden"
    >
      {/* Tab bar */}
      <HStack
        gap={0}
        borderBottom="1px solid"
        borderColor="border"
        flexShrink={0}
      >
        <TabButton
          active={activeTab === "chat"}
          onClick={() => setActiveTab("chat")}
          icon={<LuMessageSquare size={13} />}
          label="Chat"
        />
        <TabButton
          active={activeTab === "sessions"}
          onClick={() => setActiveTab("sessions")}
          icon={<LuHistory size={13} />}
          label="Sessions"
        />
        <TabButton
          active={activeTab === "usage"}
          onClick={() => setActiveTab("usage")}
          icon={<LuChartColumn size={13} />}
          label="Usage"
        />
        <IconButton
          aria-label="Permission settings"
          size="xs"
          variant="ghost"
          color="fg.muted"
          _hover={{ color: "fg" }}
          onClick={() => setPermManagerOpen(true)}
          mx={1}
        >
          <LuSettings size={13} />
        </IconButton>
      </HStack>

      {/* Session header with CWD */}
      {activeTab === "chat" && activeSession && (
        <HStack
          px={2}
          py={1}
          borderBottom="1px solid"
          borderColor="border"
          bg="bg.subtle"
          flexShrink={0}
          gap={1}
        >
          <LuFolderOpen size={11} style={{ flexShrink: 0, opacity: 0.5 }} />
          <Text
            fontSize="2xs"
            color="fg.muted"
            flex={1}
            truncate
            cursor="pointer"
            _hover={{ color: "fg" }}
            onClick={handleChangeCwd}
            title={activeSession.cwd ?? "Click to set working directory"}
          >
            {activeSession.cwd
              ? truncatePath(activeSession.cwd)
              : "No working directory"}
          </Text>
        </HStack>
      )}

      {/* Content */}
      {activeTab === "chat" ? (
        <>
          <ChatConversation />
          <PermissionBanner />
          <ChatInput />
        </>
      ) : activeTab === "sessions" ? (
        <ChatSessionList onSelectSession={() => setActiveTab("chat")} />
      ) : (
        <UsagePanel />
      )}

      <PermissionManager
        open={permManagerOpen}
        onClose={() => setPermManagerOpen(false)}
      />
    </Flex>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Box
      as="button"
      flex={1}
      display="flex"
      alignItems="center"
      justifyContent="center"
      gap={1.5}
      py={2}
      fontSize="xs"
      fontWeight={active ? "semibold" : "normal"}
      color={active ? "fg" : "fg.muted"}
      borderBottom="2px solid"
      borderColor={active ? "brand.500" : "transparent"}
      cursor="pointer"
      _hover={{ bg: "bg.subtle" }}
      onClick={onClick}
    >
      {icon}
      <Text fontSize="xs">{label}</Text>
    </Box>
  );
}
