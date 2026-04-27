/**
 * Shared types and helpers for the DB fenced-block UI.
 *
 * Lives next to DbFencedPanel.tsx so the sub-components extracted from it
 * (DbToolbar, DbStatusBar, etc.) can import without pulling the whole
 * panel module.
 */

export type ExecutionState =
  | "idle"
  | "running"
  | "success"
  | "error"
  | "cancelled";

/** Format an elapsed-time number as `123ms` or `1.23s`. */
export function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** Round a relative timestamp into a "ran X ago" string. */
export function formatRelativeTime(from: number, now: number): string {
  const seconds = Math.round((now - from) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/** Lightweight type guard used by result-tab views. */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
