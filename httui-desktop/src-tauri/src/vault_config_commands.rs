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

use httui_core::vault_config::user::UserFile;
use httui_core::vault_config::workspace::WorkspaceDefaults;
use httui_core::vault_config::{UserStore, WorkspaceStore};

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
    async fn workspace_get_returns_defaults_when_missing() {
        let (_dir, vault) = temp_xdg();
        let vault_str = vault.to_string_lossy().into_owned();
        let d = get_workspace_config(vault_str).await.unwrap();
        assert!(d.environment.is_none());
        assert!(d.git_remote.is_none());
        assert!(d.git_branch.is_none());
    }

    // The `user_config` commands depend on `default_user_config_path`
    // which reads `XDG_CONFIG_HOME` / OS-native dirs. We can't safely
    // mutate those globals from a Tauri command test (would leak into
    // sibling tests). The XDG resolver itself is covered in
    // `user_store::tests`, and the persist/load logic is covered there
    // too — these wrappers are pure delegation.
}
