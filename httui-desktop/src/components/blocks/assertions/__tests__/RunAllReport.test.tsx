import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { RunAllReport } from "@/components/blocks/assertions/RunAllReport";
import type { RunAllAssertionSummary } from "@/lib/blocks/assertions-aggregate";
import { renderWithProviders, screen } from "@/test/render";

function summary(
  over: Partial<RunAllAssertionSummary> = {},
): RunAllAssertionSummary {
  return {
    blocks: 7,
    assertions: 23,
    passed: 22,
    failed: 1,
    failedBlocks: ["b"],
    allPass: false,
    ...over,
  };
}

describe("RunAllReport", () => {
  it("renders the empty path with sing/plural agreement", () => {
    renderWithProviders(
      <RunAllReport
        summary={summary({
          blocks: 1,
          assertions: 0,
          passed: 0,
          failed: 0,
          failedBlocks: [],
          allPass: true,
        })}
      />,
    );
    const empty = screen.getByTestId("run-all-report");
    expect(empty.getAttribute("data-empty")).toBe("true");
    expect(empty.textContent).toMatch(/1 block ran/);
  });

  it("renders the spec'd '7 blocks, 23 assertions, 22 passed, 1 failed' summary", () => {
    renderWithProviders(<RunAllReport summary={summary()} />);
    expect(screen.getByTestId("run-all-report-summary").textContent).toMatch(
      /7 blocks, 23 assertions, 22 passed, 1 failed/,
    );
  });

  it("encodes pass / fail via data attributes", () => {
    const { rerender } = renderWithProviders(
      <RunAllReport summary={summary()} />,
    );
    expect(screen.getByTestId("run-all-report").getAttribute("data-fail")).toBe(
      "true",
    );
    rerender(
      <RunAllReport
        summary={summary({ failed: 0, failedBlocks: [], allPass: true })}
      />,
    );
    expect(screen.getByTestId("run-all-report").getAttribute("data-pass")).toBe(
      "true",
    );
  });

  it("lists each failedBlocks alias as a row", () => {
    renderWithProviders(
      <RunAllReport
        summary={summary({ failedBlocks: ["b1", "b2"], failed: 3 })}
      />,
    );
    expect(
      screen.getByTestId("run-all-report-failed-block-b1"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("run-all-report-failed-block-b2"),
    ).toBeInTheDocument();
  });

  it("failed-block rows are non-interactive divs without onJumpToBlock", () => {
    renderWithProviders(
      <RunAllReport summary={summary({ failedBlocks: ["b"] })} />,
    );
    expect(screen.getByTestId("run-all-report-failed-block-b").tagName).toBe(
      "DIV",
    );
  });

  it("failed-block rows become buttons and fire onJumpToBlock(alias)", async () => {
    const onJump = vi.fn();
    renderWithProviders(
      <RunAllReport
        summary={summary({ failedBlocks: ["a", "b"] })}
        onJumpToBlock={onJump}
      />,
    );
    const a = screen.getByTestId("run-all-report-failed-block-a");
    expect(a.tagName).toBe("BUTTON");
    await userEvent.setup().click(a);
    expect(onJump).toHaveBeenCalledWith("a");
  });

  it("uses singular 'block' / 'assertion' wording when counts are 1", () => {
    renderWithProviders(
      <RunAllReport
        summary={summary({
          blocks: 1,
          assertions: 1,
          passed: 1,
          failed: 0,
          failedBlocks: [],
          allPass: true,
        })}
      />,
    );
    expect(screen.getByTestId("run-all-report-summary").textContent).toMatch(
      /1 block, 1 assertion, 1 passed/,
    );
  });
});
