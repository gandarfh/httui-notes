import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockTauriCommand, clearTauriMocks } from "@/test/mocks/tauri";
import { DEFAULT_THEME } from "@/lib/theme/config";

// Mock applyTheme to avoid touching the real DOM
vi.mock("@/lib/theme/apply", () => ({
  applyTheme: vi.fn(),
}));

import { useSettingsStore } from "@/stores/settings";
import { applyTheme } from "@/lib/theme/apply";

const DEFAULT_SETTINGS = {
  autoSaveMs: 1000,
  editorFontSize: 12,
  defaultFetchSize: 80,
  historyRetention: 10,
};

function resetStore() {
  useSettingsStore.setState({
    settingsOpen: false,
    settings: DEFAULT_SETTINGS,
    loaded: false,
    theme: DEFAULT_THEME,
    vimEnabled: false,
    vimMode: "normal",
    sidebarOpen: true,
  });
}

describe("settingsStore", () => {
  beforeEach(() => {
    resetStore();
    clearTauriMocks();
    vi.mocked(applyTheme).mockClear();
  });

  afterEach(() => {
    clearTauriMocks();
  });

  describe("modal toggles", () => {
    it("openSettings/closeSettings flip the flag", () => {
      useSettingsStore.getState().openSettings();
      expect(useSettingsStore.getState().settingsOpen).toBe(true);
      useSettingsStore.getState().closeSettings();
      expect(useSettingsStore.getState().settingsOpen).toBe(false);
    });

    it("toggleSidebar / setSidebarOpen control sidebarOpen", () => {
      useSettingsStore.getState().toggleSidebar();
      expect(useSettingsStore.getState().sidebarOpen).toBe(false);
      useSettingsStore.getState().setSidebarOpen(true);
      expect(useSettingsStore.getState().sidebarOpen).toBe(true);
    });
  });

  describe("vim controls", () => {
    it("toggleVim flips vimEnabled", () => {
      useSettingsStore.getState().toggleVim();
      expect(useSettingsStore.getState().vimEnabled).toBe(true);
      useSettingsStore.getState().toggleVim();
      expect(useSettingsStore.getState().vimEnabled).toBe(false);
    });

    it("setVimEnabled sets the flag explicitly", () => {
      useSettingsStore.getState().setVimEnabled(true);
      expect(useSettingsStore.getState().vimEnabled).toBe(true);
    });

    it("setVimMode updates the mode", () => {
      useSettingsStore.getState().setVimMode("insert");
      expect(useSettingsStore.getState().vimMode).toBe("insert");
    });
  });

  describe("updateSetting — config key mapping", () => {
    it("autoSaveMs maps to auto_save_ms", async () => {
      let received: unknown = null;
      mockTauriCommand("set_config", (args) => {
        received = args;
      });

      useSettingsStore.getState().updateSetting("autoSaveMs", 500);

      expect(useSettingsStore.getState().settings.autoSaveMs).toBe(500);
      // setConfig is fire-and-forget — flush microtasks
      await Promise.resolve();
      await Promise.resolve();
      expect(received).toEqual({ key: "auto_save_ms", value: "500" });
    });

    it("editorFontSize maps to editor_font_size", async () => {
      let received: unknown = null;
      mockTauriCommand("set_config", (args) => {
        received = args;
      });

      useSettingsStore.getState().updateSetting("editorFontSize", 16);
      await Promise.resolve();
      await Promise.resolve();

      expect(received).toEqual({ key: "editor_font_size", value: "16" });
    });

    it("defaultFetchSize maps to default_fetch_size", async () => {
      let received: unknown = null;
      mockTauriCommand("set_config", (args) => {
        received = args;
      });

      useSettingsStore.getState().updateSetting("defaultFetchSize", 200);
      await Promise.resolve();
      await Promise.resolve();

      expect(received).toEqual({ key: "default_fetch_size", value: "200" });
    });

    it("historyRetention maps to history_retention", async () => {
      let received: unknown = null;
      mockTauriCommand("set_config", (args) => {
        received = args;
      });

      useSettingsStore.getState().updateSetting("historyRetention", 25);
      await Promise.resolve();
      await Promise.resolve();

      expect(received).toEqual({ key: "history_retention", value: "25" });
    });

    it("ignores set_config errors silently", async () => {
      mockTauriCommand("set_config", () => {
        throw new Error("write failed");
      });

      expect(() =>
        useSettingsStore.getState().updateSetting("autoSaveMs", 999),
      ).not.toThrow();
      expect(useSettingsStore.getState().settings.autoSaveMs).toBe(999);
    });
  });

  describe("theme actions", () => {
    it("updateTheme merges partial and applies", async () => {
      mockTauriCommand("set_config", () => {});

      useSettingsStore.getState().updateTheme({ accentColor: "blue" });

      expect(useSettingsStore.getState().theme.accentColor).toBe("blue");
      expect(useSettingsStore.getState().theme.grayTone).toBe(
        DEFAULT_THEME.grayTone,
      );
      expect(applyTheme).toHaveBeenCalledTimes(1);
    });

    it("updateTheme persists JSON to set_config", async () => {
      let received: unknown = null;
      mockTauriCommand("set_config", (args) => {
        received = args;
      });

      useSettingsStore.getState().updateTheme({ borderRadius: 10 });
      await Promise.resolve();
      await Promise.resolve();

      const r = received as { key: string; value: string };
      expect(r.key).toBe("theme");
      expect(JSON.parse(r.value).borderRadius).toBe(10);
    });

    it("resetTheme restores DEFAULT_THEME and applies", () => {
      useSettingsStore.setState({
        theme: { ...DEFAULT_THEME, accentColor: "rose" },
      });
      mockTauriCommand("set_config", () => {});

      useSettingsStore.getState().resetTheme();

      expect(useSettingsStore.getState().theme).toEqual(DEFAULT_THEME);
      expect(applyTheme).toHaveBeenCalledWith(DEFAULT_THEME);
    });
  });

  describe("loadSettings", () => {
    it("uses defaults when config returns null for everything", async () => {
      mockTauriCommand("get_config", () => null);

      await useSettingsStore.getState().loadSettings();

      expect(useSettingsStore.getState().settings).toEqual(DEFAULT_SETTINGS);
      expect(useSettingsStore.getState().theme).toEqual(DEFAULT_THEME);
      expect(useSettingsStore.getState().loaded).toBe(true);
      expect(applyTheme).toHaveBeenCalledWith(DEFAULT_THEME);
    });

    it("parses numeric values from config", async () => {
      const values: Record<string, string> = {
        auto_save_ms: "500",
        editor_font_size: "18",
        default_fetch_size: "100",
        history_retention: "20",
      };
      mockTauriCommand("get_config", (args) => {
        const key = (args as { key: string }).key;
        return values[key] ?? null;
      });

      await useSettingsStore.getState().loadSettings();

      expect(useSettingsStore.getState().settings).toEqual({
        autoSaveMs: 500,
        editorFontSize: 18,
        defaultFetchSize: 100,
        historyRetention: 20,
      });
    });

    it("merges stored theme JSON with DEFAULT_THEME", async () => {
      const stored = { accentColor: "violet", borderRadius: 12 };
      mockTauriCommand("get_config", (args) => {
        if ((args as { key: string }).key === "theme") {
          return JSON.stringify(stored);
        }
        return null;
      });

      await useSettingsStore.getState().loadSettings();

      const theme = useSettingsStore.getState().theme;
      expect(theme.accentColor).toBe("violet");
      expect(theme.borderRadius).toBe(12);
      // unrelated fields preserved from defaults
      expect(theme.grayTone).toBe(DEFAULT_THEME.grayTone);
    });

    it("falls back to DEFAULT_THEME when stored theme JSON is invalid", async () => {
      mockTauriCommand("get_config", (args) => {
        if ((args as { key: string }).key === "theme") return "not-json{";
        return null;
      });

      await useSettingsStore.getState().loadSettings();

      expect(useSettingsStore.getState().theme).toEqual(DEFAULT_THEME);
      expect(useSettingsStore.getState().loaded).toBe(true);
    });
  });
});
