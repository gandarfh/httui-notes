import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

const config = defineConfig({
  theme: {
    tokens: {
      colors: {
        brand: {
          50: { value: "#fef7ed" },
          100: { value: "#fcecd4" },
          200: { value: "#f7d5a8" },
          300: { value: "#f2b870" },
          400: { value: "#ec9a38" },
          500: { value: "#e48320" },
          600: { value: "#c56416" },
          700: { value: "#a44a15" },
          800: { value: "#853b18" },
          900: { value: "#6d3318" },
          950: { value: "#3a170a" },
        },
        // Warm-tinted grays — subtle hue shift toward brand (hue ~70°)
        gray: {
          50: { value: "#faf9f7" },
          100: { value: "#f0eeeb" },
          200: { value: "#e0ddd8" },
          300: { value: "#c8c4be" },
          400: { value: "#a8a39b" },
          500: { value: "#8a847c" },
          600: { value: "#6b665f" },
          700: { value: "#514d47" },
          800: { value: "#363330" },
          900: { value: "#1f1d1b" },
          950: { value: "#13120f" },
        },
      },
      fonts: {
        body: { value: "'Figtree', system-ui, -apple-system, sans-serif" },
        heading: { value: "'Archivo', system-ui, -apple-system, sans-serif" },
        mono: { value: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace" },
      },
    },
  },
  conditions: {
    dark: ".dark &",
    light: ".light &",
  },
});

export const system = createSystem(defaultConfig, config);
