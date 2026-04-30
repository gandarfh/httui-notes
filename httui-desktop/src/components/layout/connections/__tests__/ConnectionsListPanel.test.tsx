import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";

import { ConnectionsListPanel } from "@/components/layout/connections/ConnectionsListPanel";

function defaults() {
  return {
    status: { total: 16, ok: 14, slow: 1, down: 1 },
    searchValue: "",
    onSearchChange: vi.fn(),
    onTestAll: vi.fn(),
    onCreateNew: vi.fn(),
  };
}

describe("ConnectionsListPanel", () => {
  it("renders the heading and the canvas-spec status counts", () => {
    renderWithProviders(<ConnectionsListPanel {...defaults()} />);
    expect(screen.getByRole("heading", { name: "Connections" })).toBeInTheDocument();
    const status = screen.getByTestId("connections-list-status");
    expect(status.textContent).toContain("16");
    expect(status.textContent).toContain("14 ok");
    expect(status.textContent).toContain("1 slow");
    expect(status.textContent).toContain("1 down");
  });

  it("Test all + Nova buttons dispatch their handlers", async () => {
    const onTestAll = vi.fn();
    const onCreateNew = vi.fn();
    renderWithProviders(
      <ConnectionsListPanel
        {...defaults()}
        onTestAll={onTestAll}
        onCreateNew={onCreateNew}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId("connections-test-all"));
    await user.click(screen.getByTestId("connections-create-new"));
    expect(onTestAll).toHaveBeenCalledTimes(1);
    expect(onCreateNew).toHaveBeenCalledTimes(1);
  });

  it("dispatches onSearchChange as the user types", async () => {
    const onSearchChange = vi.fn();
    renderWithProviders(
      <ConnectionsListPanel
        {...defaults()}
        onSearchChange={onSearchChange}
      />,
    );
    await userEvent
      .setup()
      .type(screen.getByTestId("connections-search"), "p");
    expect(onSearchChange).toHaveBeenCalled();
  });

  it("renders the empty state by default with the canvas hint", () => {
    renderWithProviders(<ConnectionsListPanel {...defaults()} />);
    const empty = screen.getByTestId("connections-list-empty");
    expect(empty.textContent).toContain("Select a connection");
  });

  it("supports a custom empty hint", () => {
    renderWithProviders(
      <ConnectionsListPanel {...defaults()} emptyHint="No matches" />,
    );
    expect(
      screen.getByTestId("connections-list-empty").textContent,
    ).toContain("No matches");
  });

  it("renders the footer hint with the keymap labels", () => {
    renderWithProviders(<ConnectionsListPanel {...defaults()} />);
    const footer = screen.getByTestId("connections-list-footer");
    expect(footer.textContent).toContain("⌘P");
    expect(footer.textContent).toContain("⌘⇧N");
    expect(footer.textContent).toContain("⌘⌥T");
  });
});
