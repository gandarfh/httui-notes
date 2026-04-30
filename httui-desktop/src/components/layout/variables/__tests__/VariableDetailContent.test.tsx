import { describe, expect, it, vi } from "vitest";

import { VariableDetailContent } from "@/components/layout/variables/VariableDetailContent";
import type { VariableRow } from "@/components/layout/variables/variable-derive";
import { renderWithProviders, screen } from "@/test/render";

function row(over: Partial<VariableRow> = {}): VariableRow {
  return {
    key: "API_BASE",
    scope: "workspace",
    isSecret: false,
    values: {
      local: "http://localhost",
      staging: "https://stg.example",
      prod: "https://api.example",
    },
    usesCount: 3,
    ...over,
  };
}

describe("VariableDetailContent", () => {
  it("renders the header + one value row per env in display order", () => {
    renderWithProviders(
      <VariableDetailContent
        row={row()}
        envNames={["local", "staging", "prod"]}
      />,
    );
    expect(screen.getByTestId("variable-detail-header")).toBeInTheDocument();
    expect(screen.getByTestId("variable-value-row-local")).toBeInTheDocument();
    expect(
      screen.getByTestId("variable-value-row-staging"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("variable-value-row-prod")).toBeInTheDocument();
  });

  it("renders the empty-envs hint when envNames is empty", () => {
    renderWithProviders(<VariableDetailContent row={row()} envNames={[]} />);
    expect(
      screen.getByTestId("variable-detail-empty-envs"),
    ).toBeInTheDocument();
  });

  it("forwards fetchSecret to each value row when isSecret is true", async () => {
    const fetchSecret = vi.fn(async (env: string) => `clear-${env}`);
    renderWithProviders(
      <VariableDetailContent
        row={row({ isSecret: true, scope: "personal", values: {} })}
        envNames={["staging"]}
        fetchSecret={fetchSecret}
      />,
    );
    expect(
      (
        screen.getByTestId(
          "variable-value-row-staging-show",
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("renders the uses placeholder text with count when usesCount > 0", () => {
    renderWithProviders(
      <VariableDetailContent
        row={row({ usesCount: 5 })}
        envNames={["local"]}
      />,
    );
    expect(
      screen.getByTestId("variable-detail-uses-placeholder").textContent,
    ).toMatch(/5 referências/);
  });

  it("uses singular wording when usesCount === 1", () => {
    renderWithProviders(
      <VariableDetailContent
        row={row({ usesCount: 1 })}
        envNames={["local"]}
      />,
    );
    expect(
      screen.getByTestId("variable-detail-uses-placeholder").textContent,
    ).toMatch(/1 referência\b/);
  });

  it("renders the no-references variant when usesCount === 0", () => {
    renderWithProviders(
      <VariableDetailContent
        row={row({ usesCount: 0 })}
        envNames={["local"]}
      />,
    );
    expect(
      screen.getByTestId("variable-detail-uses-placeholder").textContent,
    ).toMatch(/Nenhuma referência/);
  });

  it("renders usedInBlocksSlot in place of the placeholder when supplied", () => {
    renderWithProviders(
      <VariableDetailContent
        row={row()}
        envNames={["local"]}
        usedInBlocksSlot={<div data-testid="custom-uses">CUSTOM</div>}
      />,
    );
    expect(screen.getByTestId("custom-uses")).toBeInTheDocument();
    expect(
      screen.queryByTestId("variable-detail-uses-placeholder"),
    ).not.toBeInTheDocument();
  });

  it("uses row.values[env] for each value cell", () => {
    renderWithProviders(
      <VariableDetailContent
        row={row({ values: { local: "X", prod: undefined } })}
        envNames={["local", "staging", "prod"]}
      />,
    );
    expect(
      screen.getByTestId("variable-value-row-local-display").textContent,
    ).toBe("X");
    // staging is not in row.values → undefined → em-dash
    expect(
      screen.getByTestId("variable-value-row-staging-display").textContent,
    ).toBe("—");
    expect(
      screen.getByTestId("variable-value-row-prod-display").textContent,
    ).toBe("—");
  });
});
