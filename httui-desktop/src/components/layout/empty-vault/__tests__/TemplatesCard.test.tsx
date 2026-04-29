import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";

import { TemplatesCard } from "@/components/layout/empty-vault/TemplatesCard";

describe("TemplatesCard", () => {
  it("renders title 'Templates' and the body copy", () => {
    renderWithProviders(<TemplatesCard onSelect={() => {}} />);
    expect(screen.getByTestId("templates-title").textContent).toBe(
      "Templates",
    );
    expect(
      screen.getByText(/Health check, OAuth flow, smoke tests, rollout SQL/),
    ).toBeInTheDocument();
  });

  it("renders the moss icon (data-testid='templates-icon')", () => {
    renderWithProviders(<TemplatesCard onSelect={() => {}} />);
    const icon = screen.getByTestId("templates-icon");
    expect(icon.textContent).toBe("▦");
    expect(icon.getAttribute("aria-hidden")).toBe("true");
  });

  it("lists the 3 starter templates as bullet entries", () => {
    renderWithProviders(<TemplatesCard onSelect={() => {}} />);
    expect(screen.getByText("· Health check de API")).toBeInTheDocument();
    expect(screen.getByText("· OAuth 2.0 dance")).toBeInTheDocument();
    expect(screen.getByText("· Migração + rollback")).toBeInTheDocument();
  });

  it("renders the '+ N templates →' tail with a positive count", () => {
    renderWithProviders(<TemplatesCard onSelect={() => {}} />);
    const tail = screen.getByTestId("templates-more");
    expect(tail.textContent).toMatch(/^\+ \d+ templates →$/);
  });

  it("clicking the card dispatches onSelect", async () => {
    const onSelect = vi.fn();
    renderWithProviders(<TemplatesCard onSelect={onSelect} />);
    await userEvent.setup().click(screen.getByTestId("templates-card"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("aria-label = 'Templates' on the card root for screen readers", () => {
    renderWithProviders(<TemplatesCard onSelect={() => {}} />);
    expect(screen.getByLabelText("Templates")).toBeInTheDocument();
  });
});
