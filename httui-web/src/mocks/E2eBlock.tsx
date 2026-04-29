import { useState } from "react";
import {
  Box,
  Flex,
  Badge,
  Text,
  HStack,
  Input,
  IconButton,
} from "@chakra-ui/react";
import {
  LuCheck,
  LuCircleX,
  LuChevronDown,
  LuChevronRight,
  LuArrowUp,
  LuArrowDown,
  LuX,
  LuPlus,
} from "react-icons/lu";
import { ExecutableBlockShell } from "@/components/blocks/ExecutableBlockShell";
import type {
  DisplayMode,
  ExecutionState,
} from "@/components/blocks/ExecutableBlock";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: "green",
  POST: "blue",
  PUT: "orange",
  DELETE: "red",
};

interface E2eStep {
  name: string;
  method: HttpMethod;
  url: string;
}

interface E2eStepResult {
  name: string;
  method: HttpMethod;
  url: string;
  passed: boolean;
  elapsed_ms: number;
  status_code: number;
  response_body?: Record<string, unknown> | string;
  errors: string[];
  extractions: Record<string, string>;
}

interface MockE2eBlockProps {
  alias: string;
  baseUrl: string;
  steps: E2eStep[];
  results: E2eStepResult[];
  defaultMode?: DisplayMode;
}

/* ── Step Card (Input) ──────────────────────────────── */

function MockStepCard({
  step,
  index,
  totalSteps,
}: {
  step: E2eStep;
  index: number;
  totalSteps: number;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Box
      border="1px solid"
      borderColor="border"
      rounded="md"
      overflow="hidden"
      mb={2}
    >
      {/* Step header */}
      <Flex
        align="center"
        gap={1}
        px={2}
        py={1}
        bg="bg.subtle"
        cursor="pointer"
        onClick={() => setExpanded(!expanded)}
        minH="32px"
      >
        {expanded ? <LuChevronDown size={12} /> : <LuChevronRight size={12} />}
        <Input
          size="xs"
          variant="flushed"
          value={step.name}
          readOnly
          fontFamily="mono"
          fontSize="xs"
          flex={1}
          minW="0"
          color="fg.muted"
          onClick={(e) => e.stopPropagation()}
        />
        <HStack gap={0} flexShrink={0}>
          <IconButton
            aria-label="Move up"
            size="2xs"
            variant="ghost"
            disabled={index === 0}
          >
            <LuArrowUp />
          </IconButton>
          <IconButton
            aria-label="Move down"
            size="2xs"
            variant="ghost"
            disabled={index === totalSteps - 1}
          >
            <LuArrowDown />
          </IconButton>
          <IconButton
            aria-label="Remove"
            size="2xs"
            variant="ghost"
            colorPalette="red"
          >
            <LuX />
          </IconButton>
        </HStack>
      </Flex>

      {/* Step content */}
      {expanded && (
        <Box p={2} display="flex" flexDirection="column" gap={1.5}>
          {/* Method + URL */}
          <Flex gap={1} align="center">
            <Box
              px={2}
              h="32px"
              display="flex"
              alignItems="center"
              fontFamily="mono"
              fontSize="xs"
              fontWeight="bold"
              color={`${METHOD_COLORS[step.method]}.400`}
              border="1px solid"
              borderColor="border"
              rounded="sm"
              flexShrink={0}
            >
              {step.method}
            </Box>
            <Box
              flex={1}
              minW="0"
              h="32px"
              border="1px solid"
              borderColor="border"
              rounded="sm"
              display="flex"
              alignItems="center"
              px={2}
            >
              <Text fontFamily="mono" fontSize="xs" color="fg.muted">
                {step.url}
              </Text>
            </Box>
          </Flex>

          {/* Request tabs placeholder */}
          <Flex borderBottom="1px solid" borderColor="border">
            <Text
              px={2}
              py={1}
              fontSize="xs"
              color="brand.400"
              borderBottom="2px solid"
              borderColor="brand.400"
            >
              Params
            </Text>
            <Text px={2} py={1} fontSize="xs" color="fg.muted">
              Headers
            </Text>
            <Text px={2} py={1} fontSize="xs" color="fg.muted">
              Body
            </Text>
          </Flex>

          {/* Assertions tabs placeholder */}
          <Flex borderBottom="1px solid" borderColor="border">
            <Text
              px={2}
              py={1}
              fontSize="xs"
              color="brand.400"
              borderBottom="2px solid"
              borderColor="brand.400"
            >
              Expect
            </Text>
            <Text px={2} py={1} fontSize="xs" color="fg.muted">
              Extract
            </Text>
          </Flex>
        </Box>
      )}
    </Box>
  );
}

/* ── Step Result Card (Output) ──────────────────────── */

function MockStepResultCard({ result }: { result: E2eStepResult }) {
  const [expanded, setExpanded] = useState(!result.passed);

  return (
    <Box
      border="1px solid"
      borderColor={result.passed ? "green.muted" : "red.muted"}
      rounded="md"
      overflow="hidden"
      mb={2}
    >
      <Flex
        align="center"
        gap={2}
        px={2}
        py={1}
        bg="bg.subtle"
        cursor="pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {result.passed ? (
          <LuCheck color="var(--chakra-colors-green-fg)" size={14} />
        ) : (
          <LuCircleX color="var(--chakra-colors-red-fg)" size={14} />
        )}
        <Text fontSize="xs" fontWeight="medium" flex={1}>
          {result.name || "Unnamed step"}
        </Text>
        {result.status_code > 0 && (
          <Badge
            size="sm"
            colorPalette={result.status_code < 400 ? "green" : "red"}
            variant="subtle"
          >
            {result.status_code}
          </Badge>
        )}
        <Text fontSize="2xs" color="fg.muted">
          {result.elapsed_ms}ms
        </Text>
        {expanded ? <LuChevronDown size={12} /> : <LuChevronRight size={12} />}
      </Flex>

      {expanded && (
        <Box px={3} py={2} fontSize="xs">
          {/* Errors */}
          {result.errors.length > 0 && (
            <Box mb={2}>
              <Text fontWeight="medium" color="red.fg" mb={1}>
                Assertion Failures
              </Text>
              {result.errors.map((err, i) => (
                <Box
                  key={i}
                  bg="red.subtle"
                  px={2}
                  py={1}
                  rounded="sm"
                  mb={1}
                  fontFamily="mono"
                  fontSize="2xs"
                >
                  {err}
                </Box>
              ))}
            </Box>
          )}

          {/* Extractions */}
          {Object.keys(result.extractions).length > 0 && (
            <Box mb={2}>
              <Text fontWeight="medium" color="purple.fg" mb={1}>
                Extracted Variables
              </Text>
              {Object.entries(result.extractions).map(([key, value]) => (
                <Flex
                  key={key}
                  gap={2}
                  fontFamily="mono"
                  fontSize="2xs"
                  mb={0.5}
                >
                  <Text color="purple.fg">{key}</Text>
                  <Text color="fg.muted">=</Text>
                  <Text>
                    {typeof value === "string"
                      ? value
                      : String(JSON.stringify(value))}
                  </Text>
                </Flex>
              ))}
            </Box>
          )}

          {/* Response body */}
          {result.response_body && (
            <Box>
              <Text fontWeight="medium" color="fg.muted" mb={1}>
                Response Body
              </Text>
              <Box
                maxH="200px"
                overflow="auto"
                fontFamily="mono"
                fontSize="2xs"
                bg="bg.subtle"
                p={2}
                rounded="sm"
              >
                <pre>
                  {typeof result.response_body === "string"
                    ? result.response_body
                    : JSON.stringify(result.response_body, null, 2)}
                </pre>
              </Box>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

/* ── E2E Block ──────────────────────────────────────── */

export function MockE2eBlock({
  alias: initialAlias,
  baseUrl,
  steps,
  results,
  defaultMode = "split",
}: MockE2eBlockProps) {
  const [alias, setAlias] = useState(initialAlias);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(defaultMode);

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const executionState: ExecutionState = "success";

  const inputSlot = (
    <Box p={3}>
      {/* Base URL */}
      <Box mb={3}>
        <Text fontSize="xs" fontWeight="medium" color="fg.muted" mb={1}>
          Base URL
        </Text>
        <Box border="1px solid" borderColor="border" rounded="sm" px={2} py={1}>
          <Text fontFamily="mono" fontSize="xs" color="fg.muted">
            {baseUrl}
          </Text>
        </Box>
      </Box>

      {/* Steps */}
      <Box>
        <Text fontSize="xs" fontWeight="medium" color="fg.muted" mb={2}>
          Steps ({steps.length})
        </Text>
        {steps.map((step, idx) => (
          <MockStepCard
            key={idx}
            step={step}
            index={idx}
            totalSteps={steps.length}
          />
        ))}
        <IconButton
          aria-label="Add step"
          size="sm"
          variant="outline"
          colorPalette="gray"
          width="100%"
          cursor="default"
        >
          <LuPlus />
          <Text fontSize="xs" ml={1}>
            Add Step
          </Text>
        </IconButton>
      </Box>
    </Box>
  );

  const outputSlot = (
    <Box p={3}>
      {/* Summary */}
      <Flex align="center" gap={2} mb={3}>
        <Text fontSize="sm" fontWeight="bold">
          {passed}/{total} passed
        </Text>
        <Box
          flex={1}
          bg="bg.emphasized"
          rounded="full"
          h="6px"
          overflow="hidden"
        >
          <Box
            h="100%"
            bg={passed === total ? "green.solid" : "red.solid"}
            width={`${(passed / Math.max(total, 1)) * 100}%`}
            transition="width 0.3s"
            rounded="full"
          />
        </Box>
      </Flex>

      {/* Step results */}
      {results.map((result, idx) => (
        <MockStepResultCard key={idx} result={result} />
      ))}
    </Box>
  );

  return (
    <ExecutableBlockShell
      blockType="e2e"
      alias={alias}
      displayMode={displayMode}
      executionState={executionState}
      onAliasChange={setAlias}
      onDisplayModeChange={setDisplayMode}
      onRun={() => {}}
      onCancel={() => {}}
      splitDirection="column"
      inputSlot={inputSlot}
      outputSlot={outputSlot}
    />
  );
}
