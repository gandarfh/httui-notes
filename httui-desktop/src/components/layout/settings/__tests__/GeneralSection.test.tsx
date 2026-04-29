import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderWithWorkspace, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { mockTauriCommand, clearTauriMocks } from "@/test/mocks/tauri";

vi.mock("@/lib/theme/apply", () => ({
  applyTheme: vi.fn(),
}));

import { GeneralSection } from "@/components/layout/settings/GeneralSection";
import { useSettingsStore } from "@/stores/settings";

beforeEach(() => {
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
  useSettingsStore.setState({
    settings: {
      autoSaveMs: 1000,
      editorFontSize: 14,
      defaultFetchSize: 80,
      historyRetention: 10,
    },
    colorMode: "system",
    loaded: true,
  });
});

afterEach(() => {
  clearTauriMocks();
});

describe("GeneralSection", () => {
  it("mounts the ColorModePicker (canvas-spec radio replaces legacy switch)", () => {
    renderWithWorkspace(<GeneralSection />);
    expect(screen.getByRole("radiogroup", { name: "Color mode" })).toBeTruthy();
  });

  it("renders the auto-save dropdown with the active option", () => {
    renderWithWorkspace(<GeneralSection />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("1000");
  });

  it("changing the auto-save dropdown writes through the store", async () => {
    renderWithWorkspace(<GeneralSection />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;

    await userEvent.setup().selectOptions(select, "2000");

    expect(useSettingsStore.getState().settings.autoSaveMs).toBe(2000);
  });
});
