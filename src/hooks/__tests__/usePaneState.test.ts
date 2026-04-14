import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePaneState } from "../usePaneState";

const V = "/test-vault";

describe("usePaneState", () => {
  it("starts with a single empty leaf pane", () => {
    const { result } = renderHook(() => usePaneState());
    expect(result.current.layout.type).toBe("leaf");
    if (result.current.layout.type === "leaf") {
      expect(result.current.layout.tabs).toHaveLength(0);
    }
  });

  it("openFile adds a tab to the active pane", () => {
    const { result } = renderHook(() => usePaneState());
    act(() => {
      result.current.actions.openFile("test.md", "<p>hello</p>", V);
    });
    if (result.current.layout.type === "leaf") {
      expect(result.current.layout.tabs).toHaveLength(1);
      expect(result.current.layout.tabs[0].filePath).toBe("test.md");
      expect(result.current.layout.tabs[0].vaultPath).toBe(V);
      expect(result.current.layout.activeTab).toBe(0);
    }
  });

  it("openFile switches to existing tab instead of duplicating", () => {
    const { result } = renderHook(() => usePaneState());
    act(() => {
      result.current.actions.openFile("a.md", "a", V);
      result.current.actions.openFile("b.md", "b", V);
    });
    act(() => {
      result.current.actions.openFile("a.md", "a", V);
    });
    if (result.current.layout.type === "leaf") {
      expect(result.current.layout.tabs).toHaveLength(2);
      expect(result.current.layout.activeTab).toBe(0);
    }
  });

  it("closeTab removes a tab", () => {
    const { result } = renderHook(() => usePaneState());
    act(() => {
      result.current.actions.openFile("a.md", "a", V);
      result.current.actions.openFile("b.md", "b", V);
    });
    const paneId = result.current.activePaneId;
    act(() => {
      result.current.actions.closeTab(paneId, 0);
    });
    if (result.current.layout.type === "leaf") {
      expect(result.current.layout.tabs).toHaveLength(1);
      expect(result.current.layout.tabs[0].filePath).toBe("b.md");
    }
  });

  it("splitVertical creates a split layout", () => {
    const { result } = renderHook(() => usePaneState());
    act(() => {
      result.current.actions.splitVertical();
    });
    expect(result.current.layout.type).toBe("split");
    if (result.current.layout.type === "split") {
      expect(result.current.layout.direction).toBe("vertical");
      expect(result.current.layout.ratio).toBe(0.5);
    }
  });

  it("splitHorizontal creates a horizontal split", () => {
    const { result } = renderHook(() => usePaneState());
    act(() => {
      result.current.actions.splitHorizontal();
    });
    expect(result.current.layout.type).toBe("split");
    if (result.current.layout.type === "split") {
      expect(result.current.layout.direction).toBe("horizontal");
    }
  });

  it("markUnsaved toggles tab unsaved state", () => {
    const { result } = renderHook(() => usePaneState());
    act(() => {
      result.current.actions.openFile("a.md", "a", V);
    });
    const paneId = result.current.activePaneId;
    act(() => {
      result.current.actions.markUnsaved(paneId, "a.md", true);
    });
    if (result.current.layout.type === "leaf") {
      expect(result.current.layout.tabs[0].unsaved).toBe(true);
    }
    act(() => {
      result.current.actions.markUnsaved(paneId, "a.md", false);
    });
    if (result.current.layout.type === "leaf") {
      expect(result.current.layout.tabs[0].unsaved).toBe(false);
    }
  });

  it("nextTab cycles to next tab", () => {
    const { result } = renderHook(() => usePaneState());
    act(() => {
      result.current.actions.openFile("a.md", "a", V);
      result.current.actions.openFile("b.md", "b", V);
      result.current.actions.openFile("c.md", "c", V);
    });
    act(() => {
      result.current.actions.nextTab();
    });
    if (result.current.layout.type === "leaf") {
      expect(result.current.layout.activeTab).toBe(0);
    }
  });

  it("closeOthers keeps only the specified tab", () => {
    const { result } = renderHook(() => usePaneState());
    act(() => {
      result.current.actions.openFile("a.md", "a", V);
      result.current.actions.openFile("b.md", "b", V);
      result.current.actions.openFile("c.md", "c", V);
    });
    const paneId = result.current.activePaneId;
    act(() => {
      result.current.actions.closeOthers(paneId, 1);
    });
    if (result.current.layout.type === "leaf") {
      expect(result.current.layout.tabs).toHaveLength(1);
      expect(result.current.layout.tabs[0].filePath).toBe("b.md");
    }
  });

  it("closeAll removes all tabs", () => {
    const { result } = renderHook(() => usePaneState());
    act(() => {
      result.current.actions.openFile("a.md", "a", V);
      result.current.actions.openFile("b.md", "b", V);
    });
    const paneId = result.current.activePaneId;
    act(() => {
      result.current.actions.closeAll(paneId);
    });
    if (result.current.layout.type === "leaf") {
      expect(result.current.layout.tabs).toHaveLength(0);
    }
  });

  it("resizeSplit changes split ratio", () => {
    const { result } = renderHook(() => usePaneState());
    act(() => {
      result.current.actions.splitVertical();
    });
    act(() => {
      result.current.actions.resizeSplit([], 0.7);
    });
    if (result.current.layout.type === "split") {
      expect(result.current.layout.ratio).toBe(0.7);
    }
  });

  it("editorContents stores content outside React state", () => {
    const { result } = renderHook(() => usePaneState());
    act(() => {
      result.current.actions.openFile("test.md", "<p>content</p>", V);
    });
    expect(result.current.editorContents.get("test.md")).toBe("<p>content</p>");
    act(() => {
      result.current.actions.updateContent("test.md", "<p>updated</p>");
    });
    expect(result.current.editorContents.get("test.md")).toBe("<p>updated</p>");
  });
});
