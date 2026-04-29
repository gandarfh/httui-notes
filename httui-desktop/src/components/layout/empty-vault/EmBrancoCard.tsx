// "Em branco" PROTAGONIST card — Epic 41 Story 03 (canvas §3).
//
// Deep-ink-blue card with a giant decorative `✎` quill behind the
// content, serif title, accent eyebrow, and an inline pill CTA.
// Pure presentational; takes an `onCreateClick` callback.

import { Box, Stack, Text, chakra } from "@chakra-ui/react";

import { THEME_DARK } from "@/theme/tokens";

const CtaPill = chakra("button");

export interface EmBrancoCardProps {
  /** Click → opens scaffold flow. */
  onCreateClick: () => void;
}

export function EmBrancoCard({ onCreateClick }: EmBrancoCardProps) {
  return (
    <Box
      data-atom="em-branco-card"
      data-testid="em-branco-card"
      position="relative"
      bg={THEME_DARK.bg}
      color="white"
      p="22px"
      borderRadius="12px"
      overflow="hidden"
      boxShadow="0 16px 36px -12px oklch(0.20 0.04 230 / 0.35), 0 2px 6px -2px oklch(0.20 0.04 230 / 0.20)"
      minH="260px"
    >
      {/* Giant decorative quill in the top-right (no pointer events). */}
      <Box
        aria-hidden
        position="absolute"
        top="-20px"
        right="-10px"
        fontSize="140px"
        lineHeight={1}
        opacity={0.06}
        fontFamily="var(--chakra-fonts-serif)"
        userSelect="none"
        pointerEvents="none"
        data-testid="em-branco-decoration"
      >
        ✎
      </Box>

      <Stack
        gap={4}
        position="relative"
        zIndex={1}
        h="full"
        justify="space-between"
      >
        <Stack gap={2}>
          <Text
            data-testid="em-branco-eyebrow"
            fontSize="13px"
            fontWeight={600}
            textTransform="uppercase"
            letterSpacing="0.08em"
            color={THEME_DARK.accent}
          >
            RECOMENDADO
          </Text>
          <Text
            data-testid="em-branco-title"
            fontFamily="var(--chakra-fonts-serif)"
            fontSize="26px"
            fontWeight={500}
            lineHeight={1.1}
          >
            Em branco
          </Text>
          <Text
            fontSize="13px"
            opacity={0.75}
            lineHeight={1.5}
            data-testid="em-branco-body"
          >
            Markdown vazio com um bloco HTTP pronto para você colar uma
            URL.
          </Text>
        </Stack>

        <CtaPill
          type="button"
          data-testid="em-branco-cta"
          aria-label="Criar primeiro runbook"
          onClick={onCreateClick}
          alignSelf="flex-start"
          h="32px"
          px="14px"
          gap={2}
          display="inline-flex"
          alignItems="center"
          bg="white"
          color={THEME_DARK.bg}
          borderRadius="999px"
          fontSize="13px"
          fontWeight={600}
          cursor="pointer"
          _hover={{ bg: "oklch(0.92 0.006 90)" }}
        >
          Criar primeiro runbook
          <Box as="span" aria-hidden>
            →
          </Box>
        </CtaPill>
      </Stack>
    </Box>
  );
}
