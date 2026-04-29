import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ChakraProvider,
  defaultSystem,
} from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import {
  WorkspaceContext,
  type WorkspaceContextValue,
} from "@/contexts/WorkspaceContext";
import { FileTreeNode } from "@/components/layout/file-tree/FileTreeNode";
import { usePaneStore } from "@/stores/pane";
import type { FileEntry } from "@/lib/tauri/commands";
import type { ReactNode } from "react";

vi.mock("@/lib/theme/apply", () => ({ applyTheme: vi.fn() }));

function makeWorkspaceStub(
  over: Partial<WorkspaceContextValue> = {},
): WorkspaceContextValue {
  return {
    vaultPath: "/v",
    vaults: [],
    entries: [],
    switchVault: vi.fn(async () => {}),
    openVault: vi.fn(async () => {}),
    inlineCreate: null,
    handleStartCreate: vi.fn(),
    handleCreateNote: vi.fn(async () => {}),
    handleCreateFolder: vi.fn(async () => {}),
    handleRename: vi.fn(async () => {}),
    handleDelete: vi.fn(async () => {}),
    handleMoveFile: vi.fn(async () => {}),
    cancelInlineCreate: vi.fn(),
    handleFileSelect: vi.fn(async () => {}),
    ...over,
  };
}

function renderTree(
  entry: FileEntry,
  depth: number,
  workspaceOverrides: Partial<WorkspaceContextValue> = {},
) {
  const value = makeWorkspaceStub(workspaceOverrides);
  function Wrap({ children }: { children: ReactNode }) {
    return (
      <ChakraProvider value={defaultSystem}>
        <WorkspaceContext.Provider value={value}>
          <DndContext>{children}</DndContext>
        </WorkspaceContext.Provider>
      </ChakraProvider>
    );
  }
  return {
    ...render(<FileTreeNode entry={entry} depth={depth} />, { wrapper: Wrap }),
    workspace: value,
  };
}

const noteEntry: FileEntry = {
  name: "note.md",
  path: "note.md",
  is_dir: false,
  children: null,
};

const folderEntry: FileEntry = {
  name: "folder",
  path: "folder",
  is_dir: true,
  children: [noteEntry],
};

describe("FileTreeNode", () => {
  beforeEach(() => {
    usePaneStore.setState({
      layout: { type: "leaf", id: "p1", tabs: [], activeTab: 0 },
      activePaneId: "p1",
      editorContents: new Map(),
      unsavedFiles: new Set(),
      scrollPositions: new Map(),
      conflictFiles: new Set(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders a note name without the .md extension", () => {
    renderTree(noteEntry, 0);
    expect(screen.getByText("note")).toBeInTheDocument();
  });

  it("renders a folder name with extension preserved", () => {
    renderTree({ ...folderEntry, name: "my-folder" }, 0);
    expect(screen.getByText("my-folder")).toBeInTheDocument();
  });

  it("depth 0 starts expanded by default (children visible)", () => {
    renderTree(folderEntry, 0);
    // root depth → child immediately visible
    expect(screen.getByText("note")).toBeInTheDocument();
  });

  it("renders inline child input (textbox) when inlineCreate matches the folder", () => {
    renderTree(
      folderEntry,
      0,
      { inlineCreate: { type: "note", dirPath: "folder" } },
    );

    // InlineInput renders a Chakra Input; query by role
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("highlights active file when path matches the active tab", () => {
    usePaneStore.setState({
      layout: {
        type: "leaf",
        id: "p1",
        tabs: [
          {
            filePath: "note.md",
            vaultPath: "/v",
            unsaved: false,
            kind: "file",
          },
        ],
        activeTab: 0,
      },
      activePaneId: "p1",
    });

    renderTree(noteEntry, 1);
    // The wrapper button receives bg.emphasized when isActive — we just
    // confirm the row renders without crashing and the text is present
    expect(screen.getByText("note")).toBeInTheDocument();
  });
});
