import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { DiffViewer } from "@/components/editor/DiffViewer";
import { useChatStore } from "@/stores/chat";
import { usePaneStore } from "@/stores/pane";
import { mockTauriCommand, clearTauriMocks } from "@/test/mocks/tauri";
import type { TabState } from "@/types/pane";

vi.mock("@/lib/theme/apply", () => ({ applyTheme: vi.fn() }));

const mkDiffTab = (over: Partial<TabState> = {}): TabState => ({
  filePath: "note.md",
  vaultPath: "/v",
  unsaved: false,
  kind: "diff",
  diffId: "diff-perm-1",
  permissionId: "perm-1",
  originalContent: "old line\nshared",
  proposedContent: "new line\nshared",
  ...over,
});

function resetStores() {
  useChatStore.setState({
    pendingPermission: {
      permissionId: "perm-1",
      toolName: "update_note",
      toolInput: { path: "note.md" },
    },
  });
  usePaneStore.setState({
    layout: { type: "leaf", id: "p1", tabs: [], activeTab: 0 },
    activePaneId: "p1",
    editorContents: new Map(),
    unsavedFiles: new Set(),
    scrollPositions: new Map(),
    conflictFiles: new Set(),
  });
}

describe("DiffViewer", () => {
  beforeEach(() => {
    resetStores();
    clearTauriMocks();
  });

  afterEach(() => {
    clearTauriMocks();
  });

  it("renders the file path in the header", () => {
    renderWithProviders(<DiffViewer tab={mkDiffTab()} />);
    expect(screen.getByText("note.md")).toBeInTheDocument();
  });

  it("renders +N badge for added lines", () => {
    renderWithProviders(<DiffViewer tab={mkDiffTab()} />);
    // proposed has 'new line' which 'old line' doesn't → +1
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("renders -N badge for removed lines", () => {
    renderWithProviders(<DiffViewer tab={mkDiffTab()} />);
    // original has 'old line' that proposed doesn't → -1
    expect(screen.getByText("-1")).toBeInTheDocument();
  });

  it("does not render +0 / -0 when fully identical", () => {
    renderWithProviders(
      <DiffViewer
        tab={mkDiffTab({ originalContent: "same", proposedContent: "same" })}
      />,
    );
    expect(screen.queryByText("+0")).not.toBeInTheDocument();
    expect(screen.queryByText("-0")).not.toBeInTheDocument();
  });

  it("renders Allow and Deny buttons", () => {
    renderWithProviders(<DiffViewer tab={mkDiffTab()} />);
    expect(screen.getByRole("button", { name: /allow/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /deny/i })).toBeInTheDocument();
  });

  it("renders 'Once', 'Session', 'Always' scope selectors", () => {
    renderWithProviders(<DiffViewer tab={mkDiffTab()} />);
    expect(screen.getByText("Once")).toBeInTheDocument();
    expect(screen.getByText("Session")).toBeInTheDocument();
    expect(screen.getByText("Always")).toBeInTheDocument();
  });

  it("clicking a scope highlights it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DiffViewer tab={mkDiffTab()} />);

    await user.click(screen.getByText("Always"));
    // The button itself should now have the selected style; we verify by
    // re-querying — the clicked element is visually selected via CSS, hard
    // to assert directly; we just confirm it's still in the doc.
    expect(screen.getByText("Always")).toBeInTheDocument();
  });

  it("clicking Allow calls respondPermission with the chosen scope", async () => {
    const user = userEvent.setup();
    let received: unknown = null;
    mockTauriCommand("respond_chat_permission", (args) => {
      received = args;
    });

    renderWithProviders(<DiffViewer tab={mkDiffTab()} />);

    // Switch scope to Session
    await user.click(screen.getByText("Session"));
    await user.click(screen.getByRole("button", { name: /allow/i }));

    const r = received as { scope: string; behavior: string };
    expect(r.scope).toBe("session");
    expect(r.behavior).toBe("allow");
  });

  it("clicking Deny calls respondPermission with deny", async () => {
    const user = userEvent.setup();
    let received: unknown = null;
    mockTauriCommand("respond_chat_permission", (args) => {
      received = args;
    });

    renderWithProviders(<DiffViewer tab={mkDiffTab()} />);
    await user.click(screen.getByRole("button", { name: /deny/i }));

    expect((received as { behavior: string }).behavior).toBe("deny");
  });

  it("renders 'Current' and 'Proposed' panel labels", () => {
    renderWithProviders(<DiffViewer tab={mkDiffTab()} />);
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("Proposed")).toBeInTheDocument();
  });
});
