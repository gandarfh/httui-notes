import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";

import { ConnectionsPage } from "@/components/layout/connections/ConnectionsPage";

describe("ConnectionsPage", () => {
  it("composes the kind sidebar, list panel, and detail panel", () => {
    renderWithProviders(<ConnectionsPage />);
    expect(screen.getByTestId("connections-page")).toBeInTheDocument();
    expect(
      screen.getByTestId("connections-kind-sidebar"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("connections-list-panel"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("connections-detail-panel"),
    ).toBeInTheDocument();
  });

  it("renders zero status when no props are passed", () => {
    renderWithProviders(<ConnectionsPage />);
    const status = screen.getByTestId("connections-list-status");
    expect(status.textContent).toContain("0");
    expect(status.textContent).toContain("0 ok");
  });

  it("renders the keychain hint card", () => {
    renderWithProviders(<ConnectionsPage />);
    expect(
      screen.getByTestId("connections-keychain-hint"),
    ).toBeInTheDocument();
  });

  it("clicking a kind row toggles selection (no crash)", async () => {
    renderWithProviders(<ConnectionsPage countsByKind={{ postgres: 2 }} />);
    const row = screen.getByTestId("kind-row-postgres");
    expect(row.getAttribute("data-selected")).toBe("false");
    await userEvent.setup().click(row);
    expect(row.getAttribute("data-selected")).toBe("true");
  });

  it("forwards onTestAll + onCreateNew when supplied", async () => {
    const onTestAll = vi.fn();
    const onCreateNew = vi.fn();
    renderWithProviders(
      <ConnectionsPage onTestAll={onTestAll} onCreateNew={onCreateNew} />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId("connections-test-all"));
    await user.click(screen.getByTestId("connections-create-new"));
    expect(onTestAll).toHaveBeenCalledTimes(1);
    expect(onCreateNew).toHaveBeenCalledTimes(1);
  });

  it("typing in the search box updates the input", async () => {
    renderWithProviders(<ConnectionsPage />);
    const search = screen.getByTestId(
      "connections-search",
    ) as HTMLInputElement;
    await userEvent.setup().type(search, "prod");
    expect(search.value).toBe("prod");
  });

  it("renders the per-environment section when envs are supplied", () => {
    renderWithProviders(
      <ConnectionsPage
        envs={[{ name: "staging", status: "ok", count: 5 }]}
      />,
    );
    expect(screen.getByTestId("env-row-staging")).toBeInTheDocument();
  });
});
