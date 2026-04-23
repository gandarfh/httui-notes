/**
 * Cancel-aware DB block execution over a Tauri Channel.
 *
 * Stage 3 of the DB block redesign: this module wires the new
 * `execute_db_streamed` / `cancel_block` Rust commands. Today's UI
 * still uses the synchronous `execute_block` path; the streamed API
 * lands here so stage 5 can swap it in without landing plumbing at
 * the same time as toolbar/drawer work.
 */

import { Channel, invoke } from "@tauri-apps/api/core";

import type { DbResponse } from "@/components/blocks/db/types";
import { normalizeDbResponse } from "@/components/blocks/db/types";

/** Backend-emitted chunk on the execution channel. */
export type DbChunk =
  | { kind: "complete"; results: unknown[]; messages: unknown[]; stats: { elapsed_ms: number; rows_streamed?: number | null }; plan?: unknown }
  | { kind: "error"; message: string }
  | { kind: "cancelled" };

/** Terminal outcome of a streamed execution. */
export type StreamedExecutionOutcome =
  | { status: "success"; response: DbResponse }
  | { status: "error"; message: string }
  | { status: "cancelled" };

export interface ExecuteDbStreamedOptions {
  /** Arbitrary string unique across in-flight executions. Used by `cancelBlockExecution`. */
  executionId: string;
  /** Validated DB block params (connection_id, query, etc.). */
  params: Record<string, unknown>;
  /**
   * Optional abort signal. When aborted, sends `cancel_block(executionId)` to
   * the backend. The backend responds with a `{kind: "cancelled"}` chunk.
   */
  signal?: AbortSignal;
}

/**
 * Run a DB query against the cancel-aware backend. Resolves with the final
 * outcome; intermediate chunks (once the executor is cursor-based in stage 6)
 * can be observed by subscribing to the returned `Channel` instead.
 */
export async function executeDbStreamed(
  options: ExecuteDbStreamedOptions,
): Promise<StreamedExecutionOutcome> {
  const { executionId, params, signal } = options;

  if (signal?.aborted) {
    // Consumer aborted before we even started — don't bother the backend.
    return { status: "cancelled" };
  }

  const channel = new Channel<DbChunk>();

  const outcome = new Promise<StreamedExecutionOutcome>((resolve) => {
    channel.onmessage = (chunk) => {
      switch (chunk.kind) {
        case "complete":
          resolve({
            status: "success",
            response: normalizeDbResponse(chunk),
          });
          break;
        case "error":
          resolve({ status: "error", message: chunk.message });
          break;
        case "cancelled":
          resolve({ status: "cancelled" });
          break;
      }
    };
  });

  const onAbort = () => {
    void cancelBlockExecution(executionId);
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    await invoke<void>("execute_db_streamed", {
      params,
      executionId,
      onChunk: channel,
    });
  } catch (e) {
    signal?.removeEventListener("abort", onAbort);
    // The backend command itself failed (validation, pool unavailable). Return
    // an error outcome rather than rejecting — streamed API resolves with a
    // tagged outcome for a single consumer path.
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }

  const result = await outcome;
  signal?.removeEventListener("abort", onAbort);
  return result;
}

/**
 * Signal cancellation for an in-flight execution by id. Returns `true` if
 * the backend found the execution in its registry; `false` if it had
 * already finished.
 */
export function cancelBlockExecution(executionId: string): Promise<boolean> {
  return invoke<boolean>("cancel_block", { executionId });
}
