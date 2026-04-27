/**
 * Shared types and constants for the HTTP fenced-block UI.
 *
 * Lives next to HttpFencedPanel.tsx so the sub-components extracted from it
 * (HttpToolbar, HttpStatusBar, etc.) can import without pulling the whole
 * panel module.
 */

import type { HttpMethod } from "@/lib/blocks/http-fence";

export type ExecutionState =
  | "idle"
  | "running"
  | "success"
  | "error"
  | "cancelled";

export type SendAsFormat = "curl" | "fetch" | "python" | "httpie" | "http-file";

export const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: "green.500",
  POST: "blue.500",
  PUT: "orange.500",
  PATCH: "yellow.500",
  DELETE: "red.500",
  HEAD: "purple.500",
  OPTIONS: "gray.500",
};

export const MUTATION_METHODS: ReadonlySet<HttpMethod> = new Set([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);
