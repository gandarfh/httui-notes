// Fetches the vault's `git remote -v` list once on vault change.
// Powers Epic 49 `<SharePopover>` — copy-repo-URL flow needs the
// list of configured remotes (plus a "configured?" flag for the
// empty-state pill that links to workspace settings).
//
// One-shot vs polling: remotes change so rarely (manual git config
// edits) that polling is overkill. The hook exposes `refresh()` so
// the consumer can re-fetch after a remote add/remove operation.
//
// Idle when `vaultPath` is null (matches `useFileAutoCapture` /
// `useFileDocHeaderCompact` / `useGitStatus` posture).

import { useCallback, useEffect, useRef, useState } from "react";

import { gitRemoteList, type Remote } from "@/lib/tauri/git";

export interface UseGitRemotesResult {
  remotes: Remote[];
  loaded: boolean;
  error: string | null;
  refresh: () => void;
}

export function useGitRemotes(vaultPath: string | null): UseGitRemotesResult {
  const [remotes, setRemotes] = useState<Remote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const fetchOnce = useCallback(async () => {
    if (!vaultPath) {
      setRemotes([]);
      setLoaded(false);
      setError(null);
      return;
    }
    try {
      const next = await gitRemoteList(vaultPath);
      if (cancelledRef.current) return;
      setRemotes(next);
      setLoaded(true);
      setError(null);
    } catch (e) {
      if (cancelledRef.current) return;
      // No remotes is the empty-array case, not an error. Errors
      // here are real failures (vault path not a repo, IPC dead,
      // etc.) — surface to the consumer for diagnostics.
      setRemotes([]);
      setLoaded(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [vaultPath]);

  useEffect(() => {
    cancelledRef.current = false;
    void fetchOnce();
    return () => {
      cancelledRef.current = true;
    };
  }, [fetchOnce]);

  const refresh = useCallback(() => {
    void fetchOnce();
  }, [fetchOnce]);

  return { remotes, loaded, error, refresh };
}
