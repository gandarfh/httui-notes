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
    frontmatter,
  }: {
    filePath: string;
    compact?: boolean;
    onToggleCompact?: () => void;
    frontmatter?: { title?: string; abstract?: string; tags?: readonly string[] } | null;
  }) => (
    <button
      data-testid="docheader-stub"
      data-file={filePath}
      data-compact={String(Boolean(compact))}
      data-fm-null={String(frontmatter === null)}
      data-fm-title={frontmatter?.title ?? ""}
      data-fm-abstract={frontmatter?.abstract ?? ""}
      data-fm-tags={(frontmatter?.tags ?? []).join(",")}
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

  it("threads frontmatter=null when content has no fence", () => {
    mockTauriCommand("get_file_settings", () => ({ auto_capture: false }));
    renderWithProviders(
      <DocHeaderedEditor {...baseProps} content={"# heading only\n"} />,
    );
    const header = screen.getByTestId("docheader-stub");
    expect(header.dataset.fmNull).toBe("true");
    expect(header.dataset.fmTitle).toBe("");
    expect(header.dataset.fmTags).toBe("");
  });

  it("parses frontmatter title + abstract + tags from the document", () => {
    mockTauriCommand("get_file_settings", () => ({ auto_capture: false }));
    const doc = [
      "---",
      'title: "Payments — debug capture failures"',
      'abstract: "Capture flow when X"',
      "tags: [payments, debug]",
      "---",
      "body",
      "",
    ].join("\n");
    renderWithProviders(
      <DocHeaderedEditor {...baseProps} content={doc} />,
    );
    const header = screen.getByTestId("docheader-stub");
    expect(header.dataset.fmNull).toBe("false");
    expect(header.dataset.fmTitle).toBe("Payments — debug capture failures");
    expect(header.dataset.fmAbstract).toBe("Capture flow when X");
    expect(header.dataset.fmTags).toBe("payments,debug");
  });

  it("frontmatter survives subsequent body edits (parser memoized on content)", async () => {
    mockTauriCommand("get_file_settings", () => ({ auto_capture: false }));
    const initial = "---\ntitle: Stable\n---\nbody\n";
    const { rerender } = renderWithProviders(
      <DocHeaderedEditor {...baseProps} content={initial} />,
    );
    expect(screen.getByTestId("docheader-stub").dataset.fmTitle).toBe(
      "Stable",
    );

    // Edit body only — title stays.
    rerender(
      <DocHeaderedEditor
        {...baseProps}
        content={"---\ntitle: Stable\n---\nbody edited\n"}
      />,
    );
    expect(screen.getByTestId("docheader-stub").dataset.fmTitle).toBe(
      "Stable",
    );

    // Edit title — reflects.
    rerender(
      <DocHeaderedEditor
        {...baseProps}
        content={"---\ntitle: Renamed\n---\nbody edited\n"}
      />,
    );
    expect(screen.getByTestId("docheader-stub").dataset.fmTitle).toBe(
      "Renamed",
    );
  });
});
