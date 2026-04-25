use anyhow::Result;
use clap::Parser;
use rmcp::{ServiceExt, transport::stdio};
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

    let conn_manager = Arc::new(httui_core::db::connections::PoolManager::new_standalone(
        pool.clone(),
    ));

    let mut registry = httui_core::executor::ExecutorRegistry::new();
    registry.register(Box::new(httui_core::executor::http::HttpExecutor::new()));
    registry.register(Box::new(httui_core::executor::db::DbExecutor::new(
        conn_manager.clone(),
    )));
    registry.register(Box::new(httui_core::executor::e2e::E2eExecutor::new()));

    let server = server::NotesMcpServer::new(
        pool,
        conn_manager,
        Arc::new(registry),
        args.vault,
    );

    let service = server.serve(stdio()).await?;
    service.waiting().await?;

    Ok(())
}

