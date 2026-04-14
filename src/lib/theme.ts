import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

const config = defineConfig({
  theme: {
    tokens: {
      fonts: {
        body: { value: "system-ui, -apple-system, sans-serif" },
        heading: { value: "system-ui, -apple-system, sans-serif" },
        mono: { value: "'SF Mono', 'Fira Code', 'Fira Mono', monospace" },
      },
    },
  },
  conditions: {
    dark: ".dark &",
    light: ".light &",
  },
});

export const system = createSystem(defaultConfig, config);
