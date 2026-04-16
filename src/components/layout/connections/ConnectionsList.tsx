import { Box, Flex, HStack, Text, Badge, IconButton, Menu, Portal, Spinner } from "@chakra-ui/react";
import { LuPlus, LuDatabase, LuPencil, LuTrash2, LuPlugZap, LuRefreshCw } from "react-icons/lu";
import { useCallback, useEffect, useState } from "react";
import type { Connection } from "@/lib/tauri/connections";
import {
  listConnections,
  deleteConnection,
  testConnection,
} from "@/lib/tauri/connections";
import { ConnectionForm } from "./ConnectionForm";

const DRIVER_LABELS: Record<string, string> = {
  postgres: "PG",
  mysql: "MY",
  sqlite: "SL",
};

const DRIVER_COLORS: Record<string, string> = {
  postgres: "blue",
  mysql: "orange",
  sqlite: "green",
};

export function ConnectionsList() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [editingConn, setEditingConn] = useState<Connection | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, "success" | "error">>({});

  const refresh = useCallback(async () => {
    try {
      const conns = await listConnections();
      setConnections(conns);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteConnection(id);
        await refresh();
      } catch {
        // ignore
      }
    },
    [refresh],
  );

  const handleTest = useCallback(
    async (id: string) => {
      setTesting(id);
      setTestResults((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      try {
        await testConnection(id);
        setTestResults((prev) => ({ ...prev, [id]: "success" }));
      } catch {
        setTestResults((prev) => ({ ...prev, [id]: "error" }));
      } finally {
        setTesting(null);
      }
    },
    [],
  );

  const handleFormClose = useCallback(() => {
    setShowForm(false);
    setEditingConn(null);
    refresh();
  }, [refresh]);

  return (
    <>
      <HStack px={3} py={2} justify="space-between">
        <Text
          fontSize="xs"
          fontWeight="semibold"
          color="fg.subtle"
          textTransform="uppercase"
          letterSpacing="wider"
        >
          Connections
        </Text>
        <IconButton
          aria-label="New connection"
          variant="ghost"
          size="xs"
          onClick={() => {
            setEditingConn(null);
            setShowForm(true);
          }}
        >
          <LuPlus />
        </IconButton>
      </HStack>

      {connections.length === 0 ? (
        <Box px={3} py={4} textAlign="center">
          <Text fontSize="sm" color="fg.muted">
            No connections
          </Text>
        </Box>
      ) : (
        <Box px={1} pb={2}>
          {connections.map((conn) => (
            <Menu.Root key={conn.id} positioning={{ placement: "bottom-start" }}>
              <Menu.Trigger asChild>
                <Flex
                  align="center"
                  gap={2}
                  px={2}
                  py={1}
                  mx={1}
                  rounded="md"
                  cursor="pointer"
                  _hover={{ bg: "bg.subtle" }}
                  fontSize="sm"
                >
                  <LuDatabase size={14} />
                  <Text flex={1} truncate fontFamily="mono" fontSize="xs">
                    {conn.name}
                  </Text>
                  <Badge
                    size="sm"
                    variant="subtle"
                    colorPalette={DRIVER_COLORS[conn.driver] ?? "gray"}
                    fontFamily="mono"
                    fontSize="2xs"
                  >
                    {DRIVER_LABELS[conn.driver] ?? conn.driver}
                  </Badge>
                  {testing === conn.id ? (
                    <Spinner size="xs" />
                  ) : testResults[conn.id] ? (
                    <Box
                      w={2}
                      h={2}
                      rounded="full"
                      bg={testResults[conn.id] === "success" ? "green.500" : "red.500"}
                    />
                  ) : null}
                </Flex>
              </Menu.Trigger>
              <Portal>
                <Menu.Positioner>
                  <Menu.Content>
                    <Menu.Item
                      value="edit"
                      onSelect={() => {
                        setEditingConn(conn);
                        setShowForm(true);
                      }}
                    >
                      <LuPencil />
                      Edit
                    </Menu.Item>
                    <Menu.Item value="test" onSelect={() => handleTest(conn.id)}>
                      <LuPlugZap />
                      Test Connection
                    </Menu.Item>
                    <Menu.Item value="refresh" onSelect={() => refresh()}>
                      <LuRefreshCw />
                      Refresh
                    </Menu.Item>
                    <Menu.Separator />
                    <Menu.Item
                      value="delete"
                      color="fg.error"
                      onSelect={() => handleDelete(conn.id)}
                    >
                      <LuTrash2 />
                      Delete
                    </Menu.Item>
                  </Menu.Content>
                </Menu.Positioner>
              </Portal>
            </Menu.Root>
          ))}
        </Box>
      )}

      {showForm && (
        <ConnectionForm
          connection={editingConn}
          onClose={handleFormClose}
        />
      )}
    </>
  );
}
