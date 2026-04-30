import { Box, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import { useGithubStats } from "../hooks/useGithubStats";
import { Eyebrow } from "../components/atoms";

// OssStrip — 4-up grid of live OSS stats from GitHub
// (stars, contributors, license, latest release)
export function OssStrip() {
  const stats = useGithubStats();
  const cells = [
    {
      v: stats.stars,
      k: "GitHub stars",
      sub: stats.repoUrl.replace(/^https?:\/\//, ""),
    },
    { v: stats.contributors, k: "contributors", sub: "growing in the open" },
    { v: stats.license, k: "license", sub: "no strings attached" },
    {
      v: stats.version,
      k: "latest release",
      sub: stats.versionDate || "release pending",
    },
  ];
  return (
    <Box as="section" px={{ base: 6, md: 14 }} pt={24} pb={16} bg="bg">
      <VStack gap={2.5} mb={9}>
        <Eyebrow color="fg.subtle">Open source · MIT license</Eyebrow>
        <Text
          fontFamily="heading"
          fontSize={{ base: "lg", md: "xl" }}
          fontStyle="italic"
          color="fg.muted"
          maxW="620px"
          textAlign="center"
        >
          Built in the open. Hack on it, fork it, send a PR.
        </Text>
      </VStack>
      <Box
        maxW="980px"
        mx="auto"
        border="1px solid"
        borderColor="border"
        rounded="lg"
        bg="bg.surface"
        overflow="hidden"
      >
        <SimpleGrid columns={{ base: 2, md: 4 }} gap={0}>
          {cells.map((s, i) => (
            <Box
              key={i}
              px={5}
              py={6}
              textAlign="center"
              borderRight={{
                base: i % 2 === 0 ? "1px solid" : "none",
                md: i < 3 ? "1px solid" : "none",
              }}
              borderBottom={{ base: i < 2 ? "1px solid" : "none", md: "none" }}
              borderColor="border"
            >
              <Text
                fontFamily="heading"
                fontSize="48px"
                fontWeight="600"
                letterSpacing="tight"
                color="fg"
                lineHeight="1"
              >
                {s.v}
              </Text>
              <Text mt={2} fontSize="xs" color="fg.muted" fontWeight="500">
                {s.k}
              </Text>
              <Text
                mt={0.5}
                fontSize="11px"
                color="fg.subtle"
                fontFamily="mono"
                truncate
              >
                {s.sub}
              </Text>
            </Box>
          ))}
        </SimpleGrid>
      </Box>
    </Box>
  );
}
