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
import { NativeSelectRoot, NativeSelectField } from "@chakra-ui/react";
import { LuX, LuPlugZap, LuChevronDown, LuChevronRight } from "react-icons/lu";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Connection, CreateConnectionInput } from "@/lib/tauri/connections";
import {
  createConnection,
  updateConnection,
  testConnection,
} from "@/lib/tauri/connections";

interface ConnectionFormProps {
  connection: Connection | null;
  onClose: () => void;
}

type Driver = "postgres" | "mysql" | "sqlite";

const DRIVERS: { value: Driver; label: string }[] = [
  { value: "postgres", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL" },
  { value: "sqlite", label: "SQLite" },
];

const SSL_MODES = ["disable", "require", "verify-ca", "verify-full"];

export function ConnectionForm({ connection, onClose }: ConnectionFormProps) {
  const isEdit = connection !== null;
  const overlayRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState(connection?.name ?? "");
  const [driver, setDriver] = useState<Driver>(
    (connection?.driver as Driver) ?? "postgres",
  );
  const [host, setHost] = useState(connection?.host ?? "localhost");
  const [port, setPort] = useState(
    connection?.port?.toString() ?? "5432",
  );
  const [dbName, setDbName] = useState(connection?.database_name ?? "");
  const [username, setUsername] = useState(connection?.username ?? "");
  const [password, setPassword] = useState(connection?.password ?? "");
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
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Update default port when driver changes
  useEffect(() => {
    if (!isEdit) {
      if (driver === "postgres") setPort("5432");
      else if (driver === "mysql") setPort("3306");
      else setPort("");
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
        ssl_mode: sslMode,
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
    name, driver, host, port, dbName, username, password, sslMode,
    timeoutMs, queryTimeoutMs, ttlSeconds, maxPoolSize,
    isEdit, connection, onClose,
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

  // Close on click outside
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
          rounded="lg"
          shadow="lg"
          w="420px"
          maxH="80vh"
          overflowY="auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <Flex align="center" px={4} py={3} borderBottom="1px solid" borderColor="border">
            <Text fontWeight="semibold" fontSize="sm" flex={1}>
              {isEdit ? "Edit Connection" : "New Connection"}
            </Text>
            <IconButton
              aria-label="Close"
              variant="ghost"
              size="xs"
              onClick={onClose}
            >
              <LuX />
            </IconButton>
          </Flex>

          {/* Body */}
          <VStack gap={3} p={4} align="stretch">
            {/* Name */}
            <Box>
              <Text fontSize="xs" fontWeight="medium" mb={1} color="fg.muted">
                Name
              </Text>
              <Input
                size="sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Database"
              />
            </Box>

            {/* Driver */}
            <Box>
              <Text fontSize="xs" fontWeight="medium" mb={1} color="fg.muted">
                Driver
              </Text>
              <NativeSelectRoot size="sm">
                <NativeSelectField
                  value={driver}
                  onChange={(e) => setDriver(e.target.value as Driver)}
                >
                  {DRIVERS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </NativeSelectField>
              </NativeSelectRoot>
            </Box>

            {/* Host + Port (not for SQLite) */}
            {!isSqlite && (
              <HStack gap={2}>
                <Box flex={1}>
                  <Text fontSize="xs" fontWeight="medium" mb={1} color="fg.muted">
                    Host
                  </Text>
                  <Input
                    size="sm"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="localhost"
                  />
                </Box>
                <Box w="80px">
                  <Text fontSize="xs" fontWeight="medium" mb={1} color="fg.muted">
                    Port
                  </Text>
                  <Input
                    size="sm"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    placeholder="5432"
                  />
                </Box>
              </HStack>
            )}

            {/* Database / File path */}
            <Box>
              <Text fontSize="xs" fontWeight="medium" mb={1} color="fg.muted">
                {isSqlite ? "File Path" : "Database"}
              </Text>
              <Input
                size="sm"
                value={dbName}
                onChange={(e) => setDbName(e.target.value)}
                placeholder={isSqlite ? "/path/to/database.db" : "mydb"}
              />
            </Box>

            {/* Username + Password (not for SQLite) */}
            {!isSqlite && (
              <HStack gap={2}>
                <Box flex={1}>
                  <Text fontSize="xs" fontWeight="medium" mb={1} color="fg.muted">
                    Username
                  </Text>
                  <Input
                    size="sm"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="postgres"
                  />
                </Box>
                <Box flex={1}>
                  <Text fontSize="xs" fontWeight="medium" mb={1} color="fg.muted">
                    Password
                  </Text>
                  <Input
                    size="sm"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="password"
                  />
                </Box>
              </HStack>
            )}

            {/* SSL Mode (not for SQLite) */}
            {!isSqlite && (
              <Box>
                <Text fontSize="xs" fontWeight="medium" mb={1} color="fg.muted">
                  SSL Mode
                </Text>
                <NativeSelectRoot size="sm">
                  <NativeSelectField
                    value={sslMode}
                    onChange={(e) => setSslMode(e.target.value)}
                  >
                    {SSL_MODES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </NativeSelectField>
                </NativeSelectRoot>
              </Box>
            )}

            {/* Advanced settings */}
            <Box>
              <Flex
                align="center"
                gap={1}
                cursor="pointer"
                color="fg.muted"
                fontSize="xs"
                onClick={() => setShowAdvanced(!showAdvanced)}
                _hover={{ color: "fg" }}
              >
                {showAdvanced ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
                Advanced
              </Flex>

              {showAdvanced && (
                <VStack gap={2} mt={2} pl={4} align="stretch">
                  <HStack gap={2}>
                    <Box flex={1}>
                      <Text fontSize="xs" color="fg.muted" mb={1}>
                        Connect timeout (ms)
                      </Text>
                      <Input
                        size="sm"
                        value={timeoutMs}
                        onChange={(e) => setTimeoutMs(e.target.value)}
                      />
                    </Box>
                    <Box flex={1}>
                      <Text fontSize="xs" color="fg.muted" mb={1}>
                        Query timeout (ms)
                      </Text>
                      <Input
                        size="sm"
                        value={queryTimeoutMs}
                        onChange={(e) => setQueryTimeoutMs(e.target.value)}
                      />
                    </Box>
                  </HStack>
                  <HStack gap={2}>
                    <Box flex={1}>
                      <Text fontSize="xs" color="fg.muted" mb={1}>
                        TTL (seconds)
                      </Text>
                      <Input
                        size="sm"
                        value={ttlSeconds}
                        onChange={(e) => setTtlSeconds(e.target.value)}
                      />
                    </Box>
                    <Box flex={1}>
                      <Text fontSize="xs" color="fg.muted" mb={1}>
                        Max pool size
                      </Text>
                      <Input
                        size="sm"
                        value={maxPoolSize}
                        onChange={(e) => setMaxPoolSize(e.target.value)}
                      />
                    </Box>
                  </HStack>
                </VStack>
              )}
            </Box>

            {/* Test result */}
            {testResult && (
              <Badge
                colorPalette={testResult === "success" ? "green" : "red"}
                variant="subtle"
                px={2}
                py={1}
                fontSize="xs"
              >
                {testResult === "success"
                  ? "Connection successful"
                  : `Connection failed${testError ? `: ${testError}` : ""}`}
              </Badge>
            )}

            {/* Error */}
            {error && (
              <Badge colorPalette="red" variant="subtle" px={2} py={1} fontSize="xs">
                {error}
              </Badge>
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
                px={3}
                py={1.5}
                rounded="md"
                fontSize="sm"
                bg="bg.subtle"
                _hover={{ bg: "bg.emphasized" }}
                onClick={handleTest}
                opacity={testing ? 0.5 : 1}
                pointerEvents={testing ? "none" : "auto"}
              >
                <HStack gap={1}>
                  {testing ? <Spinner size="xs" /> : <LuPlugZap size={14} />}
                  <Text>Test</Text>
                </HStack>
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
              px={3}
              py={1.5}
              rounded="md"
              fontSize="sm"
              fontWeight="medium"
              bg="blue.500"
              color="white"
              _hover={{ bg: "blue.600" }}
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
