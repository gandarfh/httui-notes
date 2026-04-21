import { useState, useCallback, useEffect } from "react";
import { getConfig, setConfig } from "@/lib/tauri/commands";
import type { ThemeConfig } from "@/lib/theme/config";
import { DEFAULT_THEME } from "@/lib/theme/config";
import { applyTheme } from "@/lib/theme/apply";

export interface AppSettings {
  autoSaveMs: number; // 0 = disabled
  editorFontSize: number;
  defaultFetchSize: number;
}

const DEFAULTS: AppSettings = {
  autoSaveMs: 1000,
  editorFontSize: 12,
  defaultFetchSize: 80,
};

export function useSettings() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);
  const [theme, setTheme] = useState<ThemeConfig>(DEFAULT_THEME);
  const [loaded, setLoaded] = useState(false);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  // Load from app_config on mount
  useEffect(() => {
    Promise.all([
      getConfig("auto_save_ms"),
      getConfig("editor_font_size"),
      getConfig("default_fetch_size"),
      getConfig("theme"),
    ]).then(([autoSave, fontSize, fetchSize, themeJson]) => {
      setSettings({
        autoSaveMs: autoSave ? Number(autoSave) : DEFAULTS.autoSaveMs,
        editorFontSize: fontSize ? Number(fontSize) : DEFAULTS.editorFontSize,
        defaultFetchSize: fetchSize ? Number(fetchSize) : DEFAULTS.defaultFetchSize,
      });

      let themeConfig = DEFAULT_THEME;
      if (themeJson) {
        try {
          themeConfig = { ...DEFAULT_THEME, ...JSON.parse(themeJson) };
        } catch {
          // Ignore malformed theme JSON
        }
      }
      setTheme(themeConfig);
      applyTheme(themeConfig);
      setLoaded(true);
    });
  }, []);

  const updateSetting = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
      const configKey = key === "autoSaveMs"
        ? "auto_save_ms"
        : key === "editorFontSize"
          ? "editor_font_size"
          : "default_fetch_size";
      setConfig(configKey, String(value)).catch(() => {});
    },
    [],
  );

  const updateTheme = useCallback(
    (partial: Partial<ThemeConfig>) => {
      setTheme((prev) => {
        const next = { ...prev, ...partial };
        applyTheme(next);
        setConfig("theme", JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );

  const resetTheme = useCallback(() => {
    setTheme(DEFAULT_THEME);
    applyTheme(DEFAULT_THEME);
    setConfig("theme", JSON.stringify(DEFAULT_THEME)).catch(() => {});
  }, []);

  return {
    settingsOpen,
    openSettings,
    closeSettings,
    settings,
    loaded,
    updateSetting,
    theme,
    updateTheme,
    resetTheme,
  };
}
