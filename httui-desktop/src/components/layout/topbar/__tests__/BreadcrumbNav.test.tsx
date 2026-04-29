import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";

import { BreadcrumbNav } from "@/components/layout/topbar/BreadcrumbNav";

describe("BreadcrumbNav", () => {
  it("shows 'no vault' fallback when no workspace is open", () => {
    renderWithProviders(
      <BreadcrumbNav workspace={null} filePath={null} unsaved={false} />,
    );
    expect(screen.getByText("no vault")).toBeInTheDocument();
  });

  it("renders the workspace as the only segment when no file is open", () => {
    renderWithProviders(
      <BreadcrumbNav workspace="acme-vault" filePath={null} unsaved={false} />,
    );
    expect(screen.getByText("acme-vault")).toBeInTheDocument();
    // No chevron when there are no path segments after workspace
    expect(screen.queryByText("›")).toBeNull();
  });

  it("derives runbook-relative segments from filePath", () => {
    renderWithProviders(
      <BreadcrumbNav
        workspace="acme-vault"
        filePath="/Users/me/acme-vault/runbooks/auth/login.md"
        unsaved={false}
      />,
    );
    expect(screen.getByText("auth")).toBeInTheDocument();
    expect(screen.getByText("login.md")).toBeInTheDocument();
    // 2 chevrons for 2 segments
    expect(screen.getAllByText("›")).toHaveLength(2);
  });

  it("marks the last segment with data-active='true'", () => {
    const { container } = renderWithProviders(
      <BreadcrumbNav
        workspace="acme-vault"
        filePath="/v/runbooks/notes.md"
        unsaved={false}
      />,
    );
    const file = container.querySelector('[data-segment="file"]');
    expect(file?.getAttribute("data-active")).toBe("true");
    expect(file?.textContent).toBe("notes.md");
  });

  it("renders the dirty dot on the last segment when unsaved=true", () => {
    renderWithProviders(
      <BreadcrumbNav
        workspace="v"
        filePath="/v/runbooks/notes.md"
        unsaved={true}
      />,
    );
    expect(screen.getByTestId("dirty-indicator")).toBeInTheDocument();
  });

  it("hides the dirty dot when unsaved=false", () => {
    renderWithProviders(
      <BreadcrumbNav
        workspace="v"
        filePath="/v/runbooks/notes.md"
        unsaved={false}
      />,
    );
    expect(screen.queryByTestId("dirty-indicator")).toBeNull();
  });

  it("dispatches onWorkspaceClick when the workspace segment is clicked", async () => {
    const onWorkspaceClick = vi.fn();
    renderWithProviders(
      <BreadcrumbNav
        workspace="acme"
        filePath={null}
        unsaved={false}
        onWorkspaceClick={onWorkspaceClick}
      />,
    );
    await userEvent.setup().click(screen.getByText("acme"));
    expect(onWorkspaceClick).toHaveBeenCalledTimes(1);
  });
});
