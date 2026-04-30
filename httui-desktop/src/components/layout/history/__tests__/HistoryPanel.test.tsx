import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { HistoryPanel } from "@/components/layout/history/HistoryPanel";
import { usePaneStore } from "@/stores/pane";
import { clearTauriMocks, mockTauriCommand } from "@/test/mocks/tauri";
import { renderWithProviders, screen } from "@/test/render";

beforeEach(() => {
  clearTauriMocks();
  usePaneStore.setState({
    activePaneId: "p1",
    layout: {
      type: "leaf",
      id: "p1",
      tabs: [],
      activeTab: 0,
    } as never,
    editorContents: new Map(),
    unsavedFiles: new Set<string>(),
  } as never);
});

afterEach(() => {
  clearTauriMocks();
});

function setActiveFile(filePath: string) {
  usePaneStore.setState({
    activePaneId: "p1",
    layout: {
      type: "leaf",
      id: "p1",
      tabs: [
        {
          kind: "file",
          filePath,
          vaultPath: "/v",
          unsaved: false,
        } as never,
      ],
      activeTab: 0,
    } as never,
    editorContents: new Map(),
    unsavedFiles: new Set<string>(),
  } as never);
}

const fixtureRows = [
  {
    id: 1,
    file_path: "rb.md",
    block_alias: "fetchUser",
    method: "GET",
    url_canonical: "https://api.example.com/users/1",
    status: 200,
    request_size: null,
    response_size: 12,
    elapsed_ms: 120,
    outcome: "ok",
    ran_at: new Date().toISOString(),
  },
];

describe("HistoryPanel", () => {
  it("renders the empty state when the active file has no runs", async () => {
    setActiveFile("plain.md");
    mockTauriCommand("list_block_history_for_file", () => []);
    renderWithProviders(<HistoryPanel width={300} onClose={() => {}} />);
    await vi.waitFor(() => {
      expect(screen.getByTestId("history-empty")).toBeInTheDocument();
    });
  });

  it("renders rows when the cmd returns history entries", async () => {
    setActiveFile("rb.md");
    mockTauriCommand("list_block_history_for_file", () => fixtureRows);
    renderWithProviders(<HistoryPanel width={300} onClose={() => {}} />);
    await vi.waitFor(() => {
      expect(screen.getAllByTestId("history-row")).toHaveLength(1);
    });
  });

  it("forwards the active filePath + DEFAULT_LIMIT in the cmd args", async () => {
    setActiveFile("important.md");
    let captured: unknown;
    mockTauriCommand("list_block_history_for_file", (args) => {
      captured = args;
      return [];
    });
    renderWithProviders(<HistoryPanel width={300} onClose={() => {}} />);
    await vi.waitFor(() => {
      expect(captured).toEqual({ filePath: "important.md", limit: 50 });
    });
  });

  it("surfaces errors via the error region", async () => {
    setActiveFile("rb.md");
    mockTauriCommand("list_block_history_for_file", () => {
      throw new Error("db unreachable");
    });
    renderWithProviders(<HistoryPanel width={300} onClose={() => {}} />);
    await vi.waitFor(() => {
      expect(screen.getByTestId("history-panel-error").textContent).toBe(
        "db unreachable",
      );
    });
  });

  it("close button fires onClose", async () => {
    setActiveFile("rb.md");
    mockTauriCommand("list_block_history_for_file", () => []);
    const onClose = vi.fn();
    renderWithProviders(<HistoryPanel width={300} onClose={onClose} />);
    const close = await screen.findByLabelText("Close history panel");
    await userEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("refresh button re-fetches", async () => {
    setActiveFile("rb.md");
    let calls = 0;
    mockTauriCommand("list_block_history_for_file", () => {
      calls += 1;
      return [];
    });
    renderWithProviders(<HistoryPanel width={300} onClose={() => {}} />);
    await vi.waitFor(() => expect(calls).toBeGreaterThanOrEqual(1));
    const before = calls;
    await userEvent.click(await screen.findByLabelText("Refresh history"));
    await vi.waitFor(() => expect(calls).toBeGreaterThan(before));
  });

  it("idles with empty entries when no file is active", async () => {
    let invoked = false;
    mockTauriCommand("list_block_history_for_file", () => {
      invoked = true;
      return [];
    });
    renderWithProviders(<HistoryPanel width={300} onClose={() => {}} />);
    // No active file → no Tauri call.
    await new Promise((r) => setTimeout(r, 30));
    expect(invoked).toBe(false);
    expect(screen.getByTestId("history-empty")).toBeInTheDocument();
  });
});
