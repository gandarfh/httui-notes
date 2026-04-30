// Epic 50 Story 04 — abstract paragraph for the DocHeader card.
//
// Pure presentational. Consumes `deriveAbstractDisplay` (shipped in
// 0efa952 as part of `docheader-derive.ts`) and the `frontmatter`
// prop the consumer passes in. Renders nothing when the abstract
// is empty/missing — the card hides the slot in that case.
//
// Long abstracts (> ABSTRACT_FADE_THRESHOLD = 250 chars) collapse
// to ~3 lines via CSS line-clamp with a soft fade-out gradient at
// the bottom; a "more" / "less" button toggles the clamp.

import { useState } from "react";
import { Box, Text } from "@chakra-ui/react";

import {
  deriveAbstractDisplay,
  type DocHeaderFrontmatter,
} from "./docheader-derive";

export interface DocHeaderAbstractProps {
  frontmatter: DocHeaderFrontmatter | null;
  /** Number of lines to show in the collapsed state. Default 3
   *  matches the canvas spec. */
  collapsedLines?: number;
}

export function DocHeaderAbstract({
  frontmatter,
  collapsedLines = 3,
}: DocHeaderAbstractProps) {
  const [expanded, setExpanded] = useState(false);
  const display = deriveAbstractDisplay(frontmatter);
  if (!display) return null;

  const showToggle = display.needsTruncation;
  const clamped = showToggle && !expanded;

  return (
    <Box
      data-testid="docheader-abstract"
      data-clamped={clamped || undefined}
      data-needs-truncation={display.needsTruncation || undefined}
      mt={3}
      position="relative"
    >
      <Text
        data-testid="docheader-abstract-text"
        as="p"
        fontFamily="serif"
        fontStyle="italic"
        fontSize="14px"
        lineHeight="1.5"
        color="fg.2"
        m={0}
        css={
          clamped
            ? {
                display: "-webkit-box",
                WebkitLineClamp: collapsedLines,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }
            : undefined
        }
      >
        {display.text}
      </Text>
      {clamped && <FadeMask />}
      {showToggle && (
        <Text
          as="button"
          data-testid="docheader-abstract-toggle"
          fontFamily="mono"
          fontSize="11px"
          color="accent"
          mt={1}
          onClick={() => setExpanded((v) => !v)}
          cursor="pointer"
          textAlign="left"
        >
          {expanded ? "less" : "more"}
        </Text>
      )}
    </Box>
  );
}

function FadeMask() {
  // Soft gradient overlay at the bottom of the clamped text. The
  // bg matches the card's bg.1 token so the mask blends with the
  // surrounding surface.
  return (
    <Box
      data-testid="docheader-abstract-fade"
      position="absolute"
      pointerEvents="none"
      bottom={0}
      left={0}
      right={0}
      h="2em"
      bgGradient="linear(to-b, transparent, var(--chakra-colors-bg-1))"
    />
  );
}
