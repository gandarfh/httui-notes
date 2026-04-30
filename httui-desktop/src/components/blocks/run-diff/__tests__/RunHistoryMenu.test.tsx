import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { RunHistoryMenu } from "@/components/blocks/run-diff/RunHistoryMenu";
import type { HistoryEntry } from "@/lib/tauri/commands";
import { renderWithProviders, screen } from "@/test/render";

function entry(over: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: 1,
    file_path: "a.md",
    block_alias: "x",
    method: "GET",
    url_canonical: "https://api/users",
    status: 200,
    request_size: null,
    response_size: 100,
    elapsed_ms: 50,
    outcome: "success",
    ran_at: new Date(Date.now() - 30_000).toISOString(),
    ...over,
  };
}

describe("RunHistoryMenu", () => {
  it("renders empty hint when entries is empty", () => {
    renderWithProviders(<RunHistoryMenu entries={[]} />);
    expect(screen.getByTestId("run-history-menu-empty")).toBeInTheDocument();
  });

  it("renders one row per entry with method + status + url", () => {
    renderWithProviders(
      <RunHistoryMenu
        entries={[
          entry({ id: 1 }),
          entry({ id: 2, status: 500, outcome: "error" }),
        ]}
      />,
    );
    expect(
      screen.getByTestId("run-history-menu").getAttribute("data-count"),
    ).toBe("2");
    expect(screen.getByTestId("run-history-row-1")).toBeInTheDocument();
    expect(
      screen.getByTestId("run-history-row-2").getAttribute("data-outcome"),
    ).toBe("error");
  });

  it("hides Diff-with-current button on the live row", () => {
    renderWithProviders(
      <RunHistoryMenu
        entries={[entry({ id: 1 })]}
        liveRunId={1}
        onDiffWithCurrent={() => {}}
      />,
    );
    expect(
      screen.queryByTestId("run-history-row-1-diff-current"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("run-history-row-1").getAttribute("data-live"),
    ).toBe("true");
  });

  it("fires onView when View clicked", async () => {
    const onView = vi.fn();
    renderWithProviders(
      <RunHistoryMenu entries={[entry({ id: 1 })]} onView={onView} />,
    );
    await userEvent.setup().click(screen.getByTestId("run-history-row-1-view"));
    expect(onView).toHaveBeenCalledTimes(1);
    expect(onView.mock.calls[0][0].id).toBe(1);
  });

  it("fires onDiffWithCurrent when Diff clicked on a non-live row", async () => {
    const onDiff = vi.fn();
    renderWithProviders(
      <RunHistoryMenu
        entries={[entry({ id: 1 }), entry({ id: 2 })]}
        liveRunId={1}
        onDiffWithCurrent={onDiff}
      />,
    );
    await userEvent
      .setup()
      .click(screen.getByTestId("run-history-row-2-diff-current"));
    expect(onDiff).toHaveBeenCalledTimes(1);
    expect(onDiff.mock.calls[0][0].id).toBe(2);
  });

  it("fires onDiffWithPick when Diff… clicked", async () => {
    const onPick = vi.fn();
    renderWithProviders(
      <RunHistoryMenu entries={[entry({ id: 7 })]} onDiffWithPick={onPick} />,
    );
    await userEvent
      .setup()
      .click(screen.getByTestId("run-history-row-7-diff-pick"));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0].id).toBe(7);
  });

  it("hides action buttons that don't have a handler", () => {
    renderWithProviders(<RunHistoryMenu entries={[entry({ id: 1 })]} />);
    expect(
      screen.queryByTestId("run-history-row-1-view"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("run-history-row-1-diff-current"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("run-history-row-1-diff-pick"),
    ).not.toBeInTheDocument();
  });

  it("renders status as em-dash when null", () => {
    renderWithProviders(
      <RunHistoryMenu entries={[entry({ id: 1, status: null })]} />,
    );
    expect(screen.getByTestId("run-history-row-1").textContent).toMatch(/—/);
  });

  it("renders ISO date as a relative '<N>s ago' label", () => {
    const tenSecAgo = new Date(Date.now() - 10_000).toISOString();
    renderWithProviders(
      <RunHistoryMenu entries={[entry({ id: 1, ran_at: tenSecAgo })]} />,
    );
    expect(screen.getByTestId("run-history-row-1").textContent).toMatch(
      /\ds ago/,
    );
  });
});
