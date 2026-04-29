// Debounced poll of `gitStatus(vaultPath)`. Every 2s while a vault
// is open; idles when `vaultPath` is null. Used by the workbench
// status bar (Epic 39 Story 02) and the future branch button data
// wiring.
//
// Returns `{ status, error, refresh }`:
// - `status` is `null` until the first successful poll, then the
//   most recent `GitStatus` snapshot.
// - `error` is the most recent failure (transient — the poll keeps
//   running and clears `error` on next success).
// - `refresh()` forces an immediate refetch (useful after a known
//   filesystem change like a save).

import { useEffect, useRef, useState, useCallback } from "react";

import { gitStatus, type GitStatus } from "@/lib/tauri/git";

export const GIT_STATUS_POLL_MS = 2000;

export interface UseGitStatusResult {
  status: GitStatus | null;
  error: string | null;
  refresh: () => void;
}

export function useGitStatus(vaultPath: string | null): UseGitStatusResult {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const fetchOnce = useCallback(async () => {
    if (!vaultPath) {
      setStatus(null);
      setError(null);
      return;
    }
    try {
      const next = await gitStatus(vaultPath);
      if (cancelledRef.current) return;
      setStatus(next);
      setError(null);
    } catch (e) {
      if (cancelledRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [vaultPath]);

  useEffect(() => {
    cancelledRef.current = false;
    if (!vaultPath) {
      setStatus(null);
      setError(null);
      return;
    }
    void fetchOnce();
    const id = setInterval(fetchOnce, GIT_STATUS_POLL_MS);
    return () => {
      cancelledRef.current = true;
      clearInterval(id);
    };
  }, [vaultPath, fetchOnce]);

  const refresh = useCallback(() => {
    void fetchOnce();
  }, [fetchOnce]);

  return { status, error, refresh };
}
