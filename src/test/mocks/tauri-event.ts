import { vi } from "vitest";

export const listen = vi.fn(async () => {
  return () => {};
});

export const emit = vi.fn(async () => {});
