import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@tauri-apps/api/core": path.resolve(__dirname, "./src/test/mocks/tauri.ts"),
      "@tauri-apps/api/event": path.resolve(__dirname, "./src/test/mocks/tauri-event.ts"),
      "@tauri-apps/plugin-dialog": path.resolve(__dirname, "./src/test/mocks/tauri-dialog.ts"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
