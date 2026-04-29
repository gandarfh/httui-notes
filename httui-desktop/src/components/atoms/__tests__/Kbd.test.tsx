import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "@/test/render";

import { Kbd } from "@/components/atoms";

describe("Kbd atom", () => {
  it("renders as a <kbd> element with the supplied label", () => {
    renderWithProviders(<Kbd>⌘K</Kbd>);
    const node = screen.getByText("⌘K");
    expect(node.tagName).toBe("KBD");
  });

  it("tags itself with data-atom='kbd' for testing/styling hooks", () => {
    renderWithProviders(<Kbd>⌘P</Kbd>);
    const node = screen.getByText("⌘P");
    expect(node.getAttribute("data-atom")).toBe("kbd");
  });

  it("forwards arbitrary props to the underlying Box (spread API)", () => {
    renderWithProviders(<Kbd aria-label="meta-k">⌘K</Kbd>);
    const node = screen.getByLabelText("meta-k");
    expect(node).toBeTruthy();
  });
});
