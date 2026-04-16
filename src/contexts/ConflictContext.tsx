import { createContext, useContext } from "react";

export interface ConflictContextValue {
  hasConflict: (filePath: string) => boolean;
  resolveConflict: (filePath: string, action: "reload" | "keep") => Promise<void>;
}

export const ConflictContext = createContext<ConflictContextValue | null>(null);

export function useConflictContext(): ConflictContextValue | null {
  return useContext(ConflictContext);
}
