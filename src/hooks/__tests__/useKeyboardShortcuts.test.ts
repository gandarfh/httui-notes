import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardShortcuts } from "../useKeyboardShortcuts";

function createActions() {
  return {
    toggleSidebar: vi.fn(),
    splitVertical: vi.fn(),
    splitHorizontal: vi.fn(),
    closeActiveTab: vi.fn(),
    nextTab: vi.fn(),
    openQuickOpen: vi.fn(),
    openSearchPanel: vi.fn(),
    forceSave: vi.fn(),
    toggleChat: vi.fn(),
    toggleSchemaPanel: vi.fn(),
  };
}

function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    metaKey: true,
    bubbles: true,
    ...opts,
  });
  window.dispatchEvent(event);
}

describe("useKeyboardShortcuts", () => {
  it("Cmd+B calls toggleSidebar", () => {
    const actions = createActions();
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey("b");
    expect(actions.toggleSidebar).toHaveBeenCalledOnce();
  });

  it("Cmd+\\ calls splitVertical", () => {
    const actions = createActions();
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey("\\");
    expect(actions.splitVertical).toHaveBeenCalledOnce();
  });

  it("Cmd+Shift+\\ calls splitHorizontal", () => {
    const actions = createActions();
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey("\\", { shiftKey: true });
    expect(actions.splitHorizontal).toHaveBeenCalledOnce();
  });

  it("Cmd+W calls closeActiveTab", () => {
    const actions = createActions();
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey("w");
    expect(actions.closeActiveTab).toHaveBeenCalledOnce();
  });

  it("Cmd+Tab calls nextTab", () => {
    const actions = createActions();
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey("Tab");
    expect(actions.nextTab).toHaveBeenCalledOnce();
  });

  it("Cmd+P calls openQuickOpen", () => {
    const actions = createActions();
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey("p");
    expect(actions.openQuickOpen).toHaveBeenCalledOnce();
  });

  it("Cmd+S calls forceSave", () => {
    const actions = createActions();
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey("s");
    expect(actions.forceSave).toHaveBeenCalledOnce();
  });

  it("Cmd+Shift+D calls toggleSchemaPanel", () => {
    const actions = createActions();
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey("d", { shiftKey: true });
    expect(actions.toggleSchemaPanel).toHaveBeenCalledOnce();
  });

  it("does not trigger without modifier key", () => {
    const actions = createActions();
    renderHook(() => useKeyboardShortcuts(actions));
    const event = new KeyboardEvent("keydown", {
      key: "b",
      metaKey: false,
      ctrlKey: false,
      bubbles: true,
    });
    window.dispatchEvent(event);
    expect(actions.toggleSidebar).not.toHaveBeenCalled();
  });
});
