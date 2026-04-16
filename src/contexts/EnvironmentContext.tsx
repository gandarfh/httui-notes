import { createContext, useContext } from "react";
import type { Environment, EnvVariable } from "@/lib/tauri/commands";

export interface EnvironmentContextValue {
  environments: Environment[];
  activeEnvironment: Environment | null;
  managerOpen: boolean;
  openManager: () => void;
  closeManager: () => void;
  switchEnvironment: (id: string | null) => Promise<void>;
  createEnvironment: (name: string) => Promise<void>;
  deleteEnvironment: (id: string) => Promise<void>;
  duplicateEnvironment: (sourceId: string, newName: string) => Promise<void>;
  loadVariables: (environmentId: string) => Promise<EnvVariable[]>;
  setVariable: (environmentId: string, key: string, value: string) => Promise<EnvVariable>;
  deleteVariable: (id: string) => Promise<void>;
  getActiveVariables: () => Promise<Record<string, string>>;
}

export const EnvironmentContext = createContext<EnvironmentContextValue | null>(null);

export function useEnvironmentContext(): EnvironmentContextValue {
  const ctx = useContext(EnvironmentContext);
  if (!ctx) throw new Error("useEnvironmentContext must be used within EnvironmentProvider");
  return ctx;
}
