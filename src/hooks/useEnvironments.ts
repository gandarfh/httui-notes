import { useState, useCallback, useEffect } from "react";
import type { Environment, EnvVariable } from "@/lib/tauri/commands";
import {
  listEnvironments,
  createEnvironment as createEnvCmd,
  deleteEnvironment as deleteEnvCmd,
  duplicateEnvironment as duplicateEnvCmd,
  setActiveEnvironment as setActiveEnvCmd,
  listEnvVariables,
  setEnvVariable as setEnvVarCmd,
  deleteEnvVariable as deleteEnvVarCmd,
} from "@/lib/tauri/commands";

export function useEnvironments() {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [managerOpen, setManagerOpen] = useState(false);

  const activeEnvironment = environments.find((e) => e.is_active) ?? null;

  const refresh = useCallback(async () => {
    try {
      const envs = await listEnvironments();
      setEnvironments(envs);
    } catch {
      // silently fail on load
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const switchEnvironment = useCallback(
    async (id: string | null) => {
      await setActiveEnvCmd(id);
      await refresh();
    },
    [refresh],
  );

  const createEnvironment = useCallback(
    async (name: string) => {
      await createEnvCmd(name);
      await refresh();
    },
    [refresh],
  );

  const deleteEnvironment = useCallback(
    async (id: string) => {
      await deleteEnvCmd(id);
      await refresh();
    },
    [refresh],
  );

  const duplicateEnvironment = useCallback(
    async (sourceId: string, newName: string) => {
      await duplicateEnvCmd(sourceId, newName);
      await refresh();
    },
    [refresh],
  );

  const loadVariables = useCallback(
    async (environmentId: string): Promise<EnvVariable[]> => {
      return listEnvVariables(environmentId);
    },
    [],
  );

  const setVariable = useCallback(
    async (environmentId: string, key: string, value: string) => {
      return setEnvVarCmd(environmentId, key, value);
    },
    [],
  );

  const deleteVariable = useCallback(
    async (id: string) => {
      await deleteEnvVarCmd(id);
    },
    [],
  );

  const getActiveVariables = useCallback(async (): Promise<
    Record<string, string>
  > => {
    if (!activeEnvironment) return {};
    const vars = await listEnvVariables(activeEnvironment.id);
    const result: Record<string, string> = {};
    for (const v of vars) {
      result[v.key] = v.value;
    }
    return result;
  }, [activeEnvironment]);

  return {
    environments,
    activeEnvironment,
    managerOpen,
    openManager: () => setManagerOpen(true),
    closeManager: () => setManagerOpen(false),
    switchEnvironment,
    createEnvironment,
    deleteEnvironment,
    duplicateEnvironment,
    loadVariables,
    setVariable,
    deleteVariable,
    getActiveVariables,
    refresh,
  };
}
