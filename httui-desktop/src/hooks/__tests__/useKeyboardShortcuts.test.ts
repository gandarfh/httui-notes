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

  it("Cmd+Shift+O calls toggleOutlinePanel when supplied", () => {
    const actions = {
      ...createActions(),
      toggleOutlinePanel: vi.fn(),
    };
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey("o", { shiftKey: true });
    expect(actions.toggleOutlinePanel).toHaveBeenCalledOnce();
  });

  it("Cmd+Shift+H calls toggleHistoryPanel when supplied", () => {
    const actions = {
      ...createActions(),
      toggleHistoryPanel: vi.fn(),
    };
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey("h", { shiftKey: true });
    expect(actions.toggleHistoryPanel).toHaveBeenCalledOnce();
  });

  it("Cmd+Shift+O is a no-op when toggleOutlinePanel is undefined", () => {
    // Optional action — older AppShell instances may not pass it.
    // Don't preventDefault either — let the keyboard event bubble.
    const actions = createActions();
    renderHook(() => useKeyboardShortcuts(actions));
    const event = new KeyboardEvent("keydown", {
      key: "o",
      metaKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("Cmd+Shift+H is a no-op when toggleHistoryPanel is undefined", () => {
    const actions = createActions();
    renderHook(() => useKeyboardShortcuts(actions));
    const event = new KeyboardEvent("keydown", {
      key: "h",
      metaKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("Cmd+Shift+O accepts uppercase 'O'", () => {
    const actions = {
      ...createActions(),
      toggleOutlinePanel: vi.fn(),
    };
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey("O", { shiftKey: true });
    expect(actions.toggleOutlinePanel).toHaveBeenCalledOnce();
  });
});
