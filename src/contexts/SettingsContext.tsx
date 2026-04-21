import { createContext, useContext } from "react";
import type { AppSettings } from "@/hooks/useSettings";
import type { ThemeConfig } from "@/lib/theme/config";

export interface SettingsContextValue {
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  theme: ThemeConfig;
  updateTheme: (partial: Partial<ThemeConfig>) => void;
  resetTheme: () => void;
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettingsContext(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettingsContext must be used within SettingsProvider");
  return ctx;
}
