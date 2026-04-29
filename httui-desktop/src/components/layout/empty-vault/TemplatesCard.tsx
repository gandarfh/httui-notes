// "Templates" card — Epic 41 Story 04 (canvas §3).
//
// White card with moss-green icon, serif title, body, and bullet
// list of built-in templates. Pure presentational; consumer wires
// `onSelect` for "+ N templates →" / picker.

import { Box, Stack, Text, chakra } from "@chakra-ui/react";

const CardBox = chakra("button");

export interface TemplatesCardProps {
  onSelect: () => void;
}

const STARTER_TEMPLATES: ReadonlyArray<string> = [
  "Health check de API",
  "OAuth 2.0 dance",
  "Migração + rollback",
];

const ALL_TEMPLATES_COUNT = 17;
const VISIBLE_COUNT = STARTER_TEMPLATES.length;

export function TemplatesCard({ onSelect }: TemplatesCardProps) {
  const remaining = Math.max(0, ALL_TEMPLATES_COUNT - VISIBLE_COUNT);
  return (
    <CardBox
      type="button"
      data-atom="templates-card"
      data-testid="templates-card"
      onClick={onSelect}
      aria-label="Templates"
      textAlign="left"
      bg="bg"
      borderWidth="1px"
      borderColor="line"
      borderRadius="12px"
      p="22px"
      minH="260px"
      cursor="pointer"
      _hover={{ borderColor: "fg.3" }}
    >
      <Stack gap={3} h="full">
        <Box
          aria-hidden
          w="32px"
          h="32px"
          borderRadius="6px"
          bg="color-mix(in oklab, oklch(0.62 0.10 145) 14%, transparent)"
          display="inline-flex"
          alignItems="center"
          justifyContent="center"
          color="oklch(0.62 0.10 145)"
          fontSize="16px"
          data-testid="templates-icon"
        >
          ▦
        </Box>
        <Text
          fontFamily="var(--chakra-fonts-serif)"
          fontSize="18px"
          fontWeight={600}
          color="fg"
          data-testid="templates-title"
        >
          Templates
        </Text>
        <Text fontSize="12px" color="fg.2" lineHeight={1.4}>
          Health check, OAuth flow, smoke tests, rollout SQL.
        </Text>
        <Stack gap={1} mt={1}>
          {STARTER_TEMPLATES.map((label) => (
            <Text
              key={label}
              fontSize="11px"
              color="fg.3"
              data-testid={`template-${label.replace(/\s+/g, "-").toLowerCase()}`}
            >
              · {label}
            </Text>
          ))}
          <Text
            fontSize="11px"
            color="accent"
            mt={1.5}
            fontWeight={600}
            data-testid="templates-more"
          >
            + {remaining} templates →
          </Text>
        </Stack>
      </Stack>
    </CardBox>
  );
}
