import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, type RenderOptions } from "@testing-library/react";
import { vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import {
  WorkspaceContext,
  type WorkspaceContextValue,
} from "@/contexts/WorkspaceContext";

function Wrapper({ children }: { children: ReactNode }) {
  return <ChakraProvider value={defaultSystem}>{children}</ChakraProvider>;
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return render(ui, { wrapper: Wrapper, ...options });
}

export function makeWorkspaceStub(
  over: Partial<WorkspaceContextValue> = {},
): WorkspaceContextValue {
  return {
    vaultPath: "/v",
    vaults: [],
    entries: [],
    switchVault: vi.fn(async () => {}),
    openVault: vi.fn(async () => {}),
    inlineCreate: null,
    handleStartCreate: vi.fn(),
    handleCreateNote: vi.fn(async () => {}),
    handleCreateFolder: vi.fn(async () => {}),
    handleRename: vi.fn(async () => {}),
    handleDelete: vi.fn(async () => {}),
    handleMoveFile: vi.fn(async () => {}),
    cancelInlineCreate: vi.fn(),
    handleFileSelect: vi.fn(async () => {}),
    ...over,
  };
}

export function renderWithWorkspace(
  ui: ReactElement,
  workspaceOverrides: Partial<WorkspaceContextValue> = {},
  options?: Omit<RenderOptions, "wrapper">,
) {
  const value = makeWorkspaceStub(workspaceOverrides);
  function Wrap({ children }: { children: ReactNode }) {
    return (
      <ChakraProvider value={defaultSystem}>
        <WorkspaceContext.Provider value={value}>
          {children}
        </WorkspaceContext.Provider>
      </ChakraProvider>
    );
  }
  return { ...render(ui, { wrapper: Wrap, ...options }), workspace: value };
}

export * from "@testing-library/react";
