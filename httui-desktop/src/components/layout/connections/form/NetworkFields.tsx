import { Box, Flex, HStack, Input, Text } from "@chakra-ui/react";
import { NativeSelectRoot, NativeSelectField } from "@chakra-ui/react";
import { LuLock } from "react-icons/lu";

import type { Driver } from "./DriverSelector";
import { DRIVER_CONFIG } from "./DriverSelector";

const SSL_MODES = ["disable", "require", "verify-ca", "verify-full"];

interface NetworkFieldsProps {
  driver: Driver;
  host: string;
  onHostChange: (next: string) => void;
  port: string;
  onPortChange: (next: string) => void;
  dbName: string;
  onDbNameChange: (next: string) => void;
  username: string;
  onUsernameChange: (next: string) => void;
  password: string;
  onPasswordChange: (next: string) => void;
  sslMode: string;
  onSslModeChange: (next: string) => void;
}

/** Postgres / MySQL connection fields: host, port, database name,
 * username, password (locked icon hint about keychain storage), and
 * SSL mode. SQLite gets a different fieldset — see `SqliteFields`. */
export function NetworkFields({
  driver,
  host,
  onHostChange,
  port,
  onPortChange,
  dbName,
  onDbNameChange,
  username,
  onUsernameChange,
  password,
  onPasswordChange,
  sslMode,
  onSslModeChange,
}: NetworkFieldsProps) {
  return (
    <>
      <HStack gap={2}>
        <Box flex={1}>
          <Text fontSize="2xs" color="fg.muted" mb={1}>
            HOST
          </Text>
          <Input
            size="sm"
            value={host}
            onChange={(e) => onHostChange(e.target.value)}
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
            onChange={(e) => onPortChange(e.target.value)}
            placeholder={DRIVER_CONFIG[driver].defaultPort}
          />
        </Box>
      </HStack>

      <Box>
        <Text fontSize="2xs" color="fg.muted" mb={1}>
          DATABASE
        </Text>
        <Input
          size="sm"
          value={dbName}
          onChange={(e) => onDbNameChange(e.target.value)}
          placeholder="mydb"
        />
      </Box>

      <HStack gap={2}>
        <Box flex={1}>
          <Text fontSize="2xs" color="fg.muted" mb={1}>
            USERNAME
          </Text>
          <Input
            size="sm"
            value={username}
            onChange={(e) => onUsernameChange(e.target.value)}
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
              onChange={(e) => onPasswordChange(e.target.value)}
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

      <Box>
        <Text fontSize="2xs" color="fg.muted" mb={1}>
          SSL
        </Text>
        <NativeSelectRoot size="sm">
          <NativeSelectField
            value={sslMode}
            onChange={(e) => onSslModeChange(e.target.value)}
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
  );
}
