import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

import {
  FONT_MONO,
  FONT_SANS,
  FONT_SERIF,
  METHOD_COLORS,
  STATE_COLORS,
  THEME_DARK,
  THEME_LIGHT,
  TYPE_SCALE,
} from "@/theme/tokens";

// Semantic token entries swap value per color-mode condition.
// `_dark` resolves under `.dark &`, `_light` under `.light &`.
const semanticPair = (dark: string, light: string) => ({
  value: { _dark: dark, _light: light },
});

const config = defineConfig({
  theme: {
    tokens: {
      fonts: {
        body: { value: FONT_SANS },
        heading: { value: FONT_SERIF },
        mono: { value: FONT_MONO },
        serif: { value: FONT_SERIF },
      },
      fontSizes: {
        xs: { value: TYPE_SCALE.xs },
        sm: { value: TYPE_SCALE.sm },
        base: { value: TYPE_SCALE.base },
        md: { value: TYPE_SCALE.md },
        lg: { value: TYPE_SCALE.lg },
        xl: { value: TYPE_SCALE.xl },
        "2xl": { value: TYPE_SCALE["2xl"] },
      },
      colors: {
        method: {
          get: { value: METHOD_COLORS.get },
          post: { value: METHOD_COLORS.post },
          put: { value: METHOD_COLORS.put },
          patch: { value: METHOD_COLORS.patch },
          delete: { value: METHOD_COLORS.delete },
          head: { value: METHOD_COLORS.head },
          options: { value: METHOD_COLORS.options },
          sql: { value: METHOD_COLORS.sql },
          mongo: { value: METHOD_COLORS.mongo },
          ws: { value: METHOD_COLORS.ws },
          gql: { value: METHOD_COLORS.gql },
          sh: { value: METHOD_COLORS.sh },
        },
        state: {
          ok: { value: STATE_COLORS.ok },
          warn: { value: STATE_COLORS.warn },
          err: { value: STATE_COLORS.err },
          info: { value: STATE_COLORS.info },
        },
      },
    },
    semanticTokens: {
      colors: {
        // Backgrounds (Fuji ramp).
        bg: { value: semanticPair(THEME_DARK.bg, THEME_LIGHT.bg) },
        "bg.1": { value: semanticPair(THEME_DARK.bg1, THEME_LIGHT.bg1) },
        "bg.2": { value: semanticPair(THEME_DARK.bg2, THEME_LIGHT.bg2) },
        "bg.3": { value: semanticPair(THEME_DARK.bg3, THEME_LIGHT.bg3) },
        "bg.hi": { value: semanticPair(THEME_DARK.bgHi, THEME_LIGHT.bgHi) },
        // Lines.
        line: { value: semanticPair(THEME_DARK.line, THEME_LIGHT.line) },
        "line.soft": {
          value: semanticPair(THEME_DARK.lineSoft, THEME_LIGHT.lineSoft),
        },
        // Foregrounds.
        fg: { value: semanticPair(THEME_DARK.fg, THEME_LIGHT.fg) },
        "fg.1": { value: semanticPair(THEME_DARK.fg1, THEME_LIGHT.fg1) },
        "fg.2": { value: semanticPair(THEME_DARK.fg2, THEME_LIGHT.fg2) },
        "fg.3": { value: semanticPair(THEME_DARK.fg3, THEME_LIGHT.fg3) },
        // Accent.
        accent: {
          value: semanticPair(THEME_DARK.accent, THEME_LIGHT.accent),
        },
        "accent.fg": {
          value: semanticPair(THEME_DARK.accentFg, THEME_LIGHT.accentFg),
        },
        "accent.soft": {
          value: semanticPair(THEME_DARK.accentSoft, THEME_LIGHT.accentSoft),
        },
        // Selection.
        sel: { value: semanticPair(THEME_DARK.sel, THEME_LIGHT.sel) },
      },
    },
  },
  conditions: {
    dark: ".dark &",
    light: ".light &",
  },
});

export const system = createSystem(defaultConfig, config);
