import { vi } from "vitest";

const handlers: Record<string, (...args: unknown[]) => unknown> = {};

export function mockTauriCommand(cmd: string, handler: (...args: unknown[]) => unknown) {
  handlers[cmd] = handler;
}

export function clearTauriMocks() {
  for (const key of Object.keys(handlers)) {
    delete handlers[key];
  }
}

export const invoke = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
  const handler = handlers[cmd];
  if (handler) return handler(args);
  return undefined;
});
