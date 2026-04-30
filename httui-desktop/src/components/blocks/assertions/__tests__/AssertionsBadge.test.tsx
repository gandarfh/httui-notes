import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { AssertionsBadge } from "@/components/blocks/assertions/AssertionsBadge";
import type { AssertionResult } from "@/lib/blocks/assertions";
import { renderWithProviders, screen } from "@/test/render";

describe("AssertionsBadge", () => {
  it("renders nothing when total is 0", () => {
    renderWithProviders(<AssertionsBadge total={0} result={null} />);
    expect(screen.queryByTestId("assertions-badge")).not.toBeInTheDocument();
  });

  it("renders 0/N with pending state when result is null", () => {
    renderWithProviders(<AssertionsBadge total={3} result={null} />);
    const badge = screen.getByTestId("assertions-badge");
    expect(badge.textContent).toMatch(/0\/3/);
    expect(badge.getAttribute("data-pending")).toBe("true");
    expect(badge.getAttribute("data-pass")).toBeNull();
    expect(badge.getAttribute("data-fail")).toBeNull();
  });

  it("renders N/N with pass state when every assertion passed", () => {
    const result: AssertionResult = { pass: true, failures: [] };
    renderWithProviders(<AssertionsBadge total={3} result={result} />);
    const badge = screen.getByTestId("assertions-badge");
    expect(badge.textContent).toMatch(/3\/3/);
    expect(badge.getAttribute("data-pass")).toBe("true");
    expect(badge.getAttribute("data-fail")).toBeNull();
    expect(badge.getAttribute("title")).toMatch(/all assertions passed/);
  });

  it("renders (N-K)/N with fail state when some assertions failed", () => {
    const result: AssertionResult = {
      pass: false,
      failures: [
        { line: 2, raw: "x", actual: 1, expected: 2, reason: "" },
        { line: 3, raw: "y", actual: 1, expected: 2, reason: "" },
      ],
    };
    renderWithProviders(<AssertionsBadge total={5} result={result} />);
    const badge = screen.getByTestId("assertions-badge");
    expect(badge.textContent).toMatch(/3\/5/);
    expect(badge.getAttribute("data-fail")).toBe("true");
    expect(badge.getAttribute("data-pass")).toBeNull();
    expect(badge.getAttribute("title")).toMatch(/2 assertions failed/);
  });

  it("uses singular 'assertion failed' wording when one failure", () => {
    const result: AssertionResult = {
      pass: false,
      failures: [{ line: 2, raw: "x", actual: 1, expected: 2, reason: "" }],
    };
    renderWithProviders(<AssertionsBadge total={3} result={result} />);
    expect(
      screen.getByTestId("assertions-badge").getAttribute("title"),
    ).toMatch(/1 assertion failed/);
  });

  it("is a non-interactive span when onClick is omitted", () => {
    renderWithProviders(<AssertionsBadge total={1} result={null} />);
    expect(screen.getByTestId("assertions-badge").tagName).toBe("SPAN");
  });

  it("becomes a button and fires onClick when handler is supplied", async () => {
    const onClick = vi.fn();
    renderWithProviders(
      <AssertionsBadge total={1} result={null} onClick={onClick} />,
    );
    const badge = screen.getByTestId("assertions-badge");
    expect(badge.tagName).toBe("BUTTON");
    await userEvent.setup().click(badge);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
