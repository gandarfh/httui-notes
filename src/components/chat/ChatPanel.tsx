import { useState } from "react";
import { Box, Flex, HStack, Text } from "@chakra-ui/react";
import { LuMessageSquare, LuHistory } from "react-icons/lu";
import { ChatSessionList } from "./ChatSessionList";
import { ChatConversation } from "./ChatConversation";
import { ChatInput } from "./ChatInput";
import { PermissionBanner } from "./PermissionBanner";

interface ChatPanelProps {
  width: number;
}

type Tab = "chat" | "sessions";

export function ChatPanel({ width }: ChatPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("chat");

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
      <HStack gap={0} borderBottom="1px solid" borderColor="border" flexShrink={0}>
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
      </HStack>

      {/* Content */}
      {activeTab === "chat" ? (
        <>
          <ChatConversation />
          <PermissionBanner />
          <ChatInput />
        </>
      ) : (
        <ChatSessionList onSelectSession={() => setActiveTab("chat")} />
      )}
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
      borderColor={active ? "blue.500" : "transparent"}
      cursor="pointer"
      _hover={{ bg: "bg.subtle" }}
      onClick={onClick}
    >
      {icon}
      <Text fontSize="xs">{label}</Text>
    </Box>
  );
}
