import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";

import {
  ImportarCard,
  IMPORT_FORMATS,
} from "@/components/layout/empty-vault/ImportarCard";

describe("ImportarCard", () => {
  it("renders title 'Importar' and the canvas body copy", () => {
    renderWithProviders(<ImportarCard onSelect={() => {}} />);
    expect(screen.getByTestId("importar-title").textContent).toBe(
      "Importar",
    );
    expect(
      screen.getByText("Traga sua coleção. Mantemos pastas, vars e auth."),
    ).toBeInTheDocument();
  });

  it("renders the orange icon (data-testid='importar-icon')", () => {
    renderWithProviders(<ImportarCard onSelect={() => {}} />);
    const icon = screen.getByTestId("importar-icon");
    expect(icon.textContent).toBe("↘");
    expect(icon.getAttribute("aria-hidden")).toBe("true");
  });

  it("exposes IMPORT_FORMATS for downstream picker logic", () => {
    expect(IMPORT_FORMATS).toEqual([
      "Postman",
      "Bruno",
      "Insomnia",
      "OpenAPI",
      "HAR",
      ".env",
    ]);
  });

  it("renders one pill chip per supported format", () => {
    renderWithProviders(<ImportarCard onSelect={() => {}} />);
    for (const fmt of IMPORT_FORMATS) {
      expect(
        screen.getByTestId(`importar-chip-${fmt.toLowerCase()}`),
      ).toBeInTheDocument();
    }
  });

  it("clicking the card dispatches onSelect", async () => {
    const onSelect = vi.fn();
    renderWithProviders(<ImportarCard onSelect={onSelect} />);
    await userEvent.setup().click(screen.getByTestId("importar-card"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("aria-label = 'Importar' on the card root", () => {
    renderWithProviders(<ImportarCard onSelect={() => {}} />);
    expect(screen.getByLabelText("Importar")).toBeInTheDocument();
  });
});
