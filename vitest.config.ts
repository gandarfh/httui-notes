import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import path from "path";

const aliases = {
  "@": path.resolve(__dirname, "./src"),
  "@tauri-apps/api/core": path.resolve(__dirname, "./src/test/mocks/tauri.ts"),
  "@tauri-apps/api/event": path.resolve(__dirname, "./src/test/mocks/tauri-event.ts"),
  "@tauri-apps/plugin-dialog": path.resolve(__dirname, "./src/test/mocks/tauri-dialog.ts"),
};

export default defineConfig({
  plugins: [react()],
  resolve: { alias: aliases },
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: { alias: aliases },
        test: {
          name: "unit",
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          globals: true,
          include: ["src/**/*.{test,spec}.{ts,tsx}"],
          exclude: ["src/**/*.browser.{test,spec}.{ts,tsx}"],
        },
      },
      {
        plugins: [react()],
        resolve: { alias: aliases },
        test: {
          name: "browser",
          globals: true,
          include: ["src/**/*.browser.{test,spec}.{ts,tsx}"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
