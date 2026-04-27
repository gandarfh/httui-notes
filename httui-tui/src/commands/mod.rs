//! Domain commands — the actual *operations* the user invokes (run
//! a DB query, EXPLAIN one, export results, etc.). The vim layer
//! (`vim::dispatch`, `vim::ex`) only does key/mode → action routing
//! and then delegates here.
//!
//! Why this split: `vim::dispatch` was accumulating DB integration
//! logic (cache hashing, mutation detection, schema lookups, EXPLAIN
//! wrapping) that has nothing to do with vim. Extracting it lets the
//! vim layer stay thin and lets the same operations be called from
//! other surfaces — ex commands, future menus, MCP — without having
//! to fish them out of a 2k-line dispatch file.
//!
//! Migration is incremental: only the SQL-domain helpers + the
//! `run_explain` entry point live here today. The bulk of
//! `apply_run_block` / `handle_db_block_result` / `spawn_db_query`
//! still lives in `vim::dispatch` and will move in a follow-up
//! session.

pub mod db;
