import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DocHeaderedEditor } from "@/components/layout/pane/DocHeaderedEditor";
import { clearTauriMocks, mockTauriCommand } from "@/test/mocks/tauri";
import { renderWithProviders, screen } from "@/test/render";

vi.mock("@/components/editor/MarkdownEditor", () => ({
  MarkdownEditor: ({
    filePath,
    content,
  }: {
    filePath: string;
    content: string;
  }) => (
    <div data-testid="markdown-editor" data-file={filePath} data-len={content.length} />
  ),
}));

vi.mock("../../docheader/DocHeaderShell", () => ({
  DocHeaderShell: ({
    filePath,
    compact,
    onToggleCompact,
  }: {
    filePath: string;
    compact?: boolean;
    onToggleCompact?: () => void;
  }) => (
    <button
      data-testid="docheader-stub"
      data-file={filePath}
      data-compact={String(Boolean(compact))}
      onClick={() => onToggleCompact?.()}
    >
      docheader
    </button>
  ),
}));

vi.mock("../../ConflictBanner", () => ({
  ConflictBanner: ({ filePath }: { filePath: string }) => (
    <div data-testid="conflict-banner" data-file={filePath} />
  ),
}));

beforeEach(() => {
  clearTauriMocks();
});

afterEach(() => {
  clearTauriMocks();
});

describe("DocHeaderedEditor", () => {
  const baseProps = {
    filePath: "notes/foo.md",
    vaultPath: "/v",
    content: "# hi\n",
    vimEnabled: false,
    showConflict: false,
    onConflictReload: vi.fn(),
    onConflictKeep: vi.fn(),
    onChange: vi.fn(),
    onNavigateFile: undefined,
  };

  it("mounts the DocHeader card above the editor with filePath threaded", () => {
    mockTauriCommand("get_file_settings", () => ({ auto_capture: false }));
    renderWithProviders(<DocHeaderedEditor {...baseProps} />);

    const header = screen.getByTestId("docheader-stub");
    const editor = screen.getByTestId("markdown-editor");
    expect(header).toBeInTheDocument();
    expect(editor).toBeInTheDocument();
    expect(header.dataset.file).toBe("notes/foo.md");
    expect(editor.dataset.file).toBe("notes/foo.md");
    // Header renders above the editor in document order so the layout
    // visually places it on top.
    expect(
      (header.compareDocumentPosition(editor) &
        Node.DOCUMENT_POSITION_FOLLOWING) >
        0,
    ).toBe(true);
  });

  it("hides the conflict banner unless showConflict is true", () => {
    mockTauriCommand("get_file_settings", () => ({ auto_capture: false }));
    const { rerender } = renderWithProviders(
      <DocHeaderedEditor {...baseProps} />,
    );
    expect(screen.queryByTestId("conflict-banner")).not.toBeInTheDocument();

    rerender(<DocHeaderedEditor {...baseProps} showConflict />);
    expect(screen.getByTestId("conflict-banner")).toBeInTheDocument();
  });

  it("threads compact=false initially when the file has no override", async () => {
    mockTauriCommand("get_file_settings", () => ({ auto_capture: false }));
    renderWithProviders(<DocHeaderedEditor {...baseProps} />);
    const header = await screen.findByTestId("docheader-stub");
    expect(header.dataset.compact).toBe("false");
  });

  it("reflects compact=true when workspace.toml has the flag set", async () => {
    mockTauriCommand("get_file_settings", () => ({
      auto_capture: false,
      docheader_compact: true,
    }));
    renderWithProviders(<DocHeaderedEditor {...baseProps} />);
    // Wait for the hook's initial fetch settle by polling the prop.
    await vi.waitFor(() => {
      const header = screen.getByTestId("docheader-stub");
      expect(header.dataset.compact).toBe("true");
    });
  });

  it("flips compact + persists when the user clicks the title", async () => {
    let nextSettings: { auto_capture: boolean; docheader_compact?: boolean } = {
      auto_capture: false,
      docheader_compact: false,
    };
    mockTauriCommand("get_file_settings", () => nextSettings);
    const setCalls: Array<{ compact: boolean }> = [];
    mockTauriCommand("set_file_docheader_compact", (args) => {
      const a = args as { compact: boolean };
      setCalls.push(a);
      nextSettings = {
        auto_capture: false,
        docheader_compact: Boolean(a.compact),
      };
      return null;
    });

    renderWithProviders(<DocHeaderedEditor {...baseProps} />);
    const header = await screen.findByTestId("docheader-stub");
    header.click();

    await vi.waitFor(() => {
      expect(setCalls).toHaveLength(1);
      expect(setCalls[0]?.compact).toBe(true);
    });
  });

  it("renders the editor with the same filePath + content length", () => {
    mockTauriCommand("get_file_settings", () => ({ auto_capture: false }));
    renderWithProviders(
      <DocHeaderedEditor {...baseProps} content={"abcd"} />,
    );
    const editor = screen.getByTestId("markdown-editor");
    expect(editor.dataset.file).toBe("notes/foo.md");
    expect(editor.dataset.len).toBe("4");
  });
});
