import { createContext, useContext } from "react";

export interface EditorSettingsContextValue {
  vimEnabled: boolean;
  vimMode: string;
  toggleVim: () => void;
  setVimMode: (mode: string) => void;
}

export const EditorSettingsContext = createContext<EditorSettingsContextValue | null>(null);

export function useEditorSettings(): EditorSettingsContextValue {
  const ctx = useContext(EditorSettingsContext);
  if (!ctx) throw new Error("useEditorSettings must be used within EditorSettingsProvider");
  return ctx;
}
