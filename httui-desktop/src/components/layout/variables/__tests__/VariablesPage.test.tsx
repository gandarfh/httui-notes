import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "@/test/render";
import { VariablesPage } from "@/components/layout/variables/VariablesPage";
import type { VariableRow } from "@/components/layout/variables/variable-derive";

function row(over: Partial<VariableRow>): VariableRow {
  return {
    key: "API_BASE",
    scope: "workspace",
    isSecret: false,
    values: { local: "http://localhost", staging: "https://stg" },
    usesCount: 0,
    ...over,
  };
}

describe("VariablesPage", () => {
  it("renders the 3-column layout with all three panels", () => {
    renderWithProviders(<VariablesPage />);
    expect(screen.getByTestId("variables-page")).toBeInTheDocument();
    expect(screen.getByTestId("variables-scopes-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("variables-list-panel")).toBeInTheDocument();
    expect(screen.getByTestId("variables-detail-panel")).toBeInTheDocument();
  });

  it("starts on the initial scope and updates when a sidebar row is clicked", async () => {
    renderWithProviders(<VariablesPage initialScope="workspace" />);
    expect(
      screen.getByTestId("variables-page").getAttribute("data-scope"),
    ).toBe("workspace");
    await userEvent.setup().click(screen.getByTestId("variables-scope-secret"));
    expect(
      screen.getByTestId("variables-page").getAttribute("data-scope"),
    ).toBe("secret");
  });

  it("falls back to 'all' when the initialScope is not in the canvas set", () => {
    renderWithProviders(<VariablesPage initialScope={"bogus" as never} />);
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
    expect(screen.getByTestId("variables-scope-all-count").textContent).toBe(
      "8",
    );
    expect(screen.getByTestId("variables-active-env-pill").textContent).toMatch(
      /staging/,
    );
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

  it("auto-derives rows when `rows` is provided (sorts by name + applies search)", async () => {
    const rows = [
      row({ key: "USER", values: { local: "alice" } }),
      row({ key: "DB_URL", values: { local: "pg://x" } }),
      row({ key: "API_BASE", values: { local: "http://localhost" } }),
    ];
    renderWithProviders(
      <VariablesPage rows={rows} envColumnNames={["local"]} />,
    );
    const renderedKeys = [
      ...document.querySelectorAll("[data-testid^=variables-row-]"),
    ]
      .map((el) => el.getAttribute("data-testid"))
      .filter((id): id is string => !!id && /^variables-row-[^-]+$/.test(id))
      .map((id) => id.replace("variables-row-", ""));
    expect(renderedKeys).toEqual(["API_BASE", "DB_URL", "USER"]);

    await userEvent
      .setup()
      .type(screen.getByTestId("variables-search"), "user");
    expect(
      screen.queryByTestId("variables-row-DB_URL"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("variables-row-USER")).toBeInTheDocument();
  });

  it("falls back to the empty hint when derived rows are empty", () => {
    renderWithProviders(
      <VariablesPage
        rows={[row({ key: "USER", scope: "personal" })]}
        envColumnNames={["local"]}
        initialScope="captured"
      />,
    );
    expect(screen.getByTestId("variables-empty-hint")).toBeInTheDocument();
    expect(screen.queryByTestId("variables-row-USER")).not.toBeInTheDocument();
  });

  it("derives sidebar counts from rows when countsByScope omitted", () => {
    renderWithProviders(
      <VariablesPage
        rows={[
          row({ key: "A", scope: "workspace" }),
          row({ key: "B", scope: "workspace", isSecret: true }),
          row({ key: "C", scope: "captured" }),
        ]}
        envColumnNames={["local"]}
      />,
    );
    expect(screen.getByTestId("variables-scope-all-count").textContent).toBe(
      "3",
    );
    expect(
      screen.getByTestId("variables-scope-workspace-count").textContent,
    ).toBe("2");
    expect(screen.getByTestId("variables-scope-secret-count").textContent).toBe(
      "1",
    );
  });

  it("forwards onSelectKey when a row is clicked", async () => {
    const onSelectKey = vi.fn();
    renderWithProviders(
      <VariablesPage
        rows={[row({ key: "API_BASE" })]}
        envColumnNames={["local"]}
        onSelectKey={onSelectKey}
      />,
    );
    await userEvent.setup().click(screen.getByTestId("variables-row-API_BASE"));
    expect(onSelectKey).toHaveBeenCalledWith("API_BASE");
  });

  it("rowsSlot wins over the auto-rows path even when `rows` is supplied", () => {
    renderWithProviders(
      <VariablesPage
        rows={[row({ key: "API_BASE" })]}
        envColumnNames={["local"]}
        rowsSlot={<div data-testid="custom-rows" />}
      />,
    );
    expect(screen.getByTestId("custom-rows")).toBeInTheDocument();
    expect(
      screen.queryByTestId("variables-row-API_BASE"),
    ).not.toBeInTheDocument();
  });

  it("renders inlineFormSlot above the table when supplied", () => {
    renderWithProviders(
      <VariablesPage
        envColumnNames={["local"]}
        inlineFormSlot={<div data-testid="form-stub" />}
      />,
    );
    expect(screen.getByTestId("form-stub")).toBeInTheDocument();
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
