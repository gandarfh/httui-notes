//! Tauri commands wrapping `httui_core::git`. Thin delegators —
//! the panel UI calls these, the substantive logic lives in core.

use httui_core::git::{
    git_branch_list, git_diff, git_log, git_status, BranchInfo, CommitInfo, GitStatus,
};
use std::path::PathBuf;

/// `git status --porcelain=v2 --branch` for the vault.
#[tauri::command]
pub async fn git_status_cmd(vault_path: String) -> Result<GitStatus, String> {
    git_status(&PathBuf::from(vault_path))
}

/// `git log -n <limit>` for the vault, optionally filtered to a path.
#[tauri::command]
pub async fn git_log_cmd(
    vault_path: String,
    limit: usize,
    path_filter: Option<String>,
) -> Result<Vec<CommitInfo>, String> {
    git_log(&PathBuf::from(vault_path), limit, path_filter.as_deref())
}

/// `git show <sha>` (or `git diff HEAD` when sha is `None`).
#[tauri::command]
pub async fn git_diff_cmd(
    vault_path: String,
    commit_sha: Option<String>,
) -> Result<String, String> {
    git_diff(&PathBuf::from(vault_path), commit_sha.as_deref())
}

/// Local + remote branches for the vault.
#[tauri::command]
pub async fn git_branch_list_cmd(vault_path: String) -> Result<Vec<BranchInfo>, String> {
    git_branch_list(&PathBuf::from(vault_path))
}

#[cfg(test)]
mod tests {
    //! Smoke-tests only — `git` CLI behaviour is exhaustively
    //! covered in `httui_core::git::*::tests`. Here we just confirm
    //! the wrappers forward correctly.

    use super::*;
    use std::process::Command;
    use tempfile::TempDir;

    fn init_with_commit(dir: &TempDir) {
        let p = dir.path();
        let _ = Command::new("git").arg("init").arg(p).output();
        for (k, v) in [
            ("user.email", "t@t"),
            ("user.name", "t"),
            ("commit.gpgsign", "false"),
            ("init.defaultBranch", "main"),
        ] {
            let _ = Command::new("git")
                .arg("-C")
                .arg(p)
                .args(["config", k, v])
                .output();
        }
        std::fs::write(p.join("a"), "x").unwrap();
        let _ = Command::new("git")
            .arg("-C")
            .arg(p)
            .args(["add", "-A"])
            .output();
        let _ = Command::new("git")
            .arg("-C")
            .arg(p)
            .args(["commit", "-m", "init"])
            .output();
    }

    #[tokio::test]
    async fn status_round_trip() {
        let dir = TempDir::new().unwrap();
        init_with_commit(&dir);
        let s = git_status_cmd(dir.path().to_string_lossy().into())
            .await
            .unwrap();
        assert!(s.clean);
    }

    #[tokio::test]
    async fn log_round_trip() {
        let dir = TempDir::new().unwrap();
        init_with_commit(&dir);
        let l = git_log_cmd(dir.path().to_string_lossy().into(), 10, None)
            .await
            .unwrap();
        assert_eq!(l.len(), 1);
        assert_eq!(l[0].subject, "init");
    }

    #[tokio::test]
    async fn branches_round_trip() {
        let dir = TempDir::new().unwrap();
        init_with_commit(&dir);
        let b = git_branch_list_cmd(dir.path().to_string_lossy().into())
            .await
            .unwrap();
        assert!(b.iter().any(|x| x.name == "main"));
    }

    #[tokio::test]
    async fn diff_round_trip() {
        let dir = TempDir::new().unwrap();
        init_with_commit(&dir);
        let d = git_diff_cmd(dir.path().to_string_lossy().into(), None)
            .await
            .unwrap();
        // No working-tree changes after init.
        assert_eq!(d, "");
    }
}
