import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "@/test/render";
import {
  NewConnectionFormTab,
  EMPTY_POSTGRES_VALUE,
} from "@/components/layout/connections/NewConnectionFormTab";

describe("NewConnectionFormTab", () => {
  it("renders the postgres field grid + keychain hint + suffix", () => {
    renderWithProviders(
      <NewConnectionFormTab
        kind="postgres"
        value={EMPTY_POSTGRES_VALUE}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId("new-connection-form-tab"),
    ).toBeInTheDocument();
    for (const field of [
      "name",
      "host",
      "port",
      "database",
      "username",
      "password",
    ]) {
      expect(
        screen.getByTestId(`new-connection-field-${field}`),
      ).toBeInTheDocument();
    }
    expect(
      screen.getByText(/Salva apenas no seu keychain/),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("new-connection-keychain-suffix"),
    ).toBeInTheDocument();
  });

  it("renders the same Postgres shape for mysql", () => {
    renderWithProviders(
      <NewConnectionFormTab
        kind="mysql"
        value={EMPTY_POSTGRES_VALUE}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId("new-connection-form-tab"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("new-connection-field-host"),
    ).toBeInTheDocument();
  });

  it("renders the stub for non-postgres-shape kinds", () => {
    renderWithProviders(
      <NewConnectionFormTab
        kind="grpc"
        value={EMPTY_POSTGRES_VALUE}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId("new-connection-form-stub-grpc"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("new-connection-form-tab"),
    ).not.toBeInTheDocument();
  });

  it("typing into a field dispatches onChange with the patched value", async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <NewConnectionFormTab
        kind="postgres"
        value={EMPTY_POSTGRES_VALUE}
        onChange={onChange}
      />,
    );
    const nameInput = screen.getByTestId("new-connection-field-name");
    await userEvent.setup().type(nameInput, "x");
    // userEvent.type fires onChange per keystroke; controlled-input
    // pattern means each call carries the current value + the new char.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({
      ...EMPTY_POSTGRES_VALUE,
      name: "x",
    });
  });

  it("password field uses type=password", () => {
    renderWithProviders(
      <NewConnectionFormTab
        kind="postgres"
        value={EMPTY_POSTGRES_VALUE}
        onChange={vi.fn()}
      />,
    );
    const pw = screen.getByTestId("new-connection-field-password");
    expect(pw.getAttribute("type")).toBe("password");
  });

  it("renders the env binder slot when supplied", () => {
    renderWithProviders(
      <NewConnectionFormTab
        kind="postgres"
        value={EMPTY_POSTGRES_VALUE}
        onChange={vi.fn()}
        envBinder={<div data-testid="env-binder-stub" />}
      />,
    );
    expect(
      screen.getByTestId("new-connection-form-env-slot"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("env-binder-stub")).toBeInTheDocument();
  });

  it("renders the test banner slot when supplied", () => {
    renderWithProviders(
      <NewConnectionFormTab
        kind="postgres"
        value={EMPTY_POSTGRES_VALUE}
        onChange={vi.fn()}
        testBanner={<div data-testid="test-banner-stub" />}
      />,
    );
    expect(
      screen.getByTestId("new-connection-form-test-slot"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("test-banner-stub")).toBeInTheDocument();
  });

  it("hides slots when not supplied", () => {
    renderWithProviders(
      <NewConnectionFormTab
        kind="postgres"
        value={EMPTY_POSTGRES_VALUE}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId("new-connection-form-env-slot"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("new-connection-form-test-slot"),
    ).not.toBeInTheDocument();
  });
});
