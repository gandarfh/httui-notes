//! Tauri commands for the file-backed vault config stores.
//!
//! Epic 09 ships these as **foundation only** — the desktop frontend
//! still reads/writes through the legacy `app_config` SQLite path
//! until epic 19 (settings split) cuts over. Wiring the commands now
//! lets epic 19 swap the frontend in a single, low-risk PR.
//!
//! Stores are constructed per call: `WorkspaceStore::new(vault_path)`
//! for the vault-anchored workspace file, `UserStore::from_default_path()`
//! for the per-machine user file. The mtime cache inside each store
//! buys nothing across one-shot calls, but the surface stays simple
//! and correct; the long-lived `Arc<Store>` cache pattern arrives with
//! the cutover in epic 19.

use httui_core::vault_config::gitignore::{ensure_local_overrides_in_gitignore, GitignoreOutcome};
use httui_core::vault_config::migration::{run_migration, MigrationOptions, MigrationReport};
use httui_core::vault_config::user::UserFile;
use httui_core::vault_config::user_store::default_user_config_path;
use httui_core::vault_config::workspace::WorkspaceDefaults;
use httui_core::vault_config::{UserStore, WorkspaceStore};
use sqlx::sqlite::SqlitePool;
use std::path::PathBuf;

#[tauri::command]
pub async fn get_workspace_config(vault_path: String) -> Result<WorkspaceDefaults, String> {
    let store = WorkspaceStore::new(vault_path);
    store.defaults().await
}

#[tauri::command]
pub async fn set_workspace_config(
    vault_path: String,
    defaults: WorkspaceDefaults,
) -> Result<(), String> {
    let store = WorkspaceStore::new(vault_path);
    store.set_defaults(defaults).await
}

#[tauri::command]
pub async fn get_user_config() -> Result<UserFile, String> {
    let store = UserStore::from_default_path()?;
    store.load().await
}

#[tauri::command]
pub async fn set_user_config(file: UserFile) -> Result<(), String> {
    let store = UserStore::from_default_path()?;
    store.replace(file).await
}

/// Ensure the vault's `.gitignore` carries the canonical block of
/// `*.local.toml` patterns (ADR 0004). Idempotent. Used by the
/// "Open / Clone / Create vault" flow (epic 17) and surfaced as a
/// "fix it" button in the UI when an already-cloned vault is detected
/// without our entries.
#[tauri::command]
pub async fn ensure_vault_gitignore(vault_path: String) -> Result<GitignoreOutcome, String> {
    let path = PathBuf::from(vault_path);
    ensure_local_overrides_in_gitignore(&path).map_err(|e| format!("ensure gitignore: {e}"))
}

/// Migrate the MVP SQLite-backed vault to the v1 file layout (Epic
/// 12 / audit-005). Migrates `connections` and `environments` +
/// `env_variables`. Prefs migration is part of Epic 19's settings
/// split.
///
/// The Tauri command is the only entry point; there is no CLI flag
/// in v1. Set `dry_run = true` to preview without writing.
#[tauri::command]
pub async fn migrate_vault_to_v1(
    pool: tauri::State<'_, SqlitePool>,
    vault_path: String,
    dry_run: bool,
) -> Result<MigrationReport, String> {
    let user_path = default_user_config_path()?;
    let opts = MigrationOptions {
        dry_run,
        backup: true,
        user_config_path: user_path,
    };
    let path = PathBuf::from(vault_path);
    run_migration(&pool, &path, &opts).await
}

#[cfg(test)]
mod tests {
    //! Tauri commands deliberately stay thin — they construct the store,
    //! delegate, and return. The substantive logic (cache, normalize,
    //! atomic write, XDG resolution) is covered exhaustively in
    //! `httui_core::vault_config::{workspace_store, user_store}` tests.
    //!
    //! These tests cover only what the wrappers themselves add: that
    //! the right store is constructed and that the round-trip through
    //! the wrapper preserves data.

    use super::*;
    use std::path::PathBuf;
    use tempfile::TempDir;

    fn temp_xdg() -> (TempDir, PathBuf) {
        let dir = TempDir::new().unwrap();
        let path = dir.path().to_path_buf();
        (dir, path)
    }

    #[tokio::test]
    async fn workspace_round_trip_via_commands() {
        let (_dir, vault) = temp_xdg();
        let vault_str = vault.to_string_lossy().into_owned();

        let initial = get_workspace_config(vault_str.clone()).await.unwrap();
        assert!(initial.environment.is_none());

        set_workspace_config(
            vault_str.clone(),
            WorkspaceDefaults {
                environment: Some("staging".into()),
                git_remote: Some("origin".into()),
                git_branch: Some("main".into()),
            },
        )
        .await
        .unwrap();

        let after = get_workspace_config(vault_str).await.unwrap();
        assert_eq!(after.environment.as_deref(), Some("staging"));
        assert_eq!(after.git_remote.as_deref(), Some("origin"));
        assert_eq!(after.git_branch.as_deref(), Some("main"));
    }

    #[tokio::test]
    async fn ensure_vault_gitignore_creates_then_idempotent() {
        let (_dir, vault) = temp_xdg();
        let vault_str = vault.to_string_lossy().into_owned();
        let first = ensure_vault_gitignore(vault_str.clone()).await.unwrap();
        assert_eq!(first, GitignoreOutcome::Created);
        let second = ensure_vault_gitignore(vault_str).await.unwrap();
        assert_eq!(second, GitignoreOutcome::AlreadyPresent);
        assert!(vault.join(".gitignore").exists());
    }

    #[tokio::test]
    async fn workspace_get_returns_defaults_when_missing() {
        let (_dir, vault) = temp_xdg();
        let vault_str = vault.to_string_lossy().into_owned();
        let d = get_workspace_config(vault_str).await.unwrap();
        assert!(d.environment.is_none());
        assert!(d.git_remote.is_none());
        assert!(d.git_branch.is_none());
    }

    // `user_config` tests need to redirect `default_user_config_path`
    // to a tempdir. The function reads `XDG_CONFIG_HOME` / OS-native
    // dirs, so the test mutates `XDG_CONFIG_HOME` under a serial
    // mutex (mirrors the pattern in `user_store::tests`).

    static USER_ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    fn with_xdg<F: FnOnce()>(value: &str, f: F) {
        let _guard = USER_ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let prev = std::env::var("XDG_CONFIG_HOME").ok();
        std::env::set_var("XDG_CONFIG_HOME", value);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(f));
        match prev {
            Some(v) => std::env::set_var("XDG_CONFIG_HOME", v),
            None => std::env::remove_var("XDG_CONFIG_HOME"),
        }
        if let Err(e) = result {
            std::panic::resume_unwind(e);
        }
    }

    #[test]
    fn user_round_trip_via_commands() {
        let dir = TempDir::new().unwrap();
        let xdg = dir.path().to_string_lossy().into_owned();

        with_xdg(&xdg, || {
            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(async {
                // Empty file → defaults.
                let initial = get_user_config().await.unwrap();
                assert_eq!(initial.ui.theme, "system");

                // Replace with a tweaked file and read it back.
                let mut tweaked = initial.clone();
                tweaked.ui.theme = "dark".into();
                tweaked.ui.font_size = 13;
                set_user_config(tweaked).await.unwrap();

                let after = get_user_config().await.unwrap();
                assert_eq!(after.ui.theme, "dark");
                assert_eq!(after.ui.font_size, 13);
            });
        });
    }
}
