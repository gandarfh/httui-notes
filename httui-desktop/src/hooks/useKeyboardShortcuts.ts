import { useEffect } from "react";

interface KeyboardShortcutActions {
  toggleSidebar: () => void;
  splitVertical: () => void;
  splitHorizontal: () => void;
  closeActiveTab: () => void;
  nextTab: () => void;
  openQuickOpen: () => void;
  openSearchPanel: () => void;
  forceSave: () => void;
  toggleChat: () => void;
  toggleSchemaPanel: () => void;
}

export function useKeyboardShortcuts(actions: KeyboardShortcutActions): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      if (e.key === "b") {
        e.preventDefault();
        actions.toggleSidebar();
      }
      if (e.key === "\\") {
        e.preventDefault();
        if (e.shiftKey) actions.splitHorizontal();
        else actions.splitVertical();
      }
      if (e.key === "w") {
        e.preventDefault();
        actions.closeActiveTab();
      }
      if (e.key === "Tab") {
        e.preventDefault();
        actions.nextTab();
      }
      if (e.key === "p") {
        e.preventDefault();
        actions.openQuickOpen();
      }
      if (e.shiftKey && e.key === "f") {
        e.preventDefault();
        actions.openSearchPanel();
      }
      if (e.key === "s") {
        e.preventDefault();
        actions.forceSave();
      }
      if (e.key === "l") {
        e.preventDefault();
        actions.toggleChat();
      }
      if (e.shiftKey && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        actions.toggleSchemaPanel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [actions]);
}
