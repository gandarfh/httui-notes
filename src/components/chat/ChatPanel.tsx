import { Flex } from "@chakra-ui/react";
import { ChatSessionList } from "./ChatSessionList";
import { ChatConversation } from "./ChatConversation";
import { ChatInput } from "./ChatInput";
import { PermissionBanner } from "./PermissionBanner";

interface ChatPanelProps {
  width: number;
}

export function ChatPanel({ width }: ChatPanelProps) {
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
      <ChatSessionList />
      <ChatConversation />
      <PermissionBanner />
      <ChatInput />
    </Flex>
  );
}
