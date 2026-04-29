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
import {
  LuX,
  LuPlugZap,
  LuChevronDown,
  LuChevronRight,
  LuFolderOpen,
  LuDatabase,
  LuLock,
} from "react-icons/lu";
import { open } from "@tauri-apps/plugin-dialog";
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

interface ConnectionFormProps {
  connection: Connection | null;
  onClose: () => void;
}

type Driver = "postgres" | "mysql" | "sqlite";

const DRIVER_CONFIG: Record<
  Driver,
  { label: string; color: string; defaultPort: string }
> = {
  postgres: { label: "PostgreSQL", color: "blue", defaultPort: "5432" },
  mysql: { label: "MySQL", color: "orange", defaultPort: "3306" },
  sqlite: { label: "SQLite", color: "green", defaultPort: "" },
};

const SSL_MODES = ["disable", "require", "verify-ca", "verify-full"];

function buildConnectionPreview(
  driver: Driver,
  host: string,
  port: string,
  dbName: string,
  username: string,
): string {
  if (driver === "sqlite") return dbName || "path/to/database.db";
  const user = username || "user";
  const h = host || "localhost";
  const p = port || DRIVER_CONFIG[driver].defaultPort;
  const db = dbName || "database";
  return `${driver}://${user}@${h}:${p}/${db}`;
}

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

  // Update default port when driver changes
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

          {/* Body */}
          <VStack gap={0} align="stretch">
            {/* Name + Driver section */}
            <VStack gap={3} p={4} pb={3} align="stretch">
              <Input
                size="sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Connection name"
                fontWeight="medium"
              />

              {/* Driver selector */}
              <HStack gap={1} p={0.5} bg="bg.subtle" rounded="md">
                {(
                  Object.entries(DRIVER_CONFIG) as [
                    Driver,
                    typeof DRIVER_CONFIG.postgres,
                  ][]
                ).map(([key, cfg]) => (
                  <Box
                    key={key}
                    as="button"
                    flex={1}
                    py={1.5}
                    rounded="sm"
                    fontSize="xs"
                    fontWeight="medium"
                    textAlign="center"
                    bg={driver === key ? "bg" : "transparent"}
                    color={driver === key ? `${cfg.color}.400` : "fg.muted"}
                    shadow={driver === key ? "xs" : "none"}
                    cursor="pointer"
                    _hover={{ color: driver === key ? undefined : "fg" }}
                    onClick={() => setDriver(key)}
                  >
                    {cfg.label}
                  </Box>
                ))}
              </HStack>
            </VStack>

            {/* Connection details section */}
            <Box bg="bg.subtle" mx={4} rounded="lg" p={3} mb={3}>
              <VStack gap={2.5} align="stretch">
                {isSqlite ? (
                  /* SQLite: file path */
                  <Box>
                    <Text fontSize="2xs" color="fg.muted" mb={1}>
                      FILE PATH
                    </Text>
                    <Flex gap={1}>
                      <Input
                        size="sm"
                        flex={1}
                        value={dbName}
                        onChange={(e) => setDbName(e.target.value)}
                        placeholder="/path/to/database.db"
                        fontFamily="mono"
                        fontSize="xs"
                      />
                      <IconButton
                        aria-label="Browse"
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const selected = await open({
                            multiple: false,
                            filters: [
                              {
                                name: "SQLite",
                                extensions: ["db", "sqlite", "sqlite3"],
                              },
                              { name: "All", extensions: ["*"] },
                            ],
                          });
                          if (selected) setDbName(selected);
                        }}
                      >
                        <LuFolderOpen />
                      </IconButton>
                    </Flex>
                  </Box>
                ) : (
                  <>
                    {/* Host + Port */}
                    <HStack gap={2}>
                      <Box flex={1}>
                        <Text fontSize="2xs" color="fg.muted" mb={1}>
                          HOST
                        </Text>
                        <Input
                          size="sm"
                          value={host}
                          onChange={(e) => setHost(e.target.value)}
                          placeholder="localhost"
                        />
                      </Box>
                      <Box w="80px">
                        <Text fontSize="2xs" color="fg.muted" mb={1}>
                          PORT
                        </Text>
                        <Input
                          size="sm"
                          value={port}
                          onChange={(e) => setPort(e.target.value)}
                          placeholder={DRIVER_CONFIG[driver].defaultPort}
                        />
                      </Box>
                    </HStack>

                    {/* Database */}
                    <Box>
                      <Text fontSize="2xs" color="fg.muted" mb={1}>
                        DATABASE
                      </Text>
                      <Input
                        size="sm"
                        value={dbName}
                        onChange={(e) => setDbName(e.target.value)}
                        placeholder="mydb"
                      />
                    </Box>

                    {/* Username + Password */}
                    <HStack gap={2}>
                      <Box flex={1}>
                        <Text fontSize="2xs" color="fg.muted" mb={1}>
                          USERNAME
                        </Text>
                        <Input
                          size="sm"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder={driver === "mysql" ? "root" : "postgres"}
                        />
                      </Box>
                      <Box flex={1}>
                        <Text fontSize="2xs" color="fg.muted" mb={1}>
                          PASSWORD
                        </Text>
                        <HStack gap={0}>
                          <Input
                            size="sm"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            borderRight="none"
                            roundedRight={0}
                          />
                          <Flex
                            align="center"
                            px={2}
                            border="1px solid"
                            borderColor="border"
                            borderLeft="none"
                            roundedRight="md"
                            h="32px"
                            color="fg.muted"
                          >
                            <LuLock size={12} />
                          </Flex>
                        </HStack>
                      </Box>
                    </HStack>

                    {/* SSL Mode */}
                    <Box>
                      <Text fontSize="2xs" color="fg.muted" mb={1}>
                        SSL
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
                  </>
                )}
              </VStack>
            </Box>

            {/* Connection string preview */}
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

            {/* Advanced settings */}
            <Box mx={4} mb={3}>
              <Flex
                align="center"
                gap={1}
                cursor="pointer"
                color="fg.muted"
                fontSize="xs"
                onClick={() => setShowAdvanced(!showAdvanced)}
                _hover={{ color: "fg" }}
              >
                {showAdvanced ? (
                  <LuChevronDown size={12} />
                ) : (
                  <LuChevronRight size={12} />
                )}
                <Text fontSize="2xs">Advanced</Text>
              </Flex>

              {showAdvanced && (
                <Box bg="bg.subtle" rounded="lg" p={3} mt={2}>
                  <VStack gap={2} align="stretch">
                    <HStack gap={2}>
                      <Box flex={1}>
                        <Text fontSize="2xs" color="fg.muted" mb={1}>
                          CONNECT TIMEOUT
                        </Text>
                        <Input
                          size="sm"
                          value={timeoutMs}
                          onChange={(e) => setTimeoutMs(e.target.value)}
                          placeholder="10000"
                        />
                      </Box>
                      <Box flex={1}>
                        <Text fontSize="2xs" color="fg.muted" mb={1}>
                          QUERY TIMEOUT
                        </Text>
                        <Input
                          size="sm"
                          value={queryTimeoutMs}
                          onChange={(e) => setQueryTimeoutMs(e.target.value)}
                          placeholder="30000"
                        />
                      </Box>
                    </HStack>
                    <HStack gap={2}>
                      <Box flex={1}>
                        <Text fontSize="2xs" color="fg.muted" mb={1}>
                          TTL (SECONDS)
                        </Text>
                        <Input
                          size="sm"
                          value={ttlSeconds}
                          onChange={(e) => setTtlSeconds(e.target.value)}
                          placeholder="300"
                        />
                      </Box>
                      <Box flex={1}>
                        <Text fontSize="2xs" color="fg.muted" mb={1}>
                          MAX POOL SIZE
                        </Text>
                        <Input
                          size="sm"
                          value={maxPoolSize}
                          onChange={(e) => setMaxPoolSize(e.target.value)}
                          placeholder="5"
                        />
                      </Box>
                    </HStack>
                  </VStack>
                </Box>
              )}
            </Box>

            {/* Test result */}
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

            {/* Error */}
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
