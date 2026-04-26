import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { getConfig, setConfig } from "@/lib/tauri/commands";
import type { ThemeConfig } from "@/lib/theme/config";
import { DEFAULT_THEME } from "@/lib/theme/config";
import { applyTheme } from "@/lib/theme/apply";

// --- Types ---

export type EditorEngine = "tiptap" | "codemirror";

export interface AppSettings {
  autoSaveMs: number;
  editorFontSize: number;
  defaultFetchSize: number;
  /** Cap for HTTP block run history (per file/alias). Onda 3. */
  historyRetention: number;
}

const DEFAULTS: AppSettings = {
  autoSaveMs: 1000,
  editorFontSize: 12,
  defaultFetchSize: 80,
  historyRetention: 10,
};

interface SettingsState {
  // Settings
  settingsOpen: boolean;
  settings: AppSettings;
  loaded: boolean;
  theme: ThemeConfig;

  // Editor settings
  vimEnabled: boolean;
  vimMode: string;
  editorEngine: EditorEngine;

  // Layout
  sidebarOpen: boolean;

  // Actions
  openSettings: () => void;
  closeSettings: () => void;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  updateTheme: (partial: Partial<ThemeConfig>) => void;
  resetTheme: () => void;
  toggleVim: () => void;
  setVimMode: (mode: string) => void;
  setEditorEngine: (engine: EditorEngine) => void;
  setVimEnabled: (enabled: boolean) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  loadSettings: () => Promise<void>;
}

// --- Store ---

export const useSettingsStore = create<SettingsState>()(
  devtools(
    (set) => ({
      settingsOpen: false,
      settings: DEFAULTS,
      loaded: false,
      theme: DEFAULT_THEME,
      vimEnabled: false,
      vimMode: "normal",
      editorEngine: "codemirror" as EditorEngine,
      sidebarOpen: true,

      openSettings: () => set({ settingsOpen: true }),
      closeSettings: () => set({ settingsOpen: false }),

      updateSetting: (key, value) => {
        set((state) => ({
          settings: { ...state.settings, [key]: value },
        }));
        const configKey =
          key === "autoSaveMs"
            ? "auto_save_ms"
            : key === "editorFontSize"
              ? "editor_font_size"
              : key === "defaultFetchSize"
                ? "default_fetch_size"
                : "history_retention";
        setConfig(configKey, String(value)).catch(() => {});
      },

      updateTheme: (partial) => {
        set((state) => {
          const next = { ...state.theme, ...partial };
          applyTheme(next);
          setConfig("theme", JSON.stringify(next)).catch(() => {});
          return { theme: next };
        });
      },

      resetTheme: () => {
        set({ theme: DEFAULT_THEME });
        applyTheme(DEFAULT_THEME);
        setConfig("theme", JSON.stringify(DEFAULT_THEME)).catch(() => {});
      },

      toggleVim: () => set((state) => ({ vimEnabled: !state.vimEnabled })),
      setVimMode: (mode) => set({ vimMode: mode }),
      setEditorEngine: (engine) => set({ editorEngine: engine }),
      setVimEnabled: (enabled) => set({ vimEnabled: enabled }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      loadSettings: async () => {
        const [autoSave, fontSize, fetchSize, retention, themeJson] =
          await Promise.all([
            getConfig("auto_save_ms"),
            getConfig("editor_font_size"),
            getConfig("default_fetch_size"),
            getConfig("history_retention"),
            getConfig("theme"),
          ]);

        let themeConfig = DEFAULT_THEME;
        if (themeJson) {
          try {
            themeConfig = { ...DEFAULT_THEME, ...JSON.parse(themeJson) };
          } catch { /* ignore */ }
        }
        applyTheme(themeConfig);

        set({
          settings: {
            autoSaveMs: autoSave ? Number(autoSave) : DEFAULTS.autoSaveMs,
            editorFontSize: fontSize ? Number(fontSize) : DEFAULTS.editorFontSize,
            defaultFetchSize: fetchSize ? Number(fetchSize) : DEFAULTS.defaultFetchSize,
            historyRetention: retention
              ? Number(retention)
              : DEFAULTS.historyRetention,
          },
          theme: themeConfig,
          loaded: true,
        });
      },
    }),
    { name: "settings-store" },
  ),
);
