import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFileSearch } from "@/hooks/useFileSearch";
import { mockTauriCommand, clearTauriMocks } from "@/test/mocks/tauri";
import type { SearchResult } from "@/lib/tauri/commands";

const VAULT = "/test/vault";

const mkResult = (name: string, score = 1): SearchResult => ({
  path: `${VAULT}/${name}`,
  name,
  score,
});

describe("useFileSearch", () => {
  beforeEach(() => {
    clearTauriMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    clearTauriMocks();
    vi.useRealTimers();
  });

  async function flush() {
    // Advance debounce window + flush microtasks
    await act(async () => {
      vi.advanceTimersByTime(150);
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("loads all files on mount when vaultPath is set", async () => {
    const all = [mkResult("a.md"), mkResult("b.md")];
    mockTauriCommand("search_files", () => all);
    const onSelect = vi.fn();
    const onClose = vi.fn();

    const { result } = renderHook(() =>
      useFileSearch({ vaultPath: VAULT, onSelect, onClose }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.results).toEqual(all);
  });

  it("does not call search_files on mount when vaultPath is null", async () => {
    let called = false;
    mockTauriCommand("search_files", () => {
      called = true;
      return [];
    });

    renderHook(() =>
      useFileSearch({ vaultPath: null, onSelect: vi.fn(), onClose: vi.fn() }),
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(called).toBe(false);
  });

  it("handleSearch updates query immediately and resets selectedIndex", () => {
    mockTauriCommand("search_files", () => []);
    const { result } = renderHook(() =>
      useFileSearch({
        vaultPath: VAULT,
        onSelect: vi.fn(),
        onClose: vi.fn(),
      }),
    );

    act(() => {
      result.current.setSelectedIndex(3);
    });
    act(() => {
      result.current.handleSearch("foo");
    });

    expect(result.current.query).toBe("foo");
    expect(result.current.selectedIndex).toBe(0);
  });

  it("debounces search_files calls (100ms)", async () => {
    let calls = 0;
    let lastQuery: string | null = null;
    mockTauriCommand("search_files", (args) => {
      calls++;
      lastQuery = (args as { query: string }).query;
      return [mkResult("hit.md")];
    });

    const { result } = renderHook(() =>
      useFileSearch({
        vaultPath: VAULT,
        onSelect: vi.fn(),
        onClose: vi.fn(),
      }),
    );

    // Initial mount call
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const initialCalls = calls;

    act(() => result.current.handleSearch("a"));
    act(() => result.current.handleSearch("ab"));
    act(() => result.current.handleSearch("abc"));

    // Inside debounce window — no extra calls yet
    expect(calls).toBe(initialCalls);

    await act(async () => {
      vi.advanceTimersByTime(100);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(calls).toBe(initialCalls + 1);
    expect(lastQuery).toBe("abc");
  });

  it("safeIndex clamps to last result when selectedIndex exceeds list", () => {
    const all = [mkResult("a.md"), mkResult("b.md")];
    mockTauriCommand("search_files", () => all);

    const { result } = renderHook(() =>
      useFileSearch({
        vaultPath: VAULT,
        onSelect: vi.fn(),
        onClose: vi.fn(),
      }),
    );

    act(() => {
      result.current.setSelectedIndex(99);
    });
    expect(result.current.safeIndex).toBe(0); // results still empty
  });

  it("safeIndex is 0 when results empty", () => {
    mockTauriCommand("search_files", () => []);
    const { result } = renderHook(() =>
      useFileSearch({
        vaultPath: VAULT,
        onSelect: vi.fn(),
        onClose: vi.fn(),
      }),
    );

    act(() => {
      result.current.setSelectedIndex(5);
    });
    expect(result.current.safeIndex).toBe(0);
  });

  it("handleSelect calls onClose then onSelect with result.path", async () => {
    const all = [mkResult("found.md")];
    mockTauriCommand("search_files", () => all);
    const onSelect = vi.fn();
    const onClose = vi.fn();

    const { result } = renderHook(() =>
      useFileSearch({ vaultPath: VAULT, onSelect, onClose }),
    );
    await flush();

    act(() => {
      result.current.handleSelect(0);
    });

    expect(onClose).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith(`${VAULT}/found.md`);
  });

  it("handleSelect is no-op for invalid index", async () => {
    mockTauriCommand("search_files", () => []);
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useFileSearch({ vaultPath: VAULT, onSelect, onClose }),
    );

    act(() => {
      result.current.handleSelect(99);
    });

    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ArrowDown moves selection forward, wrapping", async () => {
    const all = [mkResult("a.md"), mkResult("b.md"), mkResult("c.md")];
    mockTauriCommand("search_files", () => all);
    const { result } = renderHook(() =>
      useFileSearch({
        vaultPath: VAULT,
        onSelect: vi.fn(),
        onClose: vi.fn(),
      }),
    );
    await flush();

    const fakeEvent = (key: string) =>
      ({
        key,
        preventDefault: vi.fn(),
      }) as unknown as React.KeyboardEvent;

    act(() => result.current.handleKeyDown(fakeEvent("ArrowDown")));
    expect(result.current.selectedIndex).toBe(1);
    act(() => result.current.handleKeyDown(fakeEvent("ArrowDown")));
    expect(result.current.selectedIndex).toBe(2);
    act(() => result.current.handleKeyDown(fakeEvent("ArrowDown")));
    expect(result.current.selectedIndex).toBe(0); // wrap
  });

  it("ArrowUp moves selection backward, wrapping", async () => {
    const all = [mkResult("a.md"), mkResult("b.md"), mkResult("c.md")];
    mockTauriCommand("search_files", () => all);
    const { result } = renderHook(() =>
      useFileSearch({
        vaultPath: VAULT,
        onSelect: vi.fn(),
        onClose: vi.fn(),
      }),
    );
    await flush();

    const fakeEvent = (key: string) =>
      ({
        key,
        preventDefault: vi.fn(),
      }) as unknown as React.KeyboardEvent;

    act(() => result.current.handleKeyDown(fakeEvent("ArrowUp")));
    expect(result.current.selectedIndex).toBe(2); // wrap to last
    act(() => result.current.handleKeyDown(fakeEvent("ArrowUp")));
    expect(result.current.selectedIndex).toBe(1);
  });

  it("Enter triggers handleSelect on safeIndex", async () => {
    const all = [mkResult("first.md"), mkResult("second.md")];
    mockTauriCommand("search_files", () => all);
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useFileSearch({ vaultPath: VAULT, onSelect, onClose }),
    );
    await flush();

    const fakeEvent = (key: string) =>
      ({
        key,
        preventDefault: vi.fn(),
      }) as unknown as React.KeyboardEvent;

    act(() => result.current.setSelectedIndex(1));
    act(() => result.current.handleKeyDown(fakeEvent("Enter")));

    expect(onSelect).toHaveBeenCalledWith(`${VAULT}/second.md`);
    expect(onClose).toHaveBeenCalled();
  });

  it("swallows search_files errors silently", async () => {
    mockTauriCommand("search_files", () => {
      throw new Error("rpc fail");
    });

    const { result } = renderHook(() =>
      useFileSearch({
        vaultPath: VAULT,
        onSelect: vi.fn(),
        onClose: vi.fn(),
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });

    expect(result.current.results).toEqual([]);
  });
});
