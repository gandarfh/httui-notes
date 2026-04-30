import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { GitAuditHeader } from "@/components/layout/git/GitAuditHeader";
import { renderWithProviders, screen } from "@/test/render";

describe("GitAuditHeader", () => {
  it("renders the canvas-spec'd 'audit log' substitution copy", () => {
    renderWithProviders(<GitAuditHeader />);
    expect(screen.getByTestId("git-audit-header")).toHaveTextContent(
      /Audit log/i,
    );
    expect(screen.getByTestId("git-audit-header-body").textContent).toMatch(
      /This is your audit log\. Every change is a commit\./,
    );
  });

  it("renders body as a non-interactive div when no callback supplied", () => {
    renderWithProviders(<GitAuditHeader />);
    expect(screen.getByTestId("git-audit-header-body").tagName).toBe("DIV");
  });

  it("renders body as a button and fires onLearnMore on click", async () => {
    const onLearnMore = vi.fn();
    renderWithProviders(<GitAuditHeader onLearnMore={onLearnMore} />);
    const body = screen.getByTestId("git-audit-header-body");
    expect(body.tagName).toBe("BUTTON");
    await userEvent.setup().click(body);
    expect(onLearnMore).toHaveBeenCalledTimes(1);
  });
});
