import { Box, Flex, HStack, Input, Text, VStack } from "@chakra-ui/react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";

interface AdvancedFieldsProps {
  open: boolean;
  onToggle: () => void;
  timeoutMs: string;
  onTimeoutMsChange: (next: string) => void;
  queryTimeoutMs: string;
  onQueryTimeoutMsChange: (next: string) => void;
  ttlSeconds: string;
  onTtlSecondsChange: (next: string) => void;
  maxPoolSize: string;
  onMaxPoolSizeChange: (next: string) => void;
}

/** Advanced connection settings (collapsible). Connect timeout,
 * query timeout, pool TTL, and max pool size — all numeric inputs.
 * Defaults are filled at the parent level so values match what the
 * backend uses. */
export function AdvancedFields({
  open,
  onToggle,
  timeoutMs,
  onTimeoutMsChange,
  queryTimeoutMs,
  onQueryTimeoutMsChange,
  ttlSeconds,
  onTtlSecondsChange,
  maxPoolSize,
  onMaxPoolSizeChange,
}: AdvancedFieldsProps) {
  return (
    <Box mx={4} mb={3}>
      <Flex
        align="center"
        gap={1}
        cursor="pointer"
        color="fg.muted"
        fontSize="xs"
        onClick={onToggle}
        _hover={{ color: "fg" }}
        data-testid="advanced-toggle"
      >
        {open ? <LuChevronDown size={12} /> : <LuChevronRight size={12} />}
        <Text fontSize="2xs">Advanced</Text>
      </Flex>

      {open && (
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
                  onChange={(e) => onTimeoutMsChange(e.target.value)}
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
                  onChange={(e) => onQueryTimeoutMsChange(e.target.value)}
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
                  onChange={(e) => onTtlSecondsChange(e.target.value)}
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
                  onChange={(e) => onMaxPoolSizeChange(e.target.value)}
                  placeholder="5"
                />
              </Box>
            </HStack>
          </VStack>
        </Box>
      )}
    </Box>
  );
}
