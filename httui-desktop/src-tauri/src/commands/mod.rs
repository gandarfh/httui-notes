//! Tauri command modules. Per audit-015 the per-domain split is
//! incremental — `vault_stores` is the first module; environments and
//! connections command modules follow as Phase 2/3 of Epic 19's
//! cutover land.

pub mod connections;
pub mod environments;
pub mod files;
pub mod schema;
pub mod vault_stores;
