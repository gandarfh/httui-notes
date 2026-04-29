import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { mockTauriCommand, clearTauriMocks } from "@/test/mocks/tauri";

vi.mock("@/lib/theme/apply", () => ({
  applyTheme: vi.fn(),
}));

import { ColorModePicker } from "@/components/layout/settings/ColorModePicker";
import { useSettingsStore } from "@/stores/settings";

beforeEach(() => {
  useSettingsStore.setState({ colorMode: "system", loaded: true });
  clearTauriMocks();
  mockTauriCommand("get_user_config", () => ({
    version: "1",
    ui: {
      theme: "",
      font_family: "",
      font_size: 14,
      density: "",
      auto_save_ms: 1000,
      default_fetch_size: 80,
      history_retention: 10,
      vim_enabled: false,
      sidebar_open: true,
      color_mode: "system",
    },
    shortcuts: {},
    secrets: { backend: "auto", biometric: true, prompt_timeout_s: 60 },
    mcp: { servers: {} },
    active_envs: {},
  }));
  mockTauriCommand("set_user_config", () => undefined);
});

afterEach(() => {
  clearTauriMocks();
});

describe("ColorModePicker", () => {
  it("renders three radio cells: System / Light / Dark", () => {
    renderWithProviders(<ColorModePicker />);
    expect(screen.getByRole("radio", { name: /System/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Light/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Dark/ })).toBeTruthy();
  });

  it("marks the active mode with aria-checked + data-active='true'", () => {
    useSettingsStore.setState({ colorMode: "dark", loaded: true });
    renderWithProviders(<ColorModePicker />);
    const dark = screen.getByRole("radio", { name: /Dark/ });
    expect(dark.getAttribute("aria-checked")).toBe("true");
    expect(dark.getAttribute("data-active")).toBe("true");
    const light = screen.getByRole("radio", { name: /Light/ });
    expect(light.getAttribute("aria-checked")).toBe("false");
  });

  it("clicking a cell calls setColorMode + updates state", async () => {
    renderWithProviders(<ColorModePicker />);
    expect(useSettingsStore.getState().colorMode).toBe("system");

    await userEvent.setup().click(screen.getByRole("radio", { name: /Light/ }));
    expect(useSettingsStore.getState().colorMode).toBe("light");
  });

  it("each cell carries data-color-mode for a11y/styling hooks", () => {
    renderWithProviders(<ColorModePicker />);
    const radios = screen.getAllByRole("radio");
    const values = radios.map((r) => r.getAttribute("data-color-mode"));
    expect(values).toEqual(["system", "light", "dark"]);
  });

  it("renders inside a role=radiogroup", () => {
    renderWithProviders(<ColorModePicker />);
    expect(screen.getByRole("radiogroup", { name: "Color mode" })).toBeTruthy();
  });
});
