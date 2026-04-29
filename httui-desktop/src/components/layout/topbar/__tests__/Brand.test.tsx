import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "@/test/render";

import { Brand } from "@/components/layout/topbar/Brand";

describe("Brand", () => {
  it("renders the httui wordmark", () => {
    renderWithProviders(<Brand />);
    expect(screen.getByText("httui")).toBeInTheDocument();
  });

  it("tags the wrapper as data-atom='brand'", () => {
    const { container } = renderWithProviders(<Brand />);
    expect(container.querySelector('[data-atom="brand"]')).toBeTruthy();
  });

  it("renders the divider as a non-interactive aria-hidden element", () => {
    const { container } = renderWithProviders(<Brand />);
    const dividers = container.querySelectorAll('[aria-hidden="true"]');
    // 2 aria-hidden: the logo box (decorative) + the divider
    expect(dividers.length).toBeGreaterThanOrEqual(2);
  });
});
