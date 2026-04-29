import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { mockTauriCommand, clearTauriMocks } from "@/test/mocks/tauri";

import { EmptyVaultScreen } from "@/components/layout/EmptyVaultScreen";
import { useWorkspaceStore } from "@/stores/workspace";

// Stub the Tauri dialog plugin — the EmptyVaultScreen lazy-imports it.
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

import { open as openDialog } from "@tauri-apps/plugin-dialog";

beforeEach(() => {
  useWorkspaceStore.setState({
    vaultPath: null,
    vaults: [],
    entries: [],
  });
  clearTauriMocks();
  vi.mocked(openDialog).mockReset();
});

afterEach(() => {
  clearTauriMocks();
});

describe("EmptyVaultScreen", () => {
  it("renders the welcome heading and three CTAs", () => {
    renderWithProviders(<EmptyVaultScreen />);
    expect(
      screen.getByRole("heading", { name: /Welcome to httui notes/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("empty-vault-open")).toBeInTheDocument();
    expect(screen.getByTestId("em-branco-cta")).toBeInTheDocument();
  });

  it("Choose folder dispatches the workspace store openVault action", async () => {
    const user = userEvent.setup();
    // Spy on the store's openVault — exact wiring of the dialog
    // resolves elsewhere; this test only verifies the CTA is wired
    // to the right action.
    const spy = vi.fn();
    useWorkspaceStore.setState({ openVault: spy });

    renderWithProviders(<EmptyVaultScreen />);
    await user.click(screen.getByTestId("empty-vault-open"));

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("New vault scaffolds and switches into the new path", async () => {
    const user = userEvent.setup();
    vi.mocked(openDialog).mockResolvedValue("/tmp/fresh-vault");
    let scaffolded: string | null = null;
    mockTauriCommand("scaffold_vault", (args) => {
      scaffolded = (args as { vaultPath: string }).vaultPath;
      return {
        vault_path: scaffolded,
        created: ["connections.toml"],
        already_a_vault: false,
      };
    });
    mockTauriCommand("set_active_vault", () => null);
    mockTauriCommand("list_workspace", () => []);
    mockTauriCommand("start_watching", () => null);
    mockTauriCommand("rebuild_search_index", () => null);
    mockTauriCommand("stop_watching", () => null);

    renderWithProviders(<EmptyVaultScreen />);
    await user.click(screen.getByTestId("em-branco-cta"));

    await new Promise((r) => setTimeout(r, 10));
    expect(scaffolded).toBe("/tmp/fresh-vault");
    expect(useWorkspaceStore.getState().vaultPath).toBe("/tmp/fresh-vault");
  });

  it("New vault shows the error when scaffold rejects", async () => {
    const user = userEvent.setup();
    vi.mocked(openDialog).mockResolvedValue("/tmp/bad");
    mockTauriCommand("scaffold_vault", () => {
      throw new Error("permission denied");
    });

    renderWithProviders(<EmptyVaultScreen />);
    await user.click(screen.getByTestId("em-branco-cta"));

    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByTestId("empty-vault-error")).toBeInTheDocument();
    expect(screen.getByTestId("empty-vault-error").textContent).toContain(
      "permission denied",
    );
    expect(useWorkspaceStore.getState().vaultPath).toBeNull();
  });

  it("New vault is a no-op when the user cancels the picker", async () => {
    const user = userEvent.setup();
    vi.mocked(openDialog).mockResolvedValue(null);
    let scaffoldCalled = false;
    mockTauriCommand("scaffold_vault", () => {
      scaffoldCalled = true;
      return null;
    });

    renderWithProviders(<EmptyVaultScreen />);
    await user.click(screen.getByTestId("em-branco-cta"));

    await new Promise((r) => setTimeout(r, 10));
    expect(scaffoldCalled).toBe(false);
    expect(useWorkspaceStore.getState().vaultPath).toBeNull();
  });
});
