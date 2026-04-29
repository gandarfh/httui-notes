import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFileOperations } from "@/hooks/useFileOperations";
import { mockTauriCommand, clearTauriMocks } from "@/test/mocks/tauri";

const VAULT = "/test/vault";

function setup(opts?: {
  vaultPath?: string | null;
  onFileCreated?: (p: string) => void;
}) {
  const refreshFileTree = vi.fn(async () => {});
  const onFileCreated = opts?.onFileCreated ?? vi.fn();
  // Use `in` so null is preserved (?? would coerce null → default)
  const vaultPath = opts && "vaultPath" in opts ? opts.vaultPath : VAULT;
  const hook = renderHook(() =>
    useFileOperations({
      vaultPath: vaultPath ?? null,
      refreshFileTree,
      onFileCreated,
    }),
  );
  return { ...hook, refreshFileTree, onFileCreated };
}

describe("useFileOperations", () => {
  beforeEach(() => {
    clearTauriMocks();
  });

  afterEach(() => {
    clearTauriMocks();
  });

  describe("inline create state machine", () => {
    it("starts with inlineCreate null", () => {
      const { result } = setup();
      expect(result.current.inlineCreate).toBeNull();
    });

    it("handleStartCreate sets inlineCreate", () => {
      const { result } = setup();
      act(() => result.current.handleStartCreate("note", "folder"));
      expect(result.current.inlineCreate).toEqual({
        type: "note",
        dirPath: "folder",
      });
    });

    it("cancelInlineCreate clears it", () => {
      const { result } = setup();
      act(() => result.current.handleStartCreate("folder", "x"));
      act(() => result.current.cancelInlineCreate());
      expect(result.current.inlineCreate).toBeNull();
    });
  });

  describe("handleCreateNote", () => {
    it("creates note at root with .md extension and refreshes", async () => {
      let received: unknown = null;
      mockTauriCommand("create_note", (args) => {
        received = args;
      });
      const { result, refreshFileTree, onFileCreated } = setup();

      await act(async () => {
        await result.current.handleCreateNote("", "newfile");
      });

      expect(received).toEqual({ vaultPath: VAULT, filePath: "newfile.md" });
      expect(refreshFileTree).toHaveBeenCalledWith(VAULT);
      expect(onFileCreated).toHaveBeenCalledWith("newfile.md");
    });

    it("creates note inside dir with proper path", async () => {
      let received: unknown = null;
      mockTauriCommand("create_note", (args) => {
        received = args;
      });
      const { result } = setup();

      await act(async () => {
        await result.current.handleCreateNote("notes/sub", "draft");
      });

      expect(received).toEqual({
        vaultPath: VAULT,
        filePath: "notes/sub/draft.md",
      });
    });

    it("noop when vaultPath is null", async () => {
      let called = false;
      mockTauriCommand("create_note", () => {
        called = true;
      });
      const { result, refreshFileTree } = setup({ vaultPath: null });

      await act(async () => {
        await result.current.handleCreateNote("", "x");
      });

      expect(called).toBe(false);
      expect(refreshFileTree).not.toHaveBeenCalled();
    });

    it("noop when name is empty", async () => {
      let called = false;
      mockTauriCommand("create_note", () => {
        called = true;
      });
      const { result } = setup();

      await act(async () => {
        await result.current.handleCreateNote("", "");
      });

      expect(called).toBe(false);
    });

    it("logs but does not throw on backend error", async () => {
      mockTauriCommand("create_note", () => {
        throw new Error("disk full");
      });
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { result, onFileCreated } = setup();

      await act(async () => {
        await result.current.handleCreateNote("", "x");
      });

      expect(errSpy).toHaveBeenCalled();
      expect(onFileCreated).not.toHaveBeenCalled();
      errSpy.mockRestore();
    });

    it("clears inlineCreate after starting", async () => {
      mockTauriCommand("create_note", () => {});
      const { result } = setup();

      act(() => result.current.handleStartCreate("note", "any"));
      expect(result.current.inlineCreate).not.toBeNull();

      await act(async () => {
        await result.current.handleCreateNote("any", "x");
      });

      expect(result.current.inlineCreate).toBeNull();
    });
  });

  describe("handleCreateFolder", () => {
    it("creates folder at given path and refreshes", async () => {
      let received: unknown = null;
      mockTauriCommand("create_folder", (args) => {
        received = args;
      });
      const { result, refreshFileTree } = setup();

      await act(async () => {
        await result.current.handleCreateFolder("docs", "drafts");
      });

      expect(received).toEqual({ vaultPath: VAULT, folderPath: "docs/drafts" });
      expect(refreshFileTree).toHaveBeenCalled();
    });

    it("creates folder at root", async () => {
      let received: unknown = null;
      mockTauriCommand("create_folder", (args) => {
        received = args;
      });
      const { result } = setup();

      await act(async () => {
        await result.current.handleCreateFolder("", "topdir");
      });

      expect(received).toEqual({ vaultPath: VAULT, folderPath: "topdir" });
    });

    it("noop when name is empty", async () => {
      let called = false;
      mockTauriCommand("create_folder", () => {
        called = true;
      });
      const { result } = setup();

      await act(async () => {
        await result.current.handleCreateFolder("docs", "");
      });

      expect(called).toBe(false);
    });

    it("logs but does not throw on error", async () => {
      mockTauriCommand("create_folder", () => {
        throw new Error("nope");
      });
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { result } = setup();

      await act(async () => {
        await result.current.handleCreateFolder("", "x");
      });

      expect(errSpy).toHaveBeenCalled();
      errSpy.mockRestore();
    });
  });

  describe("handleRename", () => {
    it("renames at root keeping no parent", async () => {
      let received: unknown = null;
      mockTauriCommand("rename_note", (args) => {
        received = args;
      });
      const { result } = setup();

      await act(async () => {
        await result.current.handleRename("old.md", "new.md");
      });

      expect(received).toEqual({
        vaultPath: VAULT,
        oldPath: "old.md",
        newPath: "new.md",
      });
    });

    it("renames within nested dir preserving parent", async () => {
      let received: unknown = null;
      mockTauriCommand("rename_note", (args) => {
        received = args;
      });
      const { result } = setup();

      await act(async () => {
        await result.current.handleRename("a/b/old.md", "new.md");
      });

      expect(received).toEqual({
        vaultPath: VAULT,
        oldPath: "a/b/old.md",
        newPath: "a/b/new.md",
      });
    });

    it("noop when newName is empty", async () => {
      let called = false;
      mockTauriCommand("rename_note", () => {
        called = true;
      });
      const { result } = setup();

      await act(async () => {
        await result.current.handleRename("a.md", "");
      });

      expect(called).toBe(false);
    });

    it("logs but does not throw on error", async () => {
      mockTauriCommand("rename_note", () => {
        throw new Error("conflict");
      });
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { result } = setup();

      await act(async () => {
        await result.current.handleRename("a.md", "b.md");
      });

      expect(errSpy).toHaveBeenCalled();
      errSpy.mockRestore();
    });
  });

  describe("handleDelete", () => {
    it("deletes and refreshes", async () => {
      let received: unknown = null;
      mockTauriCommand("delete_note", (args) => {
        received = args;
      });
      const { result, refreshFileTree } = setup();

      await act(async () => {
        await result.current.handleDelete("trash.md");
      });

      expect(received).toEqual({ vaultPath: VAULT, filePath: "trash.md" });
      expect(refreshFileTree).toHaveBeenCalled();
    });

    it("noop when vaultPath is null", async () => {
      let called = false;
      mockTauriCommand("delete_note", () => {
        called = true;
      });
      const { result } = setup({ vaultPath: null });

      await act(async () => {
        await result.current.handleDelete("a.md");
      });

      expect(called).toBe(false);
    });

    it("logs but does not throw on error", async () => {
      mockTauriCommand("delete_note", () => {
        throw new Error("perm");
      });
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { result } = setup();

      await act(async () => {
        await result.current.handleDelete("a.md");
      });

      expect(errSpy).toHaveBeenCalled();
      errSpy.mockRestore();
    });
  });

  describe("handleMoveFile", () => {
    it("moves file to new directory preserving filename", async () => {
      let received: unknown = null;
      mockTauriCommand("rename_note", (args) => {
        received = args;
      });
      const { result, refreshFileTree } = setup();

      await act(async () => {
        await result.current.handleMoveFile("notes/draft.md", "archive");
      });

      expect(received).toEqual({
        vaultPath: VAULT,
        oldPath: "notes/draft.md",
        newPath: "archive/draft.md",
      });
      expect(refreshFileTree).toHaveBeenCalled();
    });

    it("moves to root when targetDir is empty", async () => {
      let received: unknown = null;
      mockTauriCommand("rename_note", (args) => {
        received = args;
      });
      const { result } = setup();

      await act(async () => {
        await result.current.handleMoveFile("a/b/c.md", "");
      });

      expect((received as { newPath: string }).newPath).toBe("c.md");
    });

    it("noop when source already in targetDir (no path change)", async () => {
      let called = false;
      mockTauriCommand("rename_note", () => {
        called = true;
      });
      const { result, refreshFileTree } = setup();

      await act(async () => {
        // Source "x.md" at root, moving to root → newPath "x.md" === sourcePath
        await result.current.handleMoveFile("x.md", "");
      });

      expect(called).toBe(false);
      expect(refreshFileTree).not.toHaveBeenCalled();
    });

    it("logs but does not throw on error", async () => {
      mockTauriCommand("rename_note", () => {
        throw new Error("locked");
      });
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { result } = setup();

      await act(async () => {
        await result.current.handleMoveFile("a.md", "dest");
      });

      expect(errSpy).toHaveBeenCalled();
      errSpy.mockRestore();
    });
  });
});
