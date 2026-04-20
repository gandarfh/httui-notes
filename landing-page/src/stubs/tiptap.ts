// Stub for @tiptap/core — only used for type re-exports in ExecutableBlock.ts
export function mergeAttributes(...args: Record<string, unknown>[]) {
  return Object.assign({}, ...args);
}

export const Node = {
  create(config: unknown) {
    return config;
  },
};
