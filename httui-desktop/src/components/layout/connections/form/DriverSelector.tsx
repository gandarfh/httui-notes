import { Box, HStack } from "@chakra-ui/react";

export type Driver = "postgres" | "mysql" | "sqlite";

export interface DriverConfigEntry {
  label: string;
  color: string;
  defaultPort: string;
}

export const DRIVER_CONFIG: Record<Driver, DriverConfigEntry> = {
  postgres: { label: "PostgreSQL", color: "blue", defaultPort: "5432" },
  mysql: { label: "MySQL", color: "orange", defaultPort: "3306" },
  sqlite: { label: "SQLite", color: "green", defaultPort: "" },
};

interface DriverSelectorProps {
  value: Driver;
  onChange: (next: Driver) => void;
}

/** Segmented control choosing the connection driver. Three tab-style
 * pills (Postgres / MySQL / SQLite) with the active one elevated. */
export function DriverSelector({ value, onChange }: DriverSelectorProps) {
  return (
    <HStack gap={1} p={0.5} bg="bg.subtle" rounded="md">
      {(Object.entries(DRIVER_CONFIG) as [Driver, DriverConfigEntry][]).map(
        ([key, cfg]) => (
          <Box
            key={key}
            as="button"
            data-testid={`driver-tab-${key}`}
            data-active={value === key}
            flex={1}
            py={1.5}
            rounded="sm"
            fontSize="xs"
            fontWeight="medium"
            textAlign="center"
            bg={value === key ? "bg" : "transparent"}
            color={value === key ? `${cfg.color}.400` : "fg.muted"}
            shadow={value === key ? "xs" : "none"}
            cursor="pointer"
            _hover={{ color: value === key ? undefined : "fg" }}
            onClick={() => onChange(key)}
          >
            {cfg.label}
          </Box>
        ),
      )}
    </HStack>
  );
}
