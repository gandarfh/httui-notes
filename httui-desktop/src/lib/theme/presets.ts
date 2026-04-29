import type { ThemeConfig } from "./config";
import { DEFAULT_THEME } from "./config";

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  config: ThemeConfig;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "default",
    name: "Default",
    description: "Warm amber tones with rounded corners",
    config: DEFAULT_THEME,
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Clean zinc palette, sharp edges, no shadows",
    config: {
      accentColor: "indigo",
      grayTone: "zinc",
      borderRadius: 4,
      borderWidth: 1,
      fontBody: "system",
      fontMono: "system",
      fontSize: 14,
      density: "default",
      shadow: "none",
      customColors: null,
    },
  },
  {
    id: "ocean",
    name: "Ocean",
    description: "Cool blue accent with slate backgrounds",
    config: {
      accentColor: "blue",
      grayTone: "slate",
      borderRadius: 8,
      borderWidth: 1,
      fontBody: "inter",
      fontMono: "jetbrains",
      fontSize: 14,
      density: "default",
      shadow: "subtle",
      customColors: null,
    },
  },
  {
    id: "forest",
    name: "Forest",
    description: "Emerald greens with stone neutrals",
    config: {
      accentColor: "emerald",
      grayTone: "stone",
      borderRadius: 6,
      borderWidth: 1,
      fontBody: "figtree",
      fontMono: "fira",
      fontSize: 14,
      density: "default",
      shadow: "subtle",
      customColors: null,
    },
  },
  {
    id: "hacker",
    name: "Hacker",
    description: "Compact, sharp, teal on neutral",
    config: {
      accentColor: "teal",
      grayTone: "neutral",
      borderRadius: 2,
      borderWidth: 1,
      fontBody: "system",
      fontMono: "jetbrains",
      fontSize: 13,
      density: "compact",
      shadow: "none",
      customColors: null,
    },
  },
  {
    id: "rose",
    name: "Rose",
    description: "Soft rose accent, generous spacing",
    config: {
      accentColor: "rose",
      grayTone: "warm",
      borderRadius: 12,
      borderWidth: 1,
      fontBody: "figtree",
      fontMono: "fira",
      fontSize: 15,
      density: "comfortable",
      shadow: "medium",
      customColors: null,
    },
  },
  {
    id: "sunset",
    name: "Sunset",
    description: "Vivid orange with warm stone tones",
    config: {
      accentColor: "orange",
      grayTone: "stone",
      borderRadius: 8,
      borderWidth: 1,
      fontBody: "inter",
      fontMono: "jetbrains",
      fontSize: 14,
      density: "default",
      shadow: "subtle",
      customColors: null,
    },
  },
  {
    id: "cyber",
    name: "Cyber",
    description: "Violet accent, zero radius, bold lines",
    config: {
      accentColor: "violet",
      grayTone: "zinc",
      borderRadius: 0,
      borderWidth: 2,
      fontBody: "system",
      fontMono: "source",
      fontSize: 13,
      density: "compact",
      shadow: "none",
      customColors: null,
    },
  },
];
