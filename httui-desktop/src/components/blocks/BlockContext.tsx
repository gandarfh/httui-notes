import { createContext, useContext } from "react";

interface BlockContextValue {
  filePath: string;
}

const BlockContext = createContext<BlockContextValue>({ filePath: "" });

export const BlockContextProvider = BlockContext.Provider;

export function useBlockContext() {
  return useContext(BlockContext);
}
