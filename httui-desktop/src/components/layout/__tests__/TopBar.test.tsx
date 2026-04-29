import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderWithWorkspace, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { TopBar } from "@/components/layout/TopBar";
import { useEnvironmentStore } from "@/stores/environment";
import { useSettingsStore } from "@/stores/settings";
import { clearTauriMocks } from "@/test/mocks/tauri";

vi.mock("@/lib/theme/apply", () => ({ applyTheme: vi.fn() }));

const mkEnv = (id: string, name: string, isActive = false) => ({
  id,
  name,
  is_active: isActive,
  created_at: "2026-01-01T00:00:00Z",
});

const baseProps = {
  sidebarOpen: true,
  onToggleSidebar: vi.fn(),
  chatOpen: false,
  onToggleChat: vi.fn(),
  schemaPanelOpen: false,
  onToggleSchemaPanel: vi.fn(),
};

describe("TopBar", () => {
  beforeEach(() => {
    clearTauriMocks();
    useEnvironmentStore.setState({
      environments: [],
      activeEnvironment: null,
      managerOpen: false,
      variablesVersion: 0,
    });
    useSettingsStore.setState({ settingsOpen: false });
  });

  afterEach(() => {
    clearTauriMocks();
  });

  it("renders 'Notes' brand label", () => {
    renderWithWorkspace(<TopBar {...baseProps} />);
    expect(screen.getByText("Notes")).toBeInTheDocument();
  });

  it("does not show vault breadcrumb when no vault is open", () => {
    renderWithWorkspace(<TopBar {...baseProps} />, { vaultPath: null });
    // chevron separator is only rendered with vault
    expect(screen.queryByText("›")).not.toBeInTheDocument();
  });

  it("shows just the basename of the active vault path", () => {
    renderWithWorkspace(<TopBar {...baseProps} />, {
      vaultPath: "/Users/me/notes-vault",
      vaults: ["/Users/me/notes-vault"],
    });
    expect(screen.getByText("notes-vault")).toBeInTheDocument();
  });

  it("'No env' fallback when no active environment", () => {
    renderWithWorkspace(<TopBar {...baseProps} />);
    expect(screen.getByText("No env")).toBeInTheDocument();
  });

  it("shows active environment name with 'active' badge", () => {
    useEnvironmentStore.setState({
      activeEnvironment: mkEnv("e1", "production", true),
    });
    renderWithWorkspace(<TopBar {...baseProps} />);
    expect(screen.getByText("production")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("toggle sidebar button calls onToggleSidebar", async () => {
    const user = userEvent.setup();
    const onToggleSidebar = vi.fn();
    renderWithWorkspace(
      <TopBar {...baseProps} onToggleSidebar={onToggleSidebar} />,
    );

    await user.click(screen.getByRole("button", { name: /hide sidebar/i }));
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it("aria-label flips when sidebar is closed", () => {
    renderWithWorkspace(<TopBar {...baseProps} sidebarOpen={false} />);
    expect(
      screen.getByRole("button", { name: /show sidebar/i }),
    ).toBeInTheDocument();
  });

  it("chat button calls onToggleChat", async () => {
    const user = userEvent.setup();
    const onToggleChat = vi.fn();
    renderWithWorkspace(<TopBar {...baseProps} onToggleChat={onToggleChat} />);

    await user.click(screen.getByRole("button", { name: /open chat/i }));
    expect(onToggleChat).toHaveBeenCalledTimes(1);
  });

  it("schema panel button reflects open state in aria-label", () => {
    renderWithWorkspace(<TopBar {...baseProps} schemaPanelOpen={true} />);
    expect(
      screen.getByRole("button", { name: /close schema panel/i }),
    ).toBeInTheDocument();
  });

  it("schema panel button calls onToggleSchemaPanel", async () => {
    const user = userEvent.setup();
    const onToggleSchemaPanel = vi.fn();
    renderWithWorkspace(
      <TopBar {...baseProps} onToggleSchemaPanel={onToggleSchemaPanel} />,
    );

    await user.click(
      screen.getByRole("button", { name: /open schema panel/i }),
    );
    expect(onToggleSchemaPanel).toHaveBeenCalledTimes(1);
  });

  it("settings button opens the settings store flag", async () => {
    const user = userEvent.setup();
    renderWithWorkspace(<TopBar {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /settings/i }));

    expect(useSettingsStore.getState().settingsOpen).toBe(true);
  });
});
