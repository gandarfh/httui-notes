import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";

import { EmBrancoCard } from "@/components/layout/empty-vault/EmBrancoCard";

describe("EmBrancoCard", () => {
  it("renders the canvas-spec eyebrow / title / body / CTA", () => {
    renderWithProviders(<EmBrancoCard onCreateClick={() => {}} />);
    expect(screen.getByTestId("em-branco-eyebrow").textContent).toBe(
      "RECOMENDADO",
    );
    expect(screen.getByTestId("em-branco-title").textContent).toBe(
      "Em branco",
    );
    expect(screen.getByTestId("em-branco-body").textContent).toContain(
      "Markdown vazio com um bloco HTTP",
    );
    expect(screen.getByTestId("em-branco-cta")).toBeInTheDocument();
  });

  it("CTA dispatches onCreateClick", async () => {
    const user = userEvent.setup();
    const onCreateClick = vi.fn();
    renderWithProviders(<EmBrancoCard onCreateClick={onCreateClick} />);
    await user.click(screen.getByTestId("em-branco-cta"));
    expect(onCreateClick).toHaveBeenCalledTimes(1);
  });

  it("decoration is aria-hidden", () => {
    renderWithProviders(<EmBrancoCard onCreateClick={() => {}} />);
    const decoration = screen.getByTestId("em-branco-decoration");
    expect(decoration.getAttribute("aria-hidden")).toBe("true");
  });

  it("CTA aria-label is descriptive (not just '→')", () => {
    renderWithProviders(<EmBrancoCard onCreateClick={() => {}} />);
    const cta = screen.getByLabelText("Criar primeiro runbook");
    expect(cta).toBeInTheDocument();
  });

  it("tags the wrapper as data-atom='em-branco-card'", () => {
    const { container } = renderWithProviders(
      <EmBrancoCard onCreateClick={() => {}} />,
    );
    expect(container.querySelector('[data-atom="em-branco-card"]')).toBeTruthy();
  });
});
