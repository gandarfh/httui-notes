// Epic 50 Story 01 + 02 — DocHeader card scaffold.
//
// Pure presentational. Renders above the CM6 editor for `.md` tabs.
// Story 03 (meta strip) + Story 04 (abstract paragraph) + Story 05
// (action row) extend the card; Story 06 (compact mode) flips a
// data attribute. The frontmatter parser is Epic 52 — this card
// accepts already-parsed `frontmatter` and `firstHeading` props.

import { Box, Flex, Heading, Text } from "@chakra-ui/react";

import {
  deriveBreadcrumb,
  pickH1Title,
  type DocHeaderFrontmatter,
} from "./docheader-derive";

export interface DocHeaderCardProps {
  filePath: string;
  /** Vault-relative path; the breadcrumb is derived from it. When
   *  unset, the breadcrumb is hidden. */
  relativeFilePath?: string | null;
  frontmatter?: DocHeaderFrontmatter | null;
  firstHeading?: string | null;
  /** Story 06 — compact mode hides everything below the meta strip.
   *  Story 03 ships the meta strip; until then `compact === true`
   *  hides nothing visible. */
  compact?: boolean;
  /** Click handler for breadcrumb segments. The leaf is rendered as
   *  inactive even when `onBreadcrumbSelect` is provided. */
  onBreadcrumbSelect?: (path: string) => void;
  /** Click handler for the H1 — Story 06 uses it to toggle compact
   *  mode. */
  onTitleClick?: () => void;
}

export function DocHeaderCard({
  filePath,
  relativeFilePath,
  frontmatter,
  firstHeading,
  compact,
  onBreadcrumbSelect,
  onTitleClick,
}: DocHeaderCardProps) {
  const title = pickH1Title(
    frontmatter ?? null,
    firstHeading ?? null,
    filePath,
  );
  const breadcrumb = relativeFilePath
    ? deriveBreadcrumb(relativeFilePath)
    : [];

  return (
    <Box
      data-testid="docheader-card"
      data-compact={compact || undefined}
      px={6}
      py={5}
      borderBottomWidth="1px"
      borderBottomColor="line"
      bg="bg.1"
    >
      {breadcrumb.length > 1 && (
        <Flex
          data-testid="docheader-breadcrumb"
          gap={1}
          align="center"
          mb={2}
          flexWrap="wrap"
        >
          {breadcrumb.map((seg, i) => {
            const isLeaf = i === breadcrumb.length - 1;
            return (
              <Flex
                key={seg.path}
                align="center"
                gap={1}
                data-testid={`docheader-breadcrumb-segment-${i}`}
              >
                {i > 0 && <BreadcrumbSeparator />}
                <Text
                  as={onBreadcrumbSelect && !isLeaf ? "button" : "span"}
                  data-leaf={isLeaf || undefined}
                  fontFamily="mono"
                  fontSize="11px"
                  color={isLeaf ? "fg.2" : "fg.3"}
                  cursor={
                    onBreadcrumbSelect && !isLeaf ? "pointer" : undefined
                  }
                  onClick={
                    onBreadcrumbSelect && !isLeaf
                      ? () => onBreadcrumbSelect(seg.path)
                      : undefined
                  }
                  _hover={
                    onBreadcrumbSelect && !isLeaf
                      ? { color: "fg" }
                      : undefined
                  }
                >
                  {seg.label}
                </Text>
              </Flex>
            );
          })}
        </Flex>
      )}

      <Heading
        as={onTitleClick ? "button" : "h1"}
        data-testid="docheader-title"
        fontFamily="serif"
        fontSize="2.25rem"
        fontWeight={600}
        color="fg"
        textAlign="left"
        cursor={onTitleClick ? "pointer" : undefined}
        onClick={onTitleClick}
        m={0}
      >
        {title}
      </Heading>
    </Box>
  );
}

function BreadcrumbSeparator() {
  return (
    <Text as="span" fontFamily="mono" fontSize="11px" color="fg.3">
      /
    </Text>
  );
}
