use anyhow::Result;
use clap::Parser;
use rmcp::{transport::stdio, ServiceExt};
use std::path::PathBuf;
use std::sync::Arc;

mod server;
mod tools;

#[derive(Parser)]
#[command(name = "httui-mcp", about = "MCP server for httui-notes")]
struct Args {
    /// Path to the vault directory
    #[arg(long)]
    vault: String,

    /// Path to the app database (defaults to ~/.local/share/com.httui.notes/notes.db)
    #[arg(long)]
    db: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    // All tracing goes to stderr — stdout is the MCP wire protocol
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_ansi(false)
        .init();

    let args = Args::parse();

    // Resolve database path
    let db_path = if let Some(ref db) = args.db {
        PathBuf::from(db)
    } else {
        httui_core::paths::default_data_dir()
            .map_err(|e| anyhow::anyhow!("resolve data dir: {e}"))?
    };

    // Initialize core services
    let pool = httui_core::db::init_db(&db_path)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to initialize database: {e}"))?;

    // ConnectionsStore is the file-backed lookup for the active vault
    // (Epic 19 Story 02 Phase 3 cutover).
    let conn_lookup = httui_core::vault_config::ConnectionsStore::new(args.vault.clone());
    let conn_manager = Arc::new(httui_core::db::connections::PoolManager::new_standalone(
        conn_lookup,
        pool.clone(),
    ));

    let mut registry = httui_core::executor::ExecutorRegistry::new();
    registry.register(Box::new(httui_core::executor::http::HttpExecutor::new()));
    registry.register(Box::new(httui_core::executor::db::DbExecutor::new(
        conn_manager.clone(),
    )));

    let server = server::NotesMcpServer::new(pool, conn_manager, Arc::new(registry), args.vault);

    let service = server.serve(stdio()).await?;
    service.waiting().await?;

    Ok(())
}
