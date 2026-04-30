import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";

import { RunDiffPanel } from "@/components/blocks/run-diff/RunDiffPanel";
import type { RunDiff } from "@/lib/blocks/run-diff";
import { renderWithProviders, screen } from "@/test/render";

function diff(over: Partial<RunDiff> = {}): RunDiff {
  return {
    status: { before: 200, after: 200, changed: false },
    headers: [],
    body: [],
    timing: { before: 100, after: 150, deltaMs: 50 },
    bodyTruncated: false,
    ...over,
  };
}

describe("RunDiffPanel", () => {
  it("renders 4 tabs and starts on Body by default", () => {
    renderWithProviders(<RunDiffPanel diff={diff()} />);
    expect(screen.getByTestId("run-diff-tab-body")).toBeInTheDocument();
    expect(screen.getByTestId("run-diff-tab-headers")).toBeInTheDocument();
    expect(screen.getByTestId("run-diff-tab-status")).toBeInTheDocument();
    expect(screen.getByTestId("run-diff-tab-timing")).toBeInTheDocument();
    expect(screen.getByTestId("run-diff-panel").getAttribute("data-tab")).toBe(
      "body",
    );
  });

  it("starts on Status when bodyTruncated is true", () => {
    renderWithProviders(<RunDiffPanel diff={diff({ bodyTruncated: true })} />);
    expect(screen.getByTestId("run-diff-panel").getAttribute("data-tab")).toBe(
      "status",
    );
  });

  it("respects initialTab prop", () => {
    renderWithProviders(<RunDiffPanel diff={diff()} initialTab="timing" />);
    expect(screen.getByTestId("run-diff-panel").getAttribute("data-tab")).toBe(
      "timing",
    );
  });

  it("switches tabs on click", async () => {
    renderWithProviders(<RunDiffPanel diff={diff()} />);
    await userEvent.setup().click(screen.getByTestId("run-diff-tab-headers"));
    expect(screen.getByTestId("run-diff-panel").getAttribute("data-tab")).toBe(
      "headers",
    );
  });

  it("renders 'Bodies match' when body diff is empty", () => {
    renderWithProviders(<RunDiffPanel diff={diff()} />);
    expect(screen.getByTestId("run-diff-body-equal")).toBeInTheDocument();
  });

  it("renders truncation hint when bodyTruncated is true and body tab is selected", () => {
    renderWithProviders(
      <RunDiffPanel diff={diff({ bodyTruncated: true })} initialTab="body" />,
    );
    expect(screen.getByTestId("run-diff-body-truncated")).toBeInTheDocument();
  });

  it("renders one body row per JSON diff entry with op-coded glyph", () => {
    renderWithProviders(
      <RunDiffPanel
        diff={diff({
          body: [
            { path: "user.name", op: "change", before: "alice", after: "bob" },
            { path: "user.id", op: "add", after: 7 },
            { path: "user.old", op: "remove", before: 9 },
          ],
        })}
      />,
    );
    expect(
      screen.getByTestId("run-diff-body-row-user.name").getAttribute("data-op"),
    ).toBe("change");
    expect(
      screen.getByTestId("run-diff-body-row-user.id").getAttribute("data-op"),
    ).toBe("add");
    expect(
      screen.getByTestId("run-diff-body-row-user.old").getAttribute("data-op"),
    ).toBe("remove");
  });

  it("body row shows quoted string for string before/after values", () => {
    renderWithProviders(
      <RunDiffPanel
        diff={diff({
          body: [{ path: "x", op: "change", before: "a", after: "b" }],
        })}
      />,
    );
    expect(screen.getByTestId("run-diff-body-row-x-before").textContent).toBe(
      '"a"',
    );
    expect(screen.getByTestId("run-diff-body-row-x-after").textContent).toBe(
      '"b"',
    );
  });

  it("renders headers tab with one row per entry", async () => {
    renderWithProviders(
      <RunDiffPanel
        diff={diff({
          headers: [
            { key: "x-trace", op: "change", before: "a", after: "b" },
            { key: "content-type", op: "equal", before: "json", after: "json" },
          ],
        })}
        initialTab="headers"
      />,
    );
    expect(
      screen
        .getByTestId("run-diff-headers-row-x-trace")
        .getAttribute("data-op"),
    ).toBe("change");
    expect(
      screen
        .getByTestId("run-diff-headers-row-content-type")
        .getAttribute("data-op"),
    ).toBe("equal");
  });

  it("renders headers empty hint when no entries", () => {
    renderWithProviders(<RunDiffPanel diff={diff()} initialTab="headers" />);
    expect(screen.getByTestId("run-diff-headers-empty")).toBeInTheDocument();
  });

  it("renders status tab with before/after numbers", () => {
    renderWithProviders(
      <RunDiffPanel
        diff={diff({ status: { before: 200, after: 500, changed: true } })}
        initialTab="status"
      />,
    );
    const status = screen.getByTestId("run-diff-status");
    expect(status.getAttribute("data-changed")).toBe("true");
    expect(status.textContent).toMatch(/200/);
    expect(status.textContent).toMatch(/500/);
  });

  it("renders timing delta with sign", () => {
    renderWithProviders(<RunDiffPanel diff={diff()} initialTab="timing" />);
    expect(screen.getByTestId("run-diff-timing-delta").textContent).toMatch(
      /\+50ms/,
    );
  });

  it("hides timing delta when one side is undefined", () => {
    renderWithProviders(
      <RunDiffPanel
        diff={diff({
          timing: { before: undefined, after: 100, deltaMs: undefined },
        })}
        initialTab="timing"
      />,
    );
    expect(
      screen.queryByTestId("run-diff-timing-delta"),
    ).not.toBeInTheDocument();
  });

  it("body tab count badge ignores zero", () => {
    renderWithProviders(<RunDiffPanel diff={diff()} />);
    expect(screen.getByTestId("run-diff-tab-body").textContent).not.toMatch(
      /\(\d/,
    );
  });

  it("body tab count badge shows count > 0", () => {
    renderWithProviders(
      <RunDiffPanel
        diff={diff({
          body: [
            { path: "a", op: "change", before: 1, after: 2 },
            { path: "b", op: "add", after: 3 },
          ],
        })}
      />,
    );
    expect(screen.getByTestId("run-diff-tab-body").textContent).toMatch(
      /\(2\)/,
    );
  });
});
