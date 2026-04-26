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
          coverage: {
            provider: "v8",
            reporter: ["text", "html", "json-summary"],
            include: ["src/**/*.{ts,tsx}"],
            // Areas in scope for the 80% threshold: hooks, stores, lib/blocks,
            // and the layout/UI components selected during Fase 2.1.
            // Excluded items are either out of scope, deferred to browser tests,
            // or pending refactor (HttpFencedPanel/DbFencedPanel).
            exclude: [
              "src/test/**",
              "**/*.test.{ts,tsx}",
              "**/*.spec.{ts,tsx}",
              "**/__tests__/**",
              "src/main.tsx",
              "src/vite-env.d.ts",
              "src/components/ui/**",
              "src/types/**",
              // Out of scope (not selected in Fase 2.1)
              "src/components/chat/**",
              "src/components/layout/settings/**",
              "src/components/layout/schema/**",
              "src/components/layout/AppShell.tsx",
              "src/components/layout/Sidebar.tsx",
              "src/components/layout/StatusBar.tsx",
              "src/components/layout/TabBar.tsx",
              "src/components/layout/index.ts",
              // Pending refactor — testing pre-split is throw-away work
              "src/components/blocks/http/fenced/**",
              "src/components/blocks/db/fenced/**",
              "src/components/editor/HttpWidgetPortals.tsx",
              "src/components/editor/DbWidgetPortals.tsx",
              "src/components/blocks/db/SchemaPanel.tsx",
              // Deferred to browser tests (Playwright)
              "src/components/editor/MarkdownEditor.tsx",
              "src/lib/codemirror/**",
              "src/lib/blocks/document.ts",
              "src/lib/blocks/cm-autocomplete.ts",
              "src/hooks/useStickyScroll.ts",
              "src/hooks/usePromptDialog.tsx",
              "src/hooks/useSidebarResize.ts",
              "src/hooks/useEscapeClose.ts",
              "src/hooks/useAutoUpdate.ts",
              "src/hooks/useTheme.ts",
              "src/stores/tauri-bridge.ts",
              // Settings/theme runtime (DOM mutations)
              "src/lib/theme.ts",
              "src/lib/theme/**",
              // IPC layer (tested indirectly via store/hook tests; deeper
              // contracts are covered by Rust integration tests)
              "src/lib/tauri/streamedExecution.ts",
              "src/lib/tauri/connections.ts",
              "src/lib/tauri/audit.ts",
              "src/lib/tauri/chat.ts",
              "src/lib/tauri/commands.ts",
            ],
            thresholds: {
              lines: 80,
              functions: 80,
              statements: 80,
              branches: 75,
            },
          },
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
