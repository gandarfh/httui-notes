// coverage:exclude file — pure invoke() wrappers + IPC types.
// See tech-debt.md "coverage opt-out" for the same rationale used
// in commands.ts.

import { invoke } from "@tauri-apps/api/core";

export interface GitFileChange {
  path: string;
  status: string;
  staged: boolean;
  untracked: boolean;
}

export interface GitStatus {
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  changed: GitFileChange[];
  clean: boolean;
}

export interface CommitInfo {
  sha: string;
  short_sha: string;
  author_name: string;
  author_email: string;
  /** Author timestamp as Unix seconds. */
  timestamp: number;
  subject: string;
}

export interface BranchInfo {
  name: string;
  current: boolean;
  remote: boolean;
}

export function gitStatus(vaultPath: string): Promise<GitStatus> {
  return invoke("git_status_cmd", { vaultPath });
}

export function gitLog(
  vaultPath: string,
  limit: number,
  pathFilter?: string,
): Promise<CommitInfo[]> {
  return invoke("git_log_cmd", {
    vaultPath,
    limit,
    pathFilter: pathFilter ?? null,
  });
}

export function gitDiff(
  vaultPath: string,
  commitSha?: string,
): Promise<string> {
  return invoke("git_diff_cmd", { vaultPath, commitSha: commitSha ?? null });
}

export function gitBranchList(vaultPath: string): Promise<BranchInfo[]> {
  return invoke("git_branch_list_cmd", { vaultPath });
}

export interface Remote {
  name: string;
  url: string;
}

export function gitRemoteList(vaultPath: string): Promise<Remote[]> {
  return invoke("git_remote_list_cmd", { vaultPath });
}

export function gitCheckout(vaultPath: string, branch: string): Promise<void> {
  return invoke("git_checkout_cmd", { vaultPath, branch });
}

export function gitCheckoutB(
  vaultPath: string,
  newBranch: string,
): Promise<void> {
  return invoke("git_checkout_b_cmd", { vaultPath, newBranch });
}
