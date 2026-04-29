import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Point @/ to the real app source — imports resolve against the actual codebase
      "@": path.resolve(__dirname, "../httui-desktop/src"),
      // Stub out modules that don't exist in a static landing page context
      "@tauri-apps/api/core": path.resolve(__dirname, "src/stubs/tauri.ts"),
      "@tauri-apps/api/event": path.resolve(__dirname, "src/stubs/tauri.ts"),
      "@tauri-apps/plugin-shell": path.resolve(__dirname, "src/stubs/tauri.ts"),
      "@tauri-apps/plugin-dialog": path.resolve(__dirname, "src/stubs/tauri.ts"),
      "@tauri-apps/plugin-fs": path.resolve(__dirname, "src/stubs/tauri.ts"),
      "@tauri-apps/api/webview": path.resolve(__dirname, "src/stubs/tauri.ts"),
      "@tiptap/core": path.resolve(__dirname, "src/stubs/tiptap.ts"),
    },
  },
  base: "/",
});
