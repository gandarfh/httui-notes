import { describe, it, expect } from "vitest";
import { renderWithProviders } from "@/test/render";

import { Dot, type DotVariant } from "@/components/atoms";

describe("Dot atom", () => {
  const variants: DotVariant[] = ["ok", "warn", "err", "info", "idle"];

  it("defaults to idle when no variant is given", () => {
    const { container } = renderWithProviders(<Dot data-testid="d" />);
    const node = container.querySelector('[data-atom="dot"]');
    expect(node?.getAttribute("data-variant")).toBe("idle");
  });

  it.each(variants)("tags '%s' on data-variant", (variant) => {
    const { container } = renderWithProviders(<Dot variant={variant} />);
    const node = container.querySelector('[data-atom="dot"]');
    expect(node?.getAttribute("data-variant")).toBe(variant);
  });

  it("is aria-hidden — purely decorative", () => {
    const { container } = renderWithProviders(<Dot variant="ok" />);
    const node = container.querySelector('[data-atom="dot"]');
    expect(node?.getAttribute("aria-hidden")).toBe("true");
  });

  it("forwards style props (data-state on the wrapper)", () => {
    const { container } = renderWithProviders(
      <Dot variant="err" data-state="firing" />,
    );
    const node = container.querySelector('[data-atom="dot"]');
    expect(node?.getAttribute("data-state")).toBe("firing");
  });
});
