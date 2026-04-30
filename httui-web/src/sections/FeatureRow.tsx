import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import { Eyebrow } from "../components/atoms";

// FeatureRow — alternating two-column section. Reverses
// direction on every other call for a zigzag rhythm.
type FeatureRowProps = {
  kicker: string;
  title: React.ReactNode;
  body: React.ReactNode;
  points: React.ReactNode[];
  preview: React.ReactNode;
  reverse?: boolean;
};
export function FeatureRow({
  kicker,
  title,
  body,
  points,
  preview,
  reverse,
}: FeatureRowProps) {
  return (
    <Box
      as="section"
      maxW="1640px"
      mx="auto"
      px={{ base: 6, md: 16 }}
      py={{ base: 14, md: 20 }}
      display="grid"
      gridTemplateColumns={{ base: "1fr", lg: "1fr 1.15fr" }}
      gap={{ base: 10, lg: 16 }}
      alignItems="center"
      direction={{ base: "ltr", lg: reverse ? "rtl" : "ltr" }}
      overflowX="hidden"
    >
      <Box style={{ direction: "ltr" }}>
        <Eyebrow>{kicker}</Eyebrow>
        <Text
          mt={3}
          as="h2"
          fontFamily="heading"
          fontWeight="600"
          fontSize={{ base: "32px", md: "44px" }}
          lineHeight="1.1"
          letterSpacing="tight"
          color="fg"
        >
          {title}
        </Text>
        <Text
          mt={4}
          fontSize="md"
          lineHeight="1.6"
          color="fg.muted"
          maxW="460px"
        >
          {body}
        </Text>
        <VStack as="ul" align="stretch" mt={5} gap={2.5} listStyleType="none">
          {points.map((p, i) => (
            <HStack
              as="li"
              key={i}
              gap={2.5}
              fontSize="sm"
              color="fg.muted"
              lineHeight="1.5"
              align="flex-start"
            >
              <Text color="accent" fontWeight="700" flexShrink={0}>
                —
              </Text>
              <Text as="span">{p}</Text>
            </HStack>
          ))}
        </VStack>
      </Box>
      <Box
        style={{ direction: "ltr" }}
        minW="0"
        overflowX="auto"
        css={{
          // Hide scrollbar visually on mobile but keep horizontal panning
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        {preview}
      </Box>
    </Box>
  );
}
