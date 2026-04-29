import { Box, Flex, HStack, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import { LuArrowRight, LuPlay } from "react-icons/lu";
import { useColorMode } from "@/components/ui/color-mode";
import { useGithubStats } from "./hooks/useGithubStats";
import {
  BlocksPreview,
  GitDiffPreview,
  SchemaPreview,
  WindowChrome,
  WorkbenchPreview,
} from "./marketing/previews";

// ─────────────────────────────────────────────────────────
// Logo — the httui "h." mark. Theme-aware (light/dark) and
// supports two variants:
//   - full: wordmark + glyph (used in the navbar)
//   - logo: glyph only (used in the footer)
// ─────────────────────────────────────────────────────────
function Logo({
  variant = "logo",
  size = 22,
}: {
  variant?: "logo" | "full";
  size?: number;
}) {
  const { colorMode } = useColorMode();
  const theme = colorMode === "dark" ? "dark" : "light";

  if (variant === "full") {
    // Full asset is 66×19 — keep aspect by setting only height.
    return (
      <img
        src={`/httui-${theme}-full.png`}
        height={size}
        alt="httui"
        style={{ display: "block", height: `${size}px`, width: "auto" }}
      />
    );
  }

  // Glyph only — light variant ships as SVG, dark as PNG
  const src =
    theme === "light" ? "/httui-light-logo.svg" : "/httui-dark-logo.png";
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt="httui"
      style={{ display: "block" }}
    />
  );
}

// ─────────────────────────────────────────────────────────
// Pill — small reusable pill button (cosmetic, not a link).
// Variants:
//   solid   — accent-filled CTA
//   ink     — high-contrast dark-on-light / light-on-dark
//   ghost   — bordered transparent
// ─────────────────────────────────────────────────────────
type PillProps = {
  children: React.ReactNode;
  variant?: "solid" | "ghost" | "ink";
  size?: "sm" | "md";
  href?: string;
};
function Pill({ children, variant = "solid", size = "md", href }: PillProps) {
  const padX = size === "sm" ? 3.5 : 4.5;
  const padY = size === "sm" ? 1.5 : 2.5;
  const fontSize = size === "sm" ? "xs" : "sm";

  const styleMap = {
    solid: { bg: "accent", color: "accent.fg", borderColor: "transparent" },
    ink: { bg: "fg", color: "bg", borderColor: "transparent" },
    ghost: {
      bg: "color-mix(in oklch, var(--chakra-colors-bg) 60%, transparent)",
      color: "fg",
      borderColor:
        "color-mix(in oklch, var(--chakra-colors-border) 60%, transparent)",
    },
  } as const;
  const style = styleMap[variant];

  return (
    <HStack
      as={href ? "a" : "span"}
      {...(href ? { href, target: "_blank", rel: "noreferrer" } : {})}
      display="inline-flex"
      gap={1.5}
      px={padX}
      py={padY}
      rounded="full"
      fontSize={fontSize}
      fontWeight="600"
      whiteSpace="nowrap"
      border="1px solid"
      cursor="pointer"
      backdropFilter={variant === "ghost" ? "blur(10px)" : undefined}
      bg={style.bg}
      color={style.color}
      borderColor={style.borderColor}
      transition="filter .12s ease, transform .12s ease"
      _hover={{ filter: "brightness(1.05)" }}
    >
      {children}
    </HStack>
  );
}

// ─────────────────────────────────────────────────────────
// Eyebrow — uppercase mono kicker above section titles
// ─────────────────────────────────────────────────────────
function Eyebrow({
  children,
  color = "accent",
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <Text
      as="span"
      fontFamily="mono"
      fontSize="11px"
      fontWeight="700"
      color={color}
      letterSpacing="wider"
      textTransform="uppercase"
    >
      {children}
    </Text>
  );
}

// ─────────────────────────────────────────────────────────
// Nav — sticky top bar with backdrop blur + repo star count.
// Lives inside the Hero so the photo bleeds behind it.
// ─────────────────────────────────────────────────────────
function Nav() {
  const stats = useGithubStats();
  return (
    <Box
      position="sticky"
      top={0}
      zIndex={50}
      bg="bg"
      borderBottom="1px solid"
      borderColor="border.subtle"
    >
      <Flex
        align="center"
        maxW="1280px"
        mx="auto"
        width="100%"
        px={{ base: 5, md: 8 }}
        py={3}
        fontSize="sm"
      >
        <Logo variant="full" size={22} />
        <HStack
          flex="1"
          justify="center"
          gap={1}
          display={{ base: "none", md: "flex" }}
        >
          {["Product", "Docs", "GitHub", "Changelog"].map((l) => (
            <Text
              key={l}
              px={3}
              py={1.5}
              fontSize="13px"
              fontWeight="500"
              color="fg.muted"
              rounded="md"
              cursor="pointer"
              _hover={{ color: "fg" }}
            >
              {l}
            </Text>
          ))}
        </HStack>
        <HStack gap={3}>
          <HStack
            gap={1}
            fontSize="12px"
            fontWeight="500"
            color="fg.muted"
            display={{ base: "none", md: "flex" }}
          >
            <Text as="span">★</Text>
            <Text>{stats.stars}</Text>
          </HStack>
          <Pill variant="ink" size="sm" href={stats.repoUrl}>
            View on GitHub <LuArrowRight size={11} />
          </Pill>
        </HStack>
      </Flex>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────
// Hero — Fuji photograph background + serif headline +
// scaled product preview window. The wash is a vertical
// gradient using the page bg token, so it works in both
// themes without separate art.
// ─────────────────────────────────────────────────────────
function Hero() {
  const stats = useGithubStats();
  return (
    <Box as="section" position="relative" bg="bg">
      <Nav />
      {/* Hero content — clean paper bg, no photo. The Fuji painting only
          appears as scenery around the workbench preview below. */}
      <Flex
        direction="column"
        align="center"
        textAlign="center"
        maxW="1080px"
        mx="auto"
        px={{ base: 5, md: 14 }}
        pt={{ base: 8, md: 16 }}
        pb={{ base: 8, md: 12 }}
      >
        <HStack
          gap={1.5}
          px={3}
          py={1}
          rounded="full"
          fontSize="11px"
          bg="color-mix(in oklch, var(--chakra-colors-bg) 80%, transparent)"
          border="1px solid"
          borderColor="border.subtle"
          color="fg.muted"
          mb={{ base: 5, md: 7 }}
          backdropFilter="blur(8px)"
          whiteSpace="nowrap"
          maxW="100%"
          overflow="hidden"
        >
          <Box w="6px" h="6px" rounded="full" bg="ok" flexShrink={0} />
          <Text display={{ base: "none", sm: "inline" }}>
            v0.8 · open beta —
          </Text>
          <Text display={{ base: "inline", sm: "none" }}>v0.8 —</Text>
          <Text fontFamily="mono" color="fg.muted">
            20k blocks last week
          </Text>
        </HStack>

        <Text
          as="h1"
          fontFamily="heading"
          fontWeight="600"
          fontSize={{
            base: "34px",
            sm: "40px",
            md: "64px",
            lg: "88px",
            xl: "96px",
          }}
          lineHeight={{ base: "1.06", lg: "1.02" }}
          letterSpacing="tighter"
          color="fg"
          textWrap="balance"
          textShadow="0 1px 2px color-mix(in oklch, var(--chakra-colors-bg) 50%, transparent)"
        >
          Debug your APIs and databases in a{" "}
          <Text as="em" fontStyle="italic">
            single markdown file.
          </Text>
        </Text>

        <Text
          mt={{ base: 5, md: 7 }}
          maxW="620px"
          fontFamily="heading"
          fontSize={{ base: "15px", md: "18px" }}
          lineHeight="1.55"
          color="fg"
        >
          httui is a markdown editor with executable blocks — HTTP, SQL, Mongo,
          WebSocket, gRPC. Each runbook is documentation and a troubleshooting
          tool, versioned in git, shareable with your team.
        </Text>

        <HStack
          gap={3}
          mt={{ base: 7, md: 9 }}
          mb={{ base: 10, md: 14 }}
          flexWrap="wrap"
          justify="center"
        >
          <Pill variant="solid" href={stats.repoUrl}>
            Get started <LuArrowRight size={11} />
          </Pill>
          <Pill variant="ghost">
            <LuPlay size={10} /> Watch 90s demo
          </Pill>
        </HStack>
      </Flex>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────
// HeroPreview — full-fidelity Workbench shown immediately
// after the hero. Negative margin-top makes it "emerge"
// from the photo above (the bottom blur of the Hero softens
// the seam). Scaled at 0.811 so the full 1480×940 workbench
// fits inside a 1200×762 frame.
// ─────────────────────────────────────────────────────────
function HeroPreview() {
  // Workbench is built at 1480×940 (designed for desktop). Even at scale 0.5
  // it overflows mobile/tablet viewports and looks cramped. We only render it
  // at lg+; mobile users see the per-feature previews below the hero instead.
  return (
    <Box
      display={{ base: "none", lg: "block" }}
      position="relative"
      pt="30px"
      pb="100px"
      overflow="hidden"
    >
      {/* Painting bg — Fuji watercolor as scenic stage around the dashboard.
          Edges fade to page bg so the painting feels like a vignette. */}
      <Box position="absolute" inset={0} zIndex={0} overflow="hidden">
        <img
          src="/hero-1920.jpg"
          srcSet="/hero-768.jpg 768w, /hero-1920.jpg 1920w"
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
            filter: "saturate(0.7) brightness(1.02)",
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

// ─────────────────────────────────────────────────────────
// OssStrip — 4-up grid of live OSS stats from GitHub
// (stars, contributors, license, latest release)
// ─────────────────────────────────────────────────────────
function OssStrip() {
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

// ─────────────────────────────────────────────────────────
// FeatureRow — alternating two-column section. Reverses
// direction on every other call for a zigzag rhythm.
// ─────────────────────────────────────────────────────────
type FeatureRowProps = {
  kicker: string;
  title: React.ReactNode;
  body: React.ReactNode;
  points: React.ReactNode[];
  preview: React.ReactNode;
  reverse?: boolean;
};
function FeatureRow({
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

// ─────────────────────────────────────────────────────────
// InstallSection — single primary terminal block + 4
// alt-installs. OSS-style minimal.
// ─────────────────────────────────────────────────────────
function InstallSection() {
  const distros = [
    { label: "Homebrew", code: "brew install httui", icon: "" },
    { label: "apt / dnf", code: "apt install httui", icon: "" },
    { label: "winget", code: "winget install httui", icon: "▣" },
    { label: "From source", code: "go install httui/cmd/httui", icon: "{ }" },
  ];
  return (
    <Box
      as="section"
      id="install"
      px={{ base: 6, md: 20 }}
      py={{ base: 16, md: 24 }}
      bg="bg.surface"
      borderTop="1px solid"
      borderBottom="1px solid"
      borderColor="border"
    >
      <VStack gap={3.5} mb={10} textAlign="center">
        <Eyebrow>Install</Eyebrow>
        <Text
          as="h2"
          fontFamily="heading"
          fontWeight="600"
          fontSize={{ base: "36px", md: "52px" }}
          lineHeight="1.1"
          letterSpacing="tight"
          color="fg"
        >
          Free forever.{" "}
          <Text as="em" color="accent" fontStyle="italic">
            Yours
          </Text>{" "}
          to fork.
        </Text>
        <Text
          fontFamily="heading"
          fontSize="17px"
          color="fg.muted"
          maxW="580px"
        >
          One terminal command. No signup, no card, no telemetry.
        </Text>
      </VStack>

      {/* Primary install — single dark terminal block */}
      <Box
        maxW="760px"
        mx="auto"
        mb={7}
        rounded="xl"
        overflow="hidden"
        border="1px solid"
        borderColor="stone.500"
        bg="stone.900"
        color="paper.100"
        fontFamily="mono"
        shadow="photo"
      >
        <HStack
          px={3.5}
          py={2.5}
          gap={2}
          borderBottom="1px solid"
          borderColor="stone.500"
        >
          <Box w="10px" h="10px" rounded="full" bg="#ed6a5e" />
          <Box w="10px" h="10px" rounded="full" bg="#f4be4f" />
          <Box w="10px" h="10px" rounded="full" bg="#62c554" />
          <Text flex="1" textAlign="center" fontSize="11px" color="stone.200">
            ~/projects · zsh
          </Text>
          <Text
            fontSize="10px"
            color="moss.300"
            px={2}
            py={0.5}
            border="1px solid"
            borderColor="moss.700"
            rounded="sm"
            fontWeight="600"
          >
            COPY
          </Text>
        </HStack>
        <Box px={5} py={5} fontSize="14px" lineHeight="1.8">
          <Text>
            <Text as="span" color="moss.300">
              $
            </Text>{" "}
            curl -fsSL httui.sh/install | sh
          </Text>
          <Text color="stone.200" fontSize="13px">
            ✓ httui 0.8.2 installed in ~/.httui/bin
          </Text>
          <Text color="stone.200" fontSize="13px">
            ✓ shell: zsh detected, alias 'httui' added
          </Text>
          <Text>
            <Text as="span" color="moss.300">
              $
            </Text>{" "}
            httui new my-runbook.md
          </Text>
        </Box>
      </Box>

      {/* Alt installs */}
      <SimpleGrid maxW="920px" mx="auto" columns={{ base: 2, md: 4 }} gap={2.5}>
        {distros.map((p) => (
          <Box
            key={p.label}
            p={3.5}
            bg="bg"
            border="1px solid"
            borderColor="border"
            rounded="md"
          >
            <HStack gap={2} mb={1.5} fontSize="11px" color="fg.subtle">
              <Text fontFamily="mono">{p.icon}</Text>
              <Text fontWeight="600" color="fg.muted">
                {p.label}
              </Text>
            </HStack>
            <Text fontFamily="mono" fontSize="11.5px" color="fg" truncate>
              {p.code}
            </Text>
          </Box>
        ))}
      </SimpleGrid>

      <Text
        textAlign="center"
        mt={7}
        fontSize="xs"
        color="fg.muted"
        maxW="700px"
        mx="auto"
        lineHeight="1.7"
      >
        Prefer a GUI? Builds for{" "}
        <Text as="span" fontFamily="mono" color="fg.muted">
          macOS
        </Text>{" "}
        ·{" "}
        <Text as="span" fontFamily="mono" color="fg.muted">
          Linux
        </Text>{" "}
        ·{" "}
        <Text as="span" fontFamily="mono" color="fg.muted">
          Windows
        </Text>{" "}
        on the{" "}
        <Text as="span" color="accent.emphasized" fontWeight="600">
          GitHub releases
        </Text>
        . A VS Code extension is also available.
      </Text>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────
// CtaSection
// ─────────────────────────────────────────────────────────
function CtaSection() {
  const stats = useGithubStats();
  return (
    <Box
      as="section"
      px={{ base: 6, md: 20 }}
      py={{ base: 20, md: 28 }}
      textAlign="center"
      bgGradient="linear(to-b, var(--chakra-colors-bg) 0%, var(--chakra-colors-bg-surface) 100%)"
      borderTop="1px solid"
      borderColor="border"
    >
      <Text
        as="h2"
        fontFamily="heading"
        fontWeight="600"
        fontSize={{ base: "40px", md: "64px" }}
        lineHeight="1.05"
        letterSpacing="tight"
        color="fg"
        maxW="920px"
        mx="auto"
        textWrap="balance"
      >
        Stop debugging in{" "}
        <Text as="em" fontStyle="italic" color="fg.muted">
          five tabs.
        </Text>
        <br />
        Start writing{" "}
        <Text as="em" color="accent" fontStyle="italic">
          runbooks
        </Text>{" "}
        instead.
      </Text>
      <Text
        mt={5}
        fontFamily="heading"
        fontSize="17px"
        color="fg.muted"
        maxW="540px"
        mx="auto"
      >
        Open source, MIT licensed.{" "}
        <Text
          as="span"
          fontFamily="mono"
          bg="bg.elevated"
          px={1.5}
          py={0.5}
          rounded="sm"
          fontSize="13px"
        >
          brew install httui
        </Text>{" "}
        and it's yours.
      </Text>
      <HStack gap={3} justify="center" mt={9}>
        <Pill variant="solid" href={stats.repoUrl}>
          Get started
        </Pill>
        <Pill variant="ghost">Read the docs</Pill>
      </HStack>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────
// Footer
// ─────────────────────────────────────────────────────────
function Footer() {
  const cols: { h: string; l: string[] }[] = [
    { h: "Product", l: ["Workbench", "TUI", "VS Code"] },
    { h: "Resources", l: ["Docs", "Examples", "Changelog", "Status"] },
    {
      h: "Community",
      l: ["GitHub", "Discord", "Contributing", "Code of Conduct"],
    },
    { h: "Legal", l: ["MIT License", "Privacy", "Security"] },
  ];
  return (
    <Box
      as="footer"
      px={{ base: 6, md: 20 }}
      pt={14}
      pb={9}
      bg="bg.surface"
      borderTop="1px solid"
      borderColor="border"
      fontSize="xs"
      color="fg.muted"
    >
      <SimpleGrid columns={{ base: 2, md: 5 }} gap={10} maxW="1280px" mx="auto">
        <Box gridColumn={{ base: "span 2", md: "span 1" }}>
          <Logo variant="logo" size={28} />
          <Text mt={3} fontSize="13px" lineHeight="1.55" maxW="280px">
            The markdown editor for debugging APIs and databases. Open source ·
            MIT · v0.8.2.
          </Text>
          <Text mt={4} fontSize="11px" fontFamily="mono" color="fg.subtle">
            SHA-256 · a3f2…7c81
          </Text>
        </Box>
        {cols.map((col) => (
          <Box key={col.h}>
            <Text
              fontSize="11px"
              fontWeight="700"
              letterSpacing="wide"
              color="fg"
              mb={3}
            >
              {col.h}
            </Text>
            <VStack align="stretch" gap={1.5} fontSize="13px" color="fg.muted">
              {col.l.map((x) => (
                <Text key={x} cursor="pointer" _hover={{ color: "fg" }}>
                  {x}
                </Text>
              ))}
            </VStack>
          </Box>
        ))}
      </SimpleGrid>
      <Flex
        mt={10}
        pt={4.5}
        borderTop="1px solid"
        borderColor="border"
        justify="space-between"
        maxW="1280px"
        mx="auto"
        direction={{ base: "column", md: "row" }}
        gap={2}
      >
        <Text>© 2026 httui contributors</Text>
        <Text>Made with markdown.</Text>
      </Flex>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────
// App — page composition
// ─────────────────────────────────────────────────────────
export default function App() {
  return (
    <Box bg="bg" color="fg" fontFamily="body">
      <Hero />
      <HeroPreview />
      <OssStrip />

      <FeatureRow
        kicker="One file · many blocks"
        title="Markdown that runs."
        body="Each block is executable: HTTP, SQL, Mongo, gRPC, WebSocket, shell. Captures from one block become variables for the next, chaining the entire flow inside a single .md."
        points={[
          <>
            <Text as="b" color="fg">
              Chained captures
            </Text>{" "}
            — extract{" "}
            <Text
              as="code"
              fontFamily="mono"
              px={1}
              bg="bg.elevated"
              rounded="sm"
            >
              $.id
            </Text>{" "}
            from a response and reuse it as{" "}
            <Text
              as="code"
              fontFamily="mono"
              px={1}
              bg="bg.elevated"
              rounded="sm"
            >
              {"{{order_id}}"}
            </Text>{" "}
            later.
          </>,
          <>
            <Text as="b" color="fg">
              Inline assertions
            </Text>{" "}
            —{" "}
            <Text
              as="code"
              fontFamily="mono"
              px={1}
              bg="bg.elevated"
              rounded="sm"
            >
              expect: time {"<"} 500ms
            </Text>{" "}
            fails the runbook on regression.
          </>,
          <>
            <Text as="b" color="fg">
              Variables &amp; secrets
            </Text>{" "}
            referenced by key. The value never touches git.
          </>,
        ]}
        preview={<BlocksPreview />}
      />

      <FeatureRow
        reverse
        kicker="Database-native"
        title="Schema explorer next to the editor."
        body="Connect PostgreSQL, MySQL, Mongo, BigQuery. Browse tables with foreign keys, indexes, row counts. EXPLAIN ANALYZE in tree form shows where your query spends time."
        points={[
          <>
            <Text as="b" color="fg">
              Multi-database
            </Text>{" "}
            in a single runbook — query Postgres, then the warehouse, without
            switching windows.
          </>,
          <>
            <Text as="b" color="fg">
              Read-only environments
            </Text>{" "}
            — staging in one click, prod with double-confirm and a red badge.
          </>,
          <>
            <Text as="b" color="fg">
              Plan visualizer
            </Text>{" "}
            highlights costly seq scans and unused indexes.
          </>,
        ]}
        preview={<SchemaPreview />}
      />

      <FeatureRow
        kicker="Git-native · diffable"
        title="Versioned. Reviewable. Sharable."
        body="Runbooks are .md files in your repo. Pull request review like any other code. Diff between runs shows what changed in the response across executions."
        points={[
          <>
            <Text as="b" color="fg">
              PR review
            </Text>{" "}
            for runbooks on GitHub or GitLab.
          </>,
          <>
            <Text as="b" color="fg">
              Diff between runs
            </Text>{" "}
            — compare today's execution with yesterday's in two clicks.
          </>,
          <>
            <Text as="b" color="fg">
              Share links
            </Text>{" "}
            with expiry and password — hand a runbook to support without
            granting repo access.
          </>,
        ]}
        preview={<GitDiffPreview />}
      />

      <InstallSection />
      <CtaSection />
      <Footer />
    </Box>
  );
}
