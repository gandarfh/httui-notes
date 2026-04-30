import { describe, expect, it } from "vitest";

import { GitPanel } from "@/components/layout/git/GitPanel";
import type { CommitInfo, GitStatus } from "@/lib/tauri/git";
import { renderWithProviders, screen } from "@/test/render";

function status(over: Partial<GitStatus> = {}): GitStatus {
  return {
    branch: "main",
    upstream: "origin/main",
    ahead: 0,
    behind: 0,
    changed: [],
    clean: true,
    ...over,
  };
}

function commit(over: Partial<CommitInfo> = {}): CommitInfo {
  return {
    sha: "deadbeef0000000000000000000000000000aaaa",
    short_sha: "deadbee",
    author_name: "Jane Doe",
    author_email: "jane@x.test",
    timestamp: Math.floor(Date.now() / 1000) - 30,
    subject: "first commit",
    ...over,
  };
}

describe("GitPanel", () => {
  it("shows loading state when status is null", () => {
    renderWithProviders(<GitPanel status={null} commits={[]} />);
    expect(screen.getByTestId("git-panel").getAttribute("data-loading")).toBe(
      "true",
    );
  });

  it("renders the three sections when status resolves", () => {
    renderWithProviders(<GitPanel status={status()} commits={[commit()]} />);
    expect(screen.getByTestId("git-status-header")).toBeInTheDocument();
    expect(
      screen.getByTestId("git-panel-section-working-tree"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("git-panel-section-log")).toBeInTheDocument();
  });

  it("flags clean working tree via data-clean", () => {
    renderWithProviders(<GitPanel status={status()} commits={[]} />);
    expect(screen.getByTestId("git-panel").getAttribute("data-clean")).toBe(
      "true",
    );
  });

  it("forwards changed files into the file list", () => {
    renderWithProviders(
      <GitPanel
        status={status({
          clean: false,
          changed: [
            { path: "a", status: "M.", staged: false, untracked: false },
          ],
        })}
        commits={[]}
      />,
    );
    expect(screen.getByTestId("git-file-row-a")).toBeInTheDocument();
  });

  it("forwards commits into the log list", () => {
    renderWithProviders(<GitPanel status={status()} commits={[commit()]} />);
    expect(screen.getByTestId("git-log-row-deadbee")).toBeInTheDocument();
  });

  it("renders empty file-list and empty log-list when both are empty", () => {
    renderWithProviders(<GitPanel status={status()} commits={[]} />);
    expect(screen.getByTestId("git-file-list-empty")).toBeInTheDocument();
    expect(screen.getByTestId("git-log-list-empty")).toBeInTheDocument();
  });
});
