import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { TemporaryChip } from "@/components/layout/variables/TemporaryChip";
import { renderWithProviders, screen } from "@/test/render";

describe("TemporaryChip", () => {
  it("renders the default TEMPORARY label", () => {
    renderWithProviders(<TemporaryChip />);
    expect(screen.getByTestId("temporary-chip").textContent).toBe("TEMPORARY");
  });

  it("renders a custom label when provided", () => {
    renderWithProviders(<TemporaryChip label="OVERRIDE" />);
    expect(screen.getByTestId("temporary-chip").textContent).toBe("OVERRIDE");
  });

  it("is non-interactive (span) when onClear is not provided", () => {
    renderWithProviders(<TemporaryChip />);
    const chip = screen.getByTestId("temporary-chip");
    expect(chip.tagName).toBe("SPAN");
    expect(chip.getAttribute("data-interactive")).toBeNull();
  });

  it("becomes a button and fires onClear on click when onClear is provided", async () => {
    const onClear = vi.fn();
    renderWithProviders(<TemporaryChip onClear={onClear} />);
    const chip = screen.getByTestId("temporary-chip");
    expect(chip.tagName).toBe("BUTTON");
    expect(chip.getAttribute("data-interactive")).toBe("true");
    await userEvent.setup().click(chip);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("renders title hint only when interactive", () => {
    const { rerender } = renderWithProviders(<TemporaryChip />);
    expect(
      screen.getByTestId("temporary-chip").getAttribute("title"),
    ).toBeNull();
    rerender(<TemporaryChip onClear={() => {}} />);
    expect(screen.getByTestId("temporary-chip").getAttribute("title")).toMatch(
      /Clear/,
    );
  });
});
