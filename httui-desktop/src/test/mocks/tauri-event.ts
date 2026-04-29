import { vi } from "vitest";

type Listener = (event: { payload: unknown }) => void;

const listeners: Record<string, Set<Listener>> = {};

export const listen = vi.fn(async (channel: string, handler: Listener) => {
  if (!listeners[channel]) listeners[channel] = new Set();
  listeners[channel].add(handler);
  return () => {
    listeners[channel]?.delete(handler);
  };
});

export const emit = vi.fn(async () => {});

/** Test helper: deliver a payload to all listeners on a channel synchronously. */
export function emitTauriEvent(channel: string, payload: unknown) {
  const set = listeners[channel];
  if (!set) return;
  for (const handler of set) {
    handler({ payload });
  }
}

/** Test helper: drop all listeners (call in afterEach to avoid cross-test bleed). */
export function clearTauriListeners() {
  for (const key of Object.keys(listeners)) {
    delete listeners[key];
  }
}
