import { useState, useEffect, useCallback } from "react";
import { Box, Flex, HStack, VStack, Text } from "@chakra-ui/react";
import { getUsageStats, type DailyUsage } from "@/lib/tauri/chat";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function getDateRange(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function UsagePanel() {
  const [data, setData] = useState<DailyUsage[]>([]);

  const refresh = useCallback(async () => {
    try {
      const { from, to } = getDateRange(30);
      const usage = await getUsageStats(from, to);
      setData(usage);
    } catch (e) {
      console.error("Failed to load usage:", e);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const totalInput = data.reduce((s, d) => s + d.input_tokens, 0);
  const totalOutput = data.reduce((s, d) => s + d.output_tokens, 0);
  const totalCache = data.reduce((s, d) => s + d.cache_read_tokens, 0);
  const cacheEfficiency = totalInput > 0 ? Math.round((totalCache / totalInput) * 100) : 0;

  const maxTokens = Math.max(
    1,
    ...data.map((d) => d.input_tokens + d.output_tokens + d.cache_read_tokens),
  );

  return (
    <Flex direction="column" flex={1} overflow="auto" p={3} gap={3}>
      {/* Summary cards */}
      <HStack gap={2}>
        <StatCard label="Input" value={formatTokens(totalInput)} color="blue.400" />
        <StatCard label="Output" value={formatTokens(totalOutput)} color="green.400" />
        <StatCard label="Cached" value={formatTokens(totalCache)} color="yellow.400" />
      </HStack>

      <HStack gap={2}>
        <Box
          flex={1}
          bg="bg.subtle"
          border="1px solid"
          borderColor="border"
          rounded="md"
          px={2}
          py={1.5}
          textAlign="center"
        >
          <Text fontSize="lg" fontWeight="bold" color="fg">
            {cacheEfficiency}%
          </Text>
          <Text fontSize="2xs" color="fg.muted">
            Cache efficiency
          </Text>
        </Box>
        <Box
          flex={1}
          bg="bg.subtle"
          border="1px solid"
          borderColor="border"
          rounded="md"
          px={2}
          py={1.5}
          textAlign="center"
        >
          <Text fontSize="lg" fontWeight="bold" color="fg">
            {formatTokens(totalInput + totalOutput)}
          </Text>
          <Text fontSize="2xs" color="fg.muted">
            Total (30d)
          </Text>
        </Box>
      </HStack>

      {/* Bar chart */}
      <Box>
        <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mb={2}>
          Tokens per day (last 30 days)
        </Text>

        {data.length === 0 ? (
          <Text fontSize="sm" color="fg.muted" textAlign="center" py={4}>
            No usage data yet
          </Text>
        ) : (
          <VStack gap={0.5} align="stretch">
            {data.map((day) => {
              const total = day.input_tokens + day.output_tokens + day.cache_read_tokens;
              const pct = (total / maxTokens) * 100;
              const inputPct = total > 0 ? (day.input_tokens / total) * pct : 0;
              const outputPct = total > 0 ? (day.output_tokens / total) * pct : 0;
              const cachePct = total > 0 ? (day.cache_read_tokens / total) * pct : 0;

              return (
                <HStack key={day.date} gap={1.5} h="18px">
                  <Text fontSize="2xs" color="fg.muted" w="45px" flexShrink={0} textAlign="right">
                    {day.date.slice(5)}
                  </Text>
                  <Flex flex={1} h="12px" rounded="sm" overflow="hidden" bg="bg.subtle">
                    {inputPct > 0 && (
                      <Box w={`${inputPct}%`} bg="blue.400" transition="width 0.2s" />
                    )}
                    {outputPct > 0 && (
                      <Box w={`${outputPct}%`} bg="green.400" transition="width 0.2s" />
                    )}
                    {cachePct > 0 && (
                      <Box w={`${cachePct}%`} bg="yellow.400" transition="width 0.2s" />
                    )}
                  </Flex>
                  <Text fontSize="2xs" color="fg.muted" w="35px" flexShrink={0}>
                    {formatTokens(total)}
                  </Text>
                </HStack>
              );
            })}
          </VStack>
        )}
      </Box>

      {/* Legend */}
      <HStack gap={3} justifyContent="center">
        <HStack gap={1}>
          <Box w="8px" h="8px" rounded="sm" bg="blue.400" />
          <Text fontSize="2xs" color="fg.muted">Input</Text>
        </HStack>
        <HStack gap={1}>
          <Box w="8px" h="8px" rounded="sm" bg="green.400" />
          <Text fontSize="2xs" color="fg.muted">Output</Text>
        </HStack>
        <HStack gap={1}>
          <Box w="8px" h="8px" rounded="sm" bg="yellow.400" />
          <Text fontSize="2xs" color="fg.muted">Cached</Text>
        </HStack>
      </HStack>
    </Flex>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <Box
      flex={1}
      bg="bg.subtle"
      border="1px solid"
      borderColor="border"
      rounded="md"
      px={2}
      py={1.5}
      textAlign="center"
    >
      <Text fontSize="md" fontWeight="bold" color={color}>
        {value}
      </Text>
      <Text fontSize="2xs" color="fg.muted">
        {label}
      </Text>
    </Box>
  );
}
