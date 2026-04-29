//! Per-vault registry for `ConnectionsStore` and `EnvironmentsStore`.
//!
//! The desktop app supports vault switching at runtime; the file-backed
//! stores are vault-scoped (each holds an mtime cache rooted at one
//! `vault_root`). This registry caches a single set of stores per vault
//! path so cache hits survive across Tauri command calls without
//! re-reading TOML files.
//!
//! Lookup is keyed by the active-vault path resolved from
//! `app_config.active_vault` (SQLite). When the user switches vaults,
//! the next command call resolves to a different (or new) cache entry.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use tokio::sync::RwLock;

use httui_core::config::get_config;
use httui_core::vault_config::{
    user_store::default_user_config_path, ConnectionsStore, EnvironmentsStore,
};
use sqlx::sqlite::SqlitePool;

/// Pair of stores held together — they're always instantiated for the
/// same vault, and most callers want one or the other (rarely both).
#[derive(Clone)]
pub struct VaultStores {
    pub connections: Arc<ConnectionsStore>,
    pub environments: Arc<EnvironmentsStore>,
}

/// Registry of per-vault store pairs. Single instance lives in Tauri
/// state.
pub struct VaultStoreRegistry {
    cache: RwLock<HashMap<PathBuf, VaultStores>>,
}

impl VaultStoreRegistry {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            cache: RwLock::new(HashMap::new()),
        })
    }

    /// Resolve stores for the currently-active vault.
    ///
    /// Active vault is read from `app_config.active_vault` (the
    /// existing SQLite-backed key). Returns an error if no active
    /// vault is set — callers should surface this as "open a vault
    /// first".
    pub async fn for_active_vault(
        &self,
        pool: &SqlitePool,
    ) -> Result<VaultStores, String> {
        let vault_path = get_config(pool, "active_vault")
            .await
            .map_err(|e| format!("read active_vault: {e}"))?
            .ok_or_else(|| "No active vault — open a vault first".to_string())?;
        let vault_root = PathBuf::from(vault_path);
        self.for_vault(vault_root).await
    }

    /// Get-or-create cached stores for a specific vault path.
    pub async fn for_vault(&self, vault_root: PathBuf) -> Result<VaultStores, String> {
        // Fast path: already cached.
        {
            let cache = self.cache.read().await;
            if let Some(stores) = cache.get(&vault_root) {
                return Ok(stores.clone());
            }
        }

        // Slow path: instantiate once.
        let user_config = default_user_config_path()?;
        let stores = VaultStores {
            connections: ConnectionsStore::new(vault_root.clone()),
            environments: EnvironmentsStore::new(vault_root.clone(), user_config),
        };

        {
            let mut cache = self.cache.write().await;
            // Double-check in case another thread inserted between locks.
            cache.entry(vault_root).or_insert_with(|| stores.clone());
        }

        Ok(stores)
    }

    /// Drop cached stores for a vault — invoked when the user closes
    /// or switches away from a vault. Safe to call even if not cached.
    pub async fn invalidate_vault(&self, vault_root: &std::path::Path) {
        let mut cache = self.cache.write().await;
        cache.remove(vault_root);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn for_vault_caches_same_instance() {
        let registry = VaultStoreRegistry::new();
        let dir = TempDir::new().unwrap();
        let path = dir.path().to_path_buf();

        // First call instantiates.
        let s1 = registry.for_vault(path.clone()).await.unwrap();
        // Second call returns the cached instance.
        let s2 = registry.for_vault(path.clone()).await.unwrap();

        assert!(Arc::ptr_eq(&s1.connections, &s2.connections));
        assert!(Arc::ptr_eq(&s1.environments, &s2.environments));
    }

    #[tokio::test]
    async fn invalidate_drops_cached_stores() {
        let registry = VaultStoreRegistry::new();
        let dir = TempDir::new().unwrap();
        let path = dir.path().to_path_buf();

        let s1 = registry.for_vault(path.clone()).await.unwrap();
        registry.invalidate_vault(&path).await;
        let s2 = registry.for_vault(path.clone()).await.unwrap();

        // After invalidation we get a fresh instance, not the cached one.
        assert!(!Arc::ptr_eq(&s1.connections, &s2.connections));
    }

    #[tokio::test]
    async fn different_vaults_get_different_stores() {
        let registry = VaultStoreRegistry::new();
        let a = TempDir::new().unwrap();
        let b = TempDir::new().unwrap();

        let sa = registry.for_vault(a.path().to_path_buf()).await.unwrap();
        let sb = registry.for_vault(b.path().to_path_buf()).await.unwrap();

        assert!(!Arc::ptr_eq(&sa.connections, &sb.connections));
        assert!(!Arc::ptr_eq(&sa.environments, &sb.environments));
    }
}
