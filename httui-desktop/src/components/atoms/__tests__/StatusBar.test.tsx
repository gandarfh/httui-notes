import { describe, it, expect } from "vitest";
import { renderWithProviders } from "@/test/render";

import { StatusBarShell } from "@/components/atoms";

describe("StatusBarShell atom", () => {
  it("tags itself with data-atom='statusbar'", () => {
    const { container } = renderWithProviders(
      <StatusBarShell>
        <span>v1.0</span>
      </StatusBarShell>,
    );
    const node = container.querySelector('[data-atom="statusbar"]');
    expect(node).toBeTruthy();
  });

  it("renders children inline", () => {
    const { getByText } = renderWithProviders(
      <StatusBarShell>
        <span>main +3 ~7</span>
      </StatusBarShell>,
    );
    expect(getByText("main +3 ~7")).toBeTruthy();
  });

  it("forwards arbitrary HStack props (e.g. role)", () => {
    const { container } = renderWithProviders(
      <StatusBarShell role="contentinfo">
        <span>a</span>
      </StatusBarShell>,
    );
    const node = container.querySelector('[role="contentinfo"]');
    expect(node).toBeTruthy();
    expect(node?.getAttribute("data-atom")).toBe("statusbar");
  });
});
