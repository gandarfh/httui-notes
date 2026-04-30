import { Box, Flex } from "@chakra-ui/react";
import { useColorMode } from "@/components/ui/color-mode";
import { WindowChrome, WorkbenchPreview } from "../marketing/previews";

// HeroPreview — full-fidelity Workbench shown immediately
// after the hero. Negative margin-top makes it "emerge"
// from the photo above (the bottom blur of the Hero softens
// the seam). Scaled at 0.811 so the full 1480×940 workbench
// fits inside a 1200×762 frame.
export function HeroPreview() {
  // Workbench is built at 1480×940 (designed for desktop). Even at scale 0.5
  // it overflows mobile/tablet viewports and looks cramped. We only render it
  // at lg+; mobile users see the per-feature previews below the hero instead.
  const { colorMode } = useColorMode();
  const isDark = colorMode === "dark";
  return (
    <Box
      display={{ base: "none", lg: "block" }}
      position="relative"
      pt="30px"
      pb="100px"
      overflow="hidden"
    >
      {/* Painting bg — Fuji watercolor as scenic stage around the dashboard.
          Edges fade to page bg so the painting feels like a vignette.
          Dark mode swaps to a dedicated dark variant; light keeps the
          responsive jpg pair. */}
      <Box position="absolute" inset={0} zIndex={0} overflow="hidden">
        <img
          src={isDark ? "/hero-dark.png" : "/hero-1920.jpg"}
          srcSet={
            isDark ? undefined : "/hero-768.jpg 768w, /hero-1920.jpg 1920w"
          }
          sizes="100vw"
          alt=""
          loading="eager"
          decoding="async"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center 60%",
            display: "block",
            filter: isDark ? "none" : "saturate(0.7) brightness(1.02)",
          }}
        />
      </Box>
      {/* Vignette: fade top/bottom to page bg so the painting is just
          ambient scenery, never a hard band. */}
      <Box
        position="absolute"
        inset={0}
        zIndex={1}
        pointerEvents="none"
        style={{
          background: `linear-gradient(
            180deg,
            var(--chakra-colors-bg) 0%,
            color-mix(in oklch, var(--chakra-colors-bg) 60%, transparent) 6%,
            transparent 18%,
            transparent 75%,
            color-mix(in oklch, var(--chakra-colors-bg) 70%, transparent) 90%,
            var(--chakra-colors-bg) 100%
          )`,
        }}
      />
      {/* Dashboard preview centered, sitting in the painting */}
      <Flex justify="center" position="relative" zIndex={2}>
        <Box
          w="1200px"
          maxW="1200px"
          rounded="xl"
          overflow="hidden"
          bg="bg.surface"
          border="1px solid"
          borderColor="border"
          shadow="photo"
        >
          <WindowChrome title="rollout-v2.3.md — httui" />
          <Box position="relative" h="762px" overflow="hidden">
            <Box
              position="absolute"
              top={0}
              left={0}
              w="1480px"
              h="940px"
              transformOrigin="top left"
              transform="scale(0.811)"
            >
              <WorkbenchPreview />
            </Box>
          </Box>
        </Box>
      </Flex>
    </Box>
  );
}
