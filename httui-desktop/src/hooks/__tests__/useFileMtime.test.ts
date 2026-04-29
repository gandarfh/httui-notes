import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { mockTauriCommand, clearTauriMocks } from "@/test/mocks/tauri";

import { useFileMtime } from "@/hooks/useFileMtime";

const SAMPLE_MTIME = 1_700_000_000_000;

beforeEach(() => {
  clearTauriMocks();
});

afterEach(() => {
  clearTauriMocks();
});

describe("useFileMtime", () => {
  it("stays null while vaultPath is missing", async () => {
    const { result } = renderHook(() => useFileMtime(null, "note.md"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.mtime).toBeNull();
  });

  it("stays null while filePath is missing", async () => {
    const { result } = renderHook(() => useFileMtime("/v", null));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.mtime).toBeNull();
  });

  it("populates mtime after the initial poll resolves", async () => {
    mockTauriCommand("get_file_mtime", () => SAMPLE_MTIME);

    const { result } = renderHook(() => useFileMtime("/v", "note.md"));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.mtime).toBe(SAMPLE_MTIME);
  });

  it("returns null when the Tauri command resolves to null", async () => {
    mockTauriCommand("get_file_mtime", () => null);

    const { result } = renderHook(() => useFileMtime("/v", "missing.md"));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.mtime).toBeNull();
  });

  it("swallows transient errors and falls back to null", async () => {
    mockTauriCommand("get_file_mtime", () => {
      throw new Error("io error");
    });

    const { result } = renderHook(() => useFileMtime("/v", "note.md"));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.mtime).toBeNull();
  });

  it("refresh() forces an immediate refetch", async () => {
    let calls = 0;
    mockTauriCommand("get_file_mtime", () => {
      calls += 1;
      return SAMPLE_MTIME + calls;
    });

    const { result } = renderHook(() => useFileMtime("/v", "note.md"));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(calls).toBe(1);

    await act(async () => {
      result.current.refresh();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(calls).toBe(2);
    expect(result.current.mtime).toBe(SAMPLE_MTIME + 2);
  });

  it("re-polls when the window regains focus", async () => {
    let calls = 0;
    mockTauriCommand("get_file_mtime", () => {
      calls += 1;
      return SAMPLE_MTIME;
    });

    renderHook(() => useFileMtime("/v", "note.md"));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(calls).toBe(1);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(calls).toBe(2);
  });
});
