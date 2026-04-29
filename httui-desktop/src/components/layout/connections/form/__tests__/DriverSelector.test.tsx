import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";

import {
  DriverSelector,
  DRIVER_CONFIG,
} from "@/components/layout/connections/form/DriverSelector";

describe("DriverSelector", () => {
  it("renders all three driver pills", () => {
    renderWithProviders(<DriverSelector value="postgres" onChange={vi.fn()} />);
    expect(screen.getByTestId("driver-tab-postgres")).toBeInTheDocument();
    expect(screen.getByTestId("driver-tab-mysql")).toBeInTheDocument();
    expect(screen.getByTestId("driver-tab-sqlite")).toBeInTheDocument();
  });

  it("marks the active pill via data-active='true'", () => {
    renderWithProviders(<DriverSelector value="mysql" onChange={vi.fn()} />);
    expect(
      screen.getByTestId("driver-tab-mysql").getAttribute("data-active"),
    ).toBe("true");
    expect(
      screen.getByTestId("driver-tab-postgres").getAttribute("data-active"),
    ).toBe("false");
  });

  it("dispatches onChange with the clicked driver key", async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <DriverSelector value="postgres" onChange={onChange} />,
    );
    await userEvent.setup().click(screen.getByTestId("driver-tab-sqlite"));
    expect(onChange).toHaveBeenCalledWith("sqlite");
  });

  it("DRIVER_CONFIG carries label/color/defaultPort for each driver", () => {
    expect(DRIVER_CONFIG.postgres.defaultPort).toBe("5432");
    expect(DRIVER_CONFIG.mysql.defaultPort).toBe("3306");
    expect(DRIVER_CONFIG.sqlite.defaultPort).toBe("");
    expect(DRIVER_CONFIG.postgres.label).toBe("PostgreSQL");
  });
});
