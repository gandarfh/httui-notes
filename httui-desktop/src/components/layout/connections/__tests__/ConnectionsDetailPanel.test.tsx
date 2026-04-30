import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "@/test/render";

import { ConnectionsDetailPanel } from "@/components/layout/connections/ConnectionsDetailPanel";

describe("ConnectionsDetailPanel", () => {
  it("renders the empty state when no connection is selected", () => {
    renderWithProviders(
      <ConnectionsDetailPanel selectedConnectionName={null} />,
    );
    expect(
      screen.getByTestId("connections-detail-empty"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Nothing selected/i)).toBeInTheDocument();
  });

  it("renders the placeholder + name when a connection is selected", () => {
    renderWithProviders(
      <ConnectionsDetailPanel selectedConnectionName="prod-db" />,
    );
    const placeholder = screen.getByTestId(
      "connections-detail-placeholder",
    );
    expect(placeholder).toBeInTheDocument();
    expect(placeholder.textContent).toContain("prod-db");
  });
});
