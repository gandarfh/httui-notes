import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { VariableValueRow } from "@/components/layout/variables/VariableValueRow";
import { renderWithProviders, screen } from "@/test/render";

describe("VariableValueRow (read-only + reveal)", () => {
  it("renders the env label and the cleartext value for a non-secret row", () => {
    renderWithProviders(
      <VariableValueRow
        env="local"
        value="http://localhost"
        isSecret={false}
      />,
    );
    expect(
      screen.getByTestId("variable-value-row-local-env-label").textContent,
    ).toBe("local");
    expect(
      screen.getByTestId("variable-value-row-local-display").textContent,
    ).toBe("http://localhost");
    expect(
      screen.queryByTestId("variable-value-row-local-show"),
    ).not.toBeInTheDocument();
  });

  it("renders an em-dash when the value is undefined and the row is not secret", () => {
    renderWithProviders(
      <VariableValueRow env="prod" value={undefined} isSecret={false} />,
    );
    expect(
      screen.getByTestId("variable-value-row-prod-display").textContent,
    ).toBe("—");
  });

  it("masks a secret value with bullets and shows a Show button", () => {
    renderWithProviders(
      <VariableValueRow env="staging" value={undefined} isSecret={true} />,
    );
    expect(
      screen.getByTestId("variable-value-row-staging-display").textContent,
    ).toBe("••••••••");
    expect(
      screen.getByTestId("variable-value-row-staging-show"),
    ).toBeInTheDocument();
  });

  it("disables Show when fetchSecret is not provided", () => {
    renderWithProviders(
      <VariableValueRow env="staging" value={undefined} isSecret={true} />,
    );
    expect(
      (
        screen.getByTestId(
          "variable-value-row-staging-show",
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("reveals the cleartext via fetchSecret and toggles back on Hide", async () => {
    const fetchSecret = vi.fn(async (env: string) => `cleartext-for-${env}`);
    renderWithProviders(
      <VariableValueRow
        env="staging"
        value={undefined}
        isSecret={true}
        fetchSecret={fetchSecret}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId("variable-value-row-staging-show"));
    expect(fetchSecret).toHaveBeenCalledWith("staging");
    expect(
      screen.getByTestId("variable-value-row-staging-display").textContent,
    ).toBe("cleartext-for-staging");
    expect(
      screen.getByTestId("variable-value-row-staging-hide"),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId("variable-value-row-staging-hide"));
    expect(
      screen.getByTestId("variable-value-row-staging-display").textContent,
    ).toBe("••••••••");
    expect(
      screen.getByTestId("variable-value-row-staging-show"),
    ).toBeInTheDocument();
  });

  it("renders an inline error when fetchSecret rejects", async () => {
    const fetchSecret = vi.fn(async () => {
      throw new Error("keychain locked");
    });
    renderWithProviders(
      <VariableValueRow
        env="staging"
        value={undefined}
        isSecret={true}
        fetchSecret={fetchSecret}
      />,
    );
    await userEvent
      .setup()
      .click(screen.getByTestId("variable-value-row-staging-show"));
    expect(
      screen.getByTestId("variable-value-row-staging-display").textContent,
    ).toMatch(/keychain locked/);
  });

  it("renders an empty hint when the revealed cleartext is the empty string", async () => {
    const fetchSecret = vi.fn(async () => "");
    renderWithProviders(
      <VariableValueRow
        env="staging"
        value={undefined}
        isSecret={true}
        fetchSecret={fetchSecret}
      />,
    );
    await userEvent
      .setup()
      .click(screen.getByTestId("variable-value-row-staging-show"));
    expect(
      screen.getByTestId("variable-value-row-staging-display").textContent,
    ).toMatch(/vazio/);
  });

  it("normalizes a non-Error rejection to its string form", async () => {
    const fetchSecret = vi.fn(async () => {
      throw "raw-string-error";
    });
    renderWithProviders(
      <VariableValueRow
        env="staging"
        value={undefined}
        isSecret={true}
        fetchSecret={fetchSecret}
      />,
    );
    await userEvent
      .setup()
      .click(screen.getByTestId("variable-value-row-staging-show"));
    expect(
      screen.getByTestId("variable-value-row-staging-display").textContent,
    ).toMatch(/raw-string-error/);
  });

  it("returning undefined from fetchSecret renders the empty cleartext hint", async () => {
    const fetchSecret = vi.fn(async () => undefined);
    renderWithProviders(
      <VariableValueRow
        env="staging"
        value={undefined}
        isSecret={true}
        fetchSecret={fetchSecret}
      />,
    );
    await userEvent
      .setup()
      .click(screen.getByTestId("variable-value-row-staging-show"));
    expect(
      screen.getByTestId("variable-value-row-staging-display").textContent,
    ).toMatch(/vazio/);
  });
});
