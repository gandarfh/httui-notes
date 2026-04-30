import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "@/test/render";
import { VariablesPage } from "@/components/layout/variables/VariablesPage";

describe("VariablesPage", () => {
  it("renders the 3-column layout with all three panels", () => {
    renderWithProviders(<VariablesPage />);
    expect(screen.getByTestId("variables-page")).toBeInTheDocument();
    expect(
      screen.getByTestId("variables-scopes-sidebar"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("variables-list-panel"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("variables-detail-panel"),
    ).toBeInTheDocument();
  });

  it("starts on the initial scope and updates when a sidebar row is clicked", async () => {
    renderWithProviders(<VariablesPage initialScope="workspace" />);
    expect(
      screen.getByTestId("variables-page").getAttribute("data-scope"),
    ).toBe("workspace");
    await userEvent
      .setup()
      .click(screen.getByTestId("variables-scope-secret"));
    expect(
      screen.getByTestId("variables-page").getAttribute("data-scope"),
    ).toBe("secret");
  });

  it("falls back to 'all' when the initialScope is not in the canvas set", () => {
    renderWithProviders(
      <VariablesPage initialScope={"bogus" as never} />,
    );
    expect(
      screen.getByTestId("variables-page").getAttribute("data-scope"),
    ).toBe("all");
  });

  it("forwards env column names + counts + active env to the children", () => {
    renderWithProviders(
      <VariablesPage
        envColumnNames={["local", "staging", "prod"]}
        countsByScope={{ all: 8, workspace: 3 }}
        activeEnvName="staging"
      />,
    );
    expect(
      screen.getByTestId("variables-env-header-local"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("variables-scope-all-count").textContent,
    ).toBe("8");
    expect(
      screen.getByTestId("variables-active-env-pill").textContent,
    ).toMatch(/staging/);
  });

  it("renders rowsSlot + detailSlot when supplied with selectedKey", () => {
    renderWithProviders(
      <VariablesPage
        rowsSlot={<div data-testid="rows-stub" />}
        detailSlot={<div data-testid="detail-stub" />}
        selectedKey="api_base"
      />,
    );
    expect(screen.getByTestId("rows-stub")).toBeInTheDocument();
    expect(screen.getByTestId("detail-stub")).toBeInTheDocument();
  });

  it("forwards onImportDotenv + onCreateNew handlers", async () => {
    const onImportDotenv = vi.fn();
    const onCreateNew = vi.fn();
    renderWithProviders(
      <VariablesPage
        onImportDotenv={onImportDotenv}
        onCreateNew={onCreateNew}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId("variables-import-dotenv"));
    await user.click(screen.getByTestId("variables-create-new"));
    expect(onImportDotenv).toHaveBeenCalledTimes(1);
    expect(onCreateNew).toHaveBeenCalledTimes(1);
  });
});
