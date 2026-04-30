import { HStack, Text } from "@chakra-ui/react";
import { useColorMode } from "@/components/ui/color-mode";

// Logo — the httui "h." mark. Theme-aware (light/dark) and
// supports two variants:
//   - full: wordmark + glyph (used in the navbar)
//   - logo: glyph only (used in the footer)
export function Logo({
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

// Pill — small reusable pill button (cosmetic, not a link).
// Variants:
//   solid   — accent-filled CTA
//   ink     — high-contrast dark-on-light / light-on-dark
//   ghost   — bordered transparent
type PillProps = {
  children: React.ReactNode;
  variant?: "solid" | "ghost" | "ink";
  size?: "sm" | "md";
  href?: string;
};
export function Pill({
  children,
  variant = "solid",
  size = "md",
  href,
}: PillProps) {
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

// Eyebrow — uppercase mono kicker above section titles
export function Eyebrow({
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
