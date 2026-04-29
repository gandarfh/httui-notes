import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "@/test/render";

import { EmptyVaultFooter } from "@/components/layout/empty-vault/EmptyVaultFooter";

describe("EmptyVaultFooter", () => {
  it("renders the canvas-spec hint with ⌘V kbd", () => {
    renderWithProviders(<EmptyVaultFooter />);
    expect(screen.getByText(/ou cole uma URL/)).toBeInTheDocument();
    expect(screen.getByText("⌘V")).toBeInTheDocument();
    expect(screen.getByText(/e geramos o bloco/)).toBeInTheDocument();
  });

  it("renders the Tour link as a coming-soon placeholder", () => {
    renderWithProviders(<EmptyVaultFooter />);
    const tour = screen.getByTestId("empty-vault-tour");
    expect(tour.textContent).toContain("Tour interativo");
    expect(tour.getAttribute("title")).toBe("Coming in v1.x");
  });

  it("tags the wrapper as data-atom='empty-vault-footer'", () => {
    const { container } = renderWithProviders(<EmptyVaultFooter />);
    expect(
      container.querySelector('[data-atom="empty-vault-footer"]'),
    ).toBeTruthy();
  });
});
