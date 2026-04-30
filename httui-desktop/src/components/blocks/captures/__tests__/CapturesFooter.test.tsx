import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { CapturesFooter } from "@/components/blocks/captures/CapturesFooter";
import type { CaptureEntry } from "@/stores/captureStore";
import { renderWithProviders, screen } from "@/test/render";

function captures(
  ...entries: Array<[string, CaptureEntry]>
): Record<string, CaptureEntry> {
  return Object.fromEntries(entries);
}

const e = (value: CaptureEntry["value"], isSecret = false): CaptureEntry => ({
  value,
  isSecret,
});

describe("CapturesFooter", () => {
  it("renders nothing when captures is empty", () => {
    renderWithProviders(<CapturesFooter captures={{}} />);
    expect(screen.queryByTestId("captures-footer")).not.toBeInTheDocument();
  });

  it("renders summary `N captured` and starts collapsed", () => {
    renderWithProviders(
      <CapturesFooter
        captures={captures(["token", e("abc")], ["user_id", e(99)])}
      />,
    );
    expect(
      screen.getByTestId("captures-footer-summary-label").textContent,
    ).toBe("2 captured");
    expect(
      screen.getByTestId("captures-footer").getAttribute("data-open"),
    ).toBeNull();
    expect(
      screen.queryByTestId("captures-footer-list"),
    ).not.toBeInTheDocument();
  });

  it("expands when the summary is clicked", async () => {
    renderWithProviders(<CapturesFooter captures={captures(["a", e("v")])} />);
    await userEvent
      .setup()
      .click(screen.getByTestId("captures-footer-summary"));
    expect(
      screen.getByTestId("captures-footer").getAttribute("data-open"),
    ).toBe("true");
    expect(screen.getByTestId("captures-footer-list")).toBeInTheDocument();
  });

  it("collapses again on a second click", async () => {
    renderWithProviders(
      <CapturesFooter captures={captures(["a", e("v")])} defaultOpen />,
    );
    expect(
      screen.getByTestId("captures-footer").getAttribute("data-open"),
    ).toBe("true");
    await userEvent
      .setup()
      .click(screen.getByTestId("captures-footer-summary"));
    expect(
      screen.getByTestId("captures-footer").getAttribute("data-open"),
    ).toBeNull();
  });

  it("respects defaultOpen=true", () => {
    renderWithProviders(
      <CapturesFooter captures={captures(["a", e("v")])} defaultOpen />,
    );
    expect(screen.getByTestId("captures-footer-list")).toBeInTheDocument();
  });

  it("renders one row per capture in iteration order", () => {
    renderWithProviders(
      <CapturesFooter
        captures={captures(
          ["token", e("abc")],
          ["user_id", e(99)],
          ["status", e(200)],
        )}
        defaultOpen
      />,
    );
    expect(screen.getByTestId("captures-footer-row-token")).toBeInTheDocument();
    expect(
      screen.getByTestId("captures-footer-row-user_id"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("captures-footer-row-status"),
    ).toBeInTheDocument();
  });

  it("masks secret values with bullets and shows the lock chip", () => {
    renderWithProviders(
      <CapturesFooter
        captures={captures(["api_token", e("real-secret-here", true)])}
        defaultOpen
      />,
    );
    const row = screen.getByTestId("captures-footer-row-api_token");
    expect(row.textContent).toMatch(/••••••••/);
    expect(row.textContent).not.toMatch(/real-secret-here/);
    expect(
      screen.getByTestId("captures-footer-row-api_token-secret-chip"),
    ).toBeInTheDocument();
    expect(row.getAttribute("data-secret")).toBe("true");
  });

  it("truncates long non-secret values to 80 chars + ellipsis", () => {
    const long = "x".repeat(120);
    renderWithProviders(
      <CapturesFooter captures={captures(["text", e(long)])} defaultOpen />,
    );
    const row = screen.getByTestId("captures-footer-row-text");
    expect(row.textContent).toMatch(new RegExp(`${"x".repeat(80)}…`));
  });

  it("renders empty string for null values", () => {
    renderWithProviders(
      <CapturesFooter captures={captures(["nothing", e(null)])} defaultOpen />,
    );
    const row = screen.getByTestId("captures-footer-row-nothing");
    // No exception, no garbage; row exists with empty value side
    expect(row).toBeInTheDocument();
  });

  it("rows are non-interactive divs when onCopy is omitted", () => {
    renderWithProviders(
      <CapturesFooter captures={captures(["a", e("v")])} defaultOpen />,
    );
    expect(screen.getByTestId("captures-footer-row-a").tagName).toBe("DIV");
  });

  it("rows become buttons and fire onCopy(key, value) when handler is supplied", async () => {
    const onCopy = vi.fn();
    renderWithProviders(
      <CapturesFooter
        captures={captures(["token", e("abc")])}
        defaultOpen
        onCopy={onCopy}
      />,
    );
    const row = screen.getByTestId("captures-footer-row-token");
    expect(row.tagName).toBe("BUTTON");
    await userEvent.setup().click(row);
    expect(onCopy).toHaveBeenCalledWith("token", "abc");
  });

  it("clipboard receives the full value even when the row is masked", async () => {
    const onCopy = vi.fn();
    renderWithProviders(
      <CapturesFooter
        captures={captures(["api_secret", e("real-value", true)])}
        defaultOpen
        onCopy={onCopy}
      />,
    );
    await userEvent
      .setup()
      .click(screen.getByTestId("captures-footer-row-api_secret"));
    expect(onCopy).toHaveBeenCalledWith("api_secret", "real-value");
  });

  it("number values are stringified for the row display", () => {
    renderWithProviders(
      <CapturesFooter captures={captures(["count", e(42)])} defaultOpen />,
    );
    expect(screen.getByTestId("captures-footer-row-count").textContent).toMatch(
      /count.*=.*42/,
    );
  });
});
