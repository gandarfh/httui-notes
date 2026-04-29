import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithProviders } from "@/test/render";

// Capture next-themes setTheme so we can assert on it.
const setTheme = vi.fn();
vi.mock("next-themes", async () => {
  const actual = await vi.importActual<object>("next-themes");
  return {
    ...actual,
    useTheme: () => ({
      setTheme,
      resolvedTheme: "dark",
      forcedTheme: undefined,
    }),
  };
});

import { ColorModeSync } from "@/components/layout/ColorModeSync";
import { useSettingsStore } from "@/stores/settings";

beforeEach(() => {
  setTheme.mockClear();
  useSettingsStore.setState({ colorMode: "system", loaded: false });
});

afterEach(() => {
  useSettingsStore.setState({ colorMode: "system", loaded: false });
});

describe("ColorModeSync", () => {
  it("does not call setTheme until settings finish loading", () => {
    useSettingsStore.setState({ colorMode: "dark", loaded: false });
    renderWithProviders(<ColorModeSync />);
    expect(setTheme).not.toHaveBeenCalled();
  });

  it("applies the persisted colorMode once loaded=true", () => {
    useSettingsStore.setState({ colorMode: "dark", loaded: true });
    renderWithProviders(<ColorModeSync />);
    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("forwards 'system' to next-themes verbatim (auto-resolve sentinel)", () => {
    useSettingsStore.setState({ colorMode: "system", loaded: true });
    renderWithProviders(<ColorModeSync />);
    expect(setTheme).toHaveBeenCalledWith("system");
  });

  it("renders nothing — pure side effect", () => {
    useSettingsStore.setState({ colorMode: "light", loaded: true });
    const { container } = renderWithProviders(<ColorModeSync />);
    expect(container.firstChild).toBeNull();
  });
});
