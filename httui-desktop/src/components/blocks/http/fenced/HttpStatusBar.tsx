import {
  Box,
  Flex,
  HStack,
  IconButton,
  Menu,
  Portal,
  Text,
} from "@chakra-ui/react";
import { LuDownload } from "react-icons/lu";
import type { HttpResponseFull } from "@/lib/tauri/streamedExecution";
import {
  formatBytes,
  relativeTimeAgo,
  statusDotColor,
  type ExecutionState,
  type SendAsFormat,
} from "./shared";

interface HttpStatusBarProps {
  alias: string | undefined;
  host: string | null;
  executionState: ExecutionState;
  response: HttpResponseFull | null;
  durationMs: number | null;
  cached: boolean;
  lastRunAt: Date | null;
  /**
   * Cumulative body bytes received during a streamed response. Only
   * displayed while the request is running and at least one BodyChunk
   * has been delivered (Onda 4 progress indicator).
   */
  downloadingBytes: number;
  onSendAs: (format: SendAsFormat) => void;
}

export function HttpStatusBar({
  alias,
  host,
  executionState,
  response,
  durationMs,
  cached,
  lastRunAt,
  downloadingBytes,
  onSendAs,
}: HttpStatusBarProps) {
  const status = response?.status_code;
  const dotColor = statusDotColor(status);
  const ago = relativeTimeAgo(lastRunAt);

  let label: string;
  if (executionState === "running") label = "running";
  else if (executionState === "cancelled") label = "cancelled";
  else if (executionState === "error") label = "error";
  else if (status) label = `${status}`;
  else label = "idle";

  return (
    <Flex
      align="center"
      gap={2}
      px={3}
      py={1}
      bg="bg.subtle"
      borderBottomRadius="md"
      fontFamily="mono"
      fontSize="xs"
      color="fg.subtle"
      minH="24px"
    >
      <HStack gap={1.5}>
        <Box w={1.5} h={1.5} borderRadius="full" bg={dotColor} />
        <Text>{label}</Text>
      </HStack>
      {host && <Text>· {host}</Text>}
      {executionState === "running" && downloadingBytes > 0 && (
        <Text>· downloading {formatBytes(downloadingBytes)}…</Text>
      )}
      {durationMs !== null && executionState !== "running" && (
        <Text>· {durationMs}ms</Text>
      )}
      {response && executionState !== "running" && (
        <Text>· {formatBytes(response.size_bytes)}</Text>
      )}
      {ago && executionState !== "running" && <Text>· ran {ago}</Text>}
      {cached && <Text>· cached</Text>}
      {alias && <Text>· {alias}</Text>}
      <Box flex={1} />
      <Text>⌘↵ to run · ⌘. to cancel</Text>
      <Menu.Root positioning={{ placement: "top-end" }}>
        <Menu.Trigger asChild>
          <IconButton
            aria-label="Send as / copy snippet"
            size="2xs"
            variant="ghost"
            title="Send as / copy snippet"
          >
            <LuDownload />
          </IconButton>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content minW="200px" py={1}>
              <Menu.Item value="curl" onSelect={() => onSendAs("curl")}>
                Copy as cURL
              </Menu.Item>
              <Menu.Item value="fetch" onSelect={() => onSendAs("fetch")}>
                Copy as fetch (JS)
              </Menu.Item>
              <Menu.Item value="python" onSelect={() => onSendAs("python")}>
                Copy as Python (requests)
              </Menu.Item>
              <Menu.Item value="httpie" onSelect={() => onSendAs("httpie")}>
                Copy as HTTPie
              </Menu.Item>
              <Menu.Separator />
              <Menu.Item
                value="http-file"
                onSelect={() => onSendAs("http-file")}
              >
                Save as .http file…
              </Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
    </Flex>
  );
}
