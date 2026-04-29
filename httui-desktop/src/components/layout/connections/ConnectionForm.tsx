import {
  Box,
  Flex,
  HStack,
  VStack,
  Text,
  Input,
  Badge,
  Spinner,
  IconButton,
  Portal,
} from "@chakra-ui/react";
import { LuX, LuPlugZap, LuDatabase } from "react-icons/lu";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  Connection,
  CreateConnectionInput,
} from "@/lib/tauri/connections";
import {
  createConnection,
  updateConnection,
  testConnection,
} from "@/lib/tauri/connections";

import {
  DriverSelector,
  DRIVER_CONFIG,
  type Driver,
} from "./form/DriverSelector";
import { SqliteFields } from "./form/SqliteFields";
import { NetworkFields } from "./form/NetworkFields";
import { AdvancedFields } from "./form/AdvancedFields";
import { buildConnectionPreview } from "./form/connection-string";

interface ConnectionFormProps {
  connection: Connection | null;
  onClose: () => void;
}

/** Modal form for creating / editing a database connection. Holds
 * all field state (kept inline because the form's commit semantics —
 * one Save button writing all fields atomically — don't benefit from
 * splitting state into hooks). The visual sections delegate to
 * `form/*` sub-components for size hygiene. */
export function ConnectionForm({ connection, onClose }: ConnectionFormProps) {
  const isEdit = connection !== null;
  const overlayRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState(connection?.name ?? "");
  const [driver, setDriver] = useState<Driver>(
    (connection?.driver as Driver) ?? "postgres",
  );
  const [host, setHost] = useState(connection?.host ?? "localhost");
  const [port, setPort] = useState(connection?.port?.toString() ?? "5432");
  const [dbName, setDbName] = useState(connection?.database_name ?? "");
  const [username, setUsername] = useState(connection?.username ?? "");
  const [password, setPassword] = useState("");
  const [sslMode, setSslMode] = useState(connection?.ssl_mode ?? "disable");

  // Advanced
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [timeoutMs, setTimeoutMs] = useState(
    (connection?.timeout_ms ?? 10000).toString(),
  );
  const [queryTimeoutMs, setQueryTimeoutMs] = useState(
    (connection?.query_timeout_ms ?? 30000).toString(),
  );
  const [ttlSeconds, setTtlSeconds] = useState(
    (connection?.ttl_seconds ?? 300).toString(),
  );
  const [maxPoolSize, setMaxPoolSize] = useState(
    (connection?.max_pool_size ?? 5).toString(),
  );

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(
    null,
  );
  const [testError, setTestError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Update default port when driver changes (only on new — editing
  // keeps the existing port even if the driver is somehow swapped).
  useEffect(() => {
    if (!isEdit) {
      setPort(DRIVER_CONFIG[driver].defaultPort);
    }
  }, [driver, isEdit]);

  const handleSave = useCallback(async () => {
    setError(null);
    setSaving(true);

    try {
      const input: CreateConnectionInput = {
        name,
        driver,
        ...(driver !== "sqlite" && { host, port: parseInt(port) || undefined }),
        database_name: dbName || undefined,
        ...(driver !== "sqlite" && { username: username || undefined }),
        ...(driver !== "sqlite" && { password: password || undefined }),
        ...(driver !== "sqlite" && { ssl_mode: sslMode }),
        timeout_ms: parseInt(timeoutMs) || undefined,
        query_timeout_ms: parseInt(queryTimeoutMs) || undefined,
        ttl_seconds: parseInt(ttlSeconds) || undefined,
        max_pool_size: parseInt(maxPoolSize) || undefined,
      };

      if (isEdit && connection) {
        await updateConnection(connection.id, input);
      } else {
        await createConnection(input);
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [
    name,
    driver,
    host,
    port,
    dbName,
    username,
    password,
    sslMode,
    timeoutMs,
    queryTimeoutMs,
    ttlSeconds,
    maxPoolSize,
    isEdit,
    connection,
    onClose,
  ]);

  const handleTest = useCallback(async () => {
    if (!isEdit || !connection) return;
    setTesting(true);
    setTestResult(null);
    setTestError(null);

    try {
      await testConnection(connection.id);
      setTestResult("success");
    } catch (err) {
      setTestResult("error");
      setTestError(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  }, [isEdit, connection]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const isSqlite = driver === "sqlite";
  const driverColor = DRIVER_CONFIG[driver].color;

  return (
    <Portal>
      <Box
        ref={overlayRef}
        position="fixed"
        inset={0}
        bg="blackAlpha.600"
        zIndex={1000}
        display="flex"
        alignItems="center"
        justifyContent="center"
        onClick={handleOverlayClick}
      >
        <Box
          bg="bg"
          border="1px solid"
          borderColor="border"
          rounded="xl"
          shadow="2xl"
          w="440px"
          maxH="85vh"
          overflowY="auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <Flex
            align="center"
            px={5}
            py={3}
            borderBottom="1px solid"
            borderColor="border"
          >
            <HStack gap={2} flex={1}>
              <Box color={`${driverColor}.400`}>
                <LuDatabase size={16} />
              </Box>
              <Text fontWeight="semibold" fontSize="sm">
                {isEdit ? "Edit Connection" : "New Connection"}
              </Text>
            </HStack>
            <IconButton
              aria-label="Close"
              variant="ghost"
              size="xs"
              onClick={onClose}
            >
              <LuX />
            </IconButton>
          </Flex>

          <VStack gap={0} align="stretch">
            {/* Name + Driver picker */}
            <VStack gap={3} p={4} pb={3} align="stretch">
              <Input
                size="sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Connection name"
                fontWeight="medium"
              />
              <DriverSelector value={driver} onChange={setDriver} />
            </VStack>

            {/* Driver-specific fields */}
            <Box bg="bg.subtle" mx={4} rounded="lg" p={3} mb={3}>
              <VStack gap={2.5} align="stretch">
                {isSqlite ? (
                  <SqliteFields dbName={dbName} onDbNameChange={setDbName} />
                ) : (
                  <NetworkFields
                    driver={driver}
                    host={host}
                    onHostChange={setHost}
                    port={port}
                    onPortChange={setPort}
                    dbName={dbName}
                    onDbNameChange={setDbName}
                    username={username}
                    onUsernameChange={setUsername}
                    password={password}
                    onPasswordChange={setPassword}
                    sslMode={sslMode}
                    onSslModeChange={setSslMode}
                  />
                )}
              </VStack>
            </Box>

            {/* Connection-string preview */}
            <Box mx={4} mb={3}>
              <Text
                fontSize="2xs"
                fontFamily="mono"
                color="fg.muted"
                bg="bg.subtle"
                px={3}
                py={1.5}
                rounded="md"
                truncate
              >
                {buildConnectionPreview(driver, host, port, dbName, username)}
              </Text>
            </Box>

            <AdvancedFields
              open={showAdvanced}
              onToggle={() => setShowAdvanced(!showAdvanced)}
              timeoutMs={timeoutMs}
              onTimeoutMsChange={setTimeoutMs}
              queryTimeoutMs={queryTimeoutMs}
              onQueryTimeoutMsChange={setQueryTimeoutMs}
              ttlSeconds={ttlSeconds}
              onTtlSecondsChange={setTtlSeconds}
              maxPoolSize={maxPoolSize}
              onMaxPoolSizeChange={setMaxPoolSize}
            />

            {testResult && (
              <Box mx={4} mb={3}>
                <Badge
                  colorPalette={testResult === "success" ? "green" : "red"}
                  variant="subtle"
                  px={2}
                  py={1}
                  fontSize="xs"
                  w="100%"
                >
                  {testResult === "success"
                    ? "Connection successful"
                    : `Connection failed${testError ? `: ${testError}` : ""}`}
                </Badge>
              </Box>
            )}

            {error && (
              <Box mx={4} mb={3}>
                <Badge
                  colorPalette="red"
                  variant="subtle"
                  px={2}
                  py={1}
                  fontSize="xs"
                  w="100%"
                >
                  {error}
                </Badge>
              </Box>
            )}
          </VStack>

          {/* Footer */}
          <Flex
            px={4}
            py={3}
            borderTop="1px solid"
            borderColor="border"
            gap={2}
            justify="flex-end"
          >
            {isEdit && (
              <Box
                as="button"
                display="flex"
                alignItems="center"
                gap={1}
                px={3}
                py={1.5}
                rounded="md"
                fontSize="sm"
                bg="bg.subtle"
                _hover={{ bg: "bg.emphasized" }}
                onClick={handleTest}
                opacity={testing ? 0.5 : 1}
                pointerEvents={testing ? "none" : "auto"}
                mr="auto"
              >
                {testing ? <Spinner size="xs" /> : <LuPlugZap size={14} />}
                <Text fontSize="xs">Test</Text>
              </Box>
            )}
            <Box
              as="button"
              px={3}
              py={1.5}
              rounded="md"
              fontSize="sm"
              bg="bg.subtle"
              _hover={{ bg: "bg.emphasized" }}
              onClick={onClose}
            >
              Cancel
            </Box>
            <Box
              as="button"
              px={4}
              py={1.5}
              rounded="md"
              fontSize="sm"
              fontWeight="medium"
              bg={`${driverColor}.500`}
              color="white"
              _hover={{ bg: `${driverColor}.600` }}
              onClick={handleSave}
              opacity={saving || !name.trim() ? 0.5 : 1}
              pointerEvents={saving || !name.trim() ? "none" : "auto"}
            >
              {saving ? <Spinner size="xs" /> : isEdit ? "Save" : "Create"}
            </Box>
          </Flex>
        </Box>
      </Box>
    </Portal>
  );
}
