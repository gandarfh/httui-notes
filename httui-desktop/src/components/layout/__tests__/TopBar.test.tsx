import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderWithWorkspace, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";

import { TopBar } from "@/components/layout/TopBar";
import { useEnvironmentStore } from "@/stores/environment";
import { useSettingsStore } from "@/stores/settings";
import { usePaneStore } from "@/stores/pane";
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
      switchEnvironment: vi.fn(),
    } as never);
    useSettingsStore.setState({ settingsOpen: false });
    usePaneStore.setState({
      layout: { type: "leaf", id: "p1", tabs: [], activeTab: 0 },
      activePaneId: "p1",
      unsavedFiles: new Set(),
    } as never);
  });

  afterEach(() => {
    clearTauriMocks();
  });

  describe("layout shape", () => {
    it("renders the httui brand wordmark (canvas §4)", () => {
      renderWithWorkspace(<TopBar {...baseProps} />);
      expect(screen.getByText("httui")).toBeInTheDocument();
    });

    it("renders 'no vault' breadcrumb fallback when no vault is open", () => {
      renderWithWorkspace(<TopBar {...baseProps} />, { vaultPath: null });
      expect(screen.getByText("no vault")).toBeInTheDocument();
    });

    it("renders the vault basename as the workspace segment", () => {
      renderWithWorkspace(<TopBar {...baseProps} />, {
        vaultPath: "/Users/me/notes-vault",
      });
      expect(screen.getByText("notes-vault")).toBeInTheDocument();
    });

    it("renders the segmented env switcher (with 'no env' when empty)", () => {
      renderWithWorkspace(<TopBar {...baseProps} />);
      expect(screen.getByText("no env")).toBeInTheDocument();
    });

    it("renders environments as segmented tabs when populated", () => {
      useEnvironmentStore.setState({
        environments: [mkEnv("a", "local"), mkEnv("b", "prod")],
        activeEnvironment: mkEnv("a", "local"),
        switchEnvironment: vi.fn(),
      } as never);
      renderWithWorkspace(<TopBar {...baseProps} />);
      expect(screen.getAllByRole("tab")).toHaveLength(2);
    });

    it("renders the search ⌘K placeholder", () => {
      renderWithWorkspace(<TopBar {...baseProps} />);
      expect(
        screen.getByLabelText("Search blocks, vars, schema"),
      ).toBeInTheDocument();
      expect(screen.getByText("⌘K")).toBeInTheDocument();
    });

    it("renders the branch button + Run-all button", () => {
      renderWithWorkspace(<TopBar {...baseProps} />);
      expect(screen.getByLabelText("Switch branch")).toBeInTheDocument();
      expect(
        screen.getByLabelText("Run all blocks in document"),
      ).toBeInTheDocument();
      expect(screen.getByText("Run all")).toBeInTheDocument();
    });
  });

  describe("toggle controls (right of run-all)", () => {
    it("toggle sidebar dispatches onToggleSidebar", async () => {
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

  describe("search + run-all + breadcrumb wiring", () => {
    it("clicking the search trigger dispatches the supplied onSearch", async () => {
      const user = userEvent.setup();
      const onSearch = vi.fn();
      renderWithWorkspace(<TopBar {...baseProps} onSearch={onSearch} />);
      await user.click(
        screen.getByLabelText("Search blocks, vars, schema"),
      );
      expect(onSearch).toHaveBeenCalledTimes(1);
    });

    it("clicking Run-all dispatches the supplied onRunAll", async () => {
      const user = userEvent.setup();
      const onRunAll = vi.fn();
      renderWithWorkspace(<TopBar {...baseProps} onRunAll={onRunAll} />);
      await user.click(
        screen.getByLabelText("Run all blocks in document"),
      );
      expect(onRunAll).toHaveBeenCalledTimes(1);
    });

    it("breadcrumb shows the active tab path with dirty dot when unsaved", () => {
      usePaneStore.setState({
        layout: {
          type: "leaf",
          id: "p1",
          tabs: [
            {
              filePath: "/v/runbooks/auth/login.md",
              vaultPath: "/v",
              unsaved: true,
            },
          ],
          activeTab: 0,
        },
        activePaneId: "p1",
        unsavedFiles: new Set(["/v/runbooks/auth/login.md"]),
      } as never);
      renderWithWorkspace(<TopBar {...baseProps} />, { vaultPath: "/v" });
      expect(screen.getByText("auth")).toBeInTheDocument();
      expect(screen.getByText("login.md")).toBeInTheDocument();
      expect(screen.getByTestId("dirty-indicator")).toBeInTheDocument();
    });
  });
});
