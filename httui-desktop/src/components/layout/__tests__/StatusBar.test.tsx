import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { mockTauriCommand, clearTauriMocks } from "@/test/mocks/tauri";

import { StatusBar } from "@/components/layout/StatusBar";
import { useEnvironmentStore } from "@/stores/environment";
import { useWorkspaceStore } from "@/stores/workspace";

vi.mock("@/lib/theme/apply", () => ({ applyTheme: vi.fn() }));

const mkEnv = (id: string, name: string) => ({
  id,
  name,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
});

beforeEach(() => {
  clearTauriMocks();
  mockTauriCommand("git_status_cmd", () => ({
    branch: "main",
    upstream: null,
    ahead: 0,
    behind: 0,
    changed: [],
    clean: true,
  }));
  useWorkspaceStore.setState({
    vaultPath: null,
    activeConnection: null,
  } as never);
  useEnvironmentStore.setState({
    activeEnvironment: null,
  } as never);
});

afterEach(() => {
  clearTauriMocks();
});

describe("StatusBar", () => {
  it("renders inside a 22px-tall mono shell", () => {
    renderWithProviders(<StatusBar />);
    const shell = screen.getByTestId("status-bar");
    expect(shell.getAttribute("data-atom")).toBe("statusbar");
  });

  it("shows '—' branch placeholder when no vault is open", () => {
    renderWithProviders(<StatusBar />);
    expect(screen.getByTestId("status-branch").textContent).toBe("—");
  });

  it("renders 'no env' when no active environment", () => {
    renderWithProviders(<StatusBar />);
    expect(screen.getByTestId("status-env").textContent).toContain("no env");
  });

  it("env Dot variant is err for prod*", () => {
    useEnvironmentStore.setState({
      activeEnvironment: mkEnv("a", "prod-canary"),
    } as never);
    renderWithProviders(<StatusBar />);
    const dot = screen
      .getByTestId("status-env")
      .querySelector('[data-atom="dot"]');
    expect(dot?.getAttribute("data-variant")).toBe("err");
  });

  it("env Dot variant is warn for staging", () => {
    useEnvironmentStore.setState({
      activeEnvironment: mkEnv("b", "staging"),
    } as never);
    renderWithProviders(<StatusBar />);
    const dot = screen
      .getByTestId("status-env")
      .querySelector('[data-atom="dot"]');
    expect(dot?.getAttribute("data-variant")).toBe("warn");
  });

  it("env Dot variant is ok for local-style names", () => {
    useEnvironmentStore.setState({
      activeEnvironment: mkEnv("c", "local"),
    } as never);
    renderWithProviders(<StatusBar />);
    const dot = screen
      .getByTestId("status-env")
      .querySelector('[data-atom="dot"]');
    expect(dot?.getAttribute("data-variant")).toBe("ok");
  });

  it("hides the connection cell when no connection is active", () => {
    renderWithProviders(<StatusBar />);
    expect(screen.queryByTestId("status-conn")).toBeNull();
  });

  it("renders the connection name + ok dot when a connection is active", () => {
    useWorkspaceStore.setState({
      vaultPath: null,
      activeConnection: { name: "pg-prod", status: "connected" },
    } as never);
    renderWithProviders(<StatusBar />);
    const cell = screen.getByTestId("status-conn");
    expect(cell.textContent).toContain("pg-prod");
    expect(
      cell.querySelector('[data-atom="dot"]')?.getAttribute("data-variant"),
    ).toBe("ok");
  });

  it("renders cursor position from props", () => {
    renderWithProviders(<StatusBar cursorLine={12} cursorCol={4} />);
    expect(screen.getByTestId("status-cursor").textContent).toBe(
      "Ln 12, Col 4",
    );
  });

  it("encoding is UTF-8 (static)", () => {
    renderWithProviders(<StatusBar />);
    expect(screen.getByTestId("status-encoding").textContent).toBe("UTF-8");
  });

  it("⚡ chained indicator hidden by default", () => {
    renderWithProviders(<StatusBar />);
    expect(screen.queryByTestId("status-chained")).toBeNull();
  });

  it("⚡ chained indicator visible when chained=true", () => {
    renderWithProviders(<StatusBar chained />);
    expect(screen.getByTestId("status-chained")).toBeInTheDocument();
  });

  it("renders the version pill", () => {
    renderWithProviders(<StatusBar />);
    expect(screen.getByTestId("status-version").textContent).toMatch(
      /^v[\w.-]+/,
    );
  });
});
