# Security Model

## Data at Rest

### notes.db (SQLite — app data directory)

File permissions set to `0600` on Unix (owner read/write only).

| Data | Storage | Protection |
|------|---------|------------|
| Connection configs (host, port, driver, username, ssl_mode) | Plaintext in `connections` table | File permissions |
| Connection passwords | `__KEYCHAIN__` sentinel in DB, real value in OS keychain | Keychain + file permissions |
| Environment variable values (non-secret) | Plaintext in `env_variables` table | File permissions |
| Environment variable values (secret, `is_secret=1`) | `__KEYCHAIN__` sentinel in DB, real value in OS keychain | Keychain + file permissions |
| Block results cache | Plaintext in `block_results` table | File permissions |
| Chat messages | Plaintext in `messages` table | File permissions |
| Chat sessions | Plaintext in `sessions` table | File permissions |
| Tool permission rules | Plaintext in `tool_permissions` table | File permissions |
| Query audit log | Plaintext in `query_log` table (query truncated to 500 chars) | File permissions |
| App config (vim mode, etc.) | Plaintext in `app_config` table | File permissions |

### Keychain (OS-level)

Uses the `keyring` crate with service name `httui-notes`.

| Key format | Value |
|------------|-------|
| `conn:{connection_id}:password` | Database connection password |
| `env:{environment_id}:{variable_key}` | Secret environment variable value |

**Fail-secure behavior:** If the OS keychain is unavailable (headless server, no keyring daemon), password/secret storage operations return an error. The app does NOT fall back to plaintext storage.

## Data in Transit

### Tauri IPC (webview <-> Rust backend)

- `list_connections` returns `ConnectionPublic` DTO — password field replaced with `has_password: boolean`
- `list_env_variables` returns masked values — secret variable values replaced with empty string
- Database error messages are sanitized — connection URLs with credentials stripped, only database-level error messages exposed
- CSP policy restricts script sources to `'self'` (no inline scripts, no eval)
- Asset protocol scope restricted to `$APPDATA` and `$HOME` with deny list for `.ssh`, `.gnupg`, `.aws`, `.config/gcloud`
- Direct SQL execution permissions (`sql:allow-execute`, `sql:allow-select`) removed from capabilities — all DB access goes through custom Tauri commands

### Sidecar protocol (Rust <-> Node.js chat sidecar)

- NDJSON over stdin/stdout
- HMAC-SHA256 signed: shared secret generated per sidecar spawn, passed via `SIDECAR_HMAC_SECRET` environment variable
- Messages wrapped in `{"hmac": "...", "payload": {...}}` envelope
- Invalid HMAC causes message to be dropped with stderr warning

### MCP server (httui-mcp binary)

- Connection list exposes only `id`, `name`, `driver` — no host, port, username, or database_name
- `execute_block` validates note_path (no traversal, no absolute paths) and verifies alias exists in note
- Rate limited: max 30 `execute_block` calls per 60 seconds

## Query Execution Safety

| Protection | Threat | Implementation |
|-----------|--------|----------------|
| No multi-statement queries | SQL injection via `;` | `contains_multiple_statements()` rejects `;` outside strings/comments |
| No EXPLAIN ANALYZE mutations | EXPLAIN ANALYZE DELETE executes the DELETE | Blocked when combined with DELETE/UPDATE/INSERT/DROP/ALTER/TRUNCATE |
| Comment-aware placeholder normalization | `?` in `/* */` or `--` shifted params | `SqlScanner` tracks string/comment context |
| Bind value validation | Type confusion, out-of-range numbers | Rejects arrays, objects, numbers outside i64/f64 |
| Bind count validation | Mismatched placeholders vs values | `count_placeholders()` compared with `bind_values.len()` |
| Pool config validation | DoS via huge pool_size or zero timeout | Ranges: pool_size 1-100, timeout 100-300000ms, port 1-65535 |
| Fetch size/offset caps | OOM via unlimited fetch | max fetch_size=1000, max offset=1,000,000 |
| Mandatory query timeout | Runaway queries hang app | Per-query > connection `query_timeout_ms` > 30s fallback — always enforced |
| SSL default "prefer" | Unencrypted connections | New connections default to SSL "prefer" instead of "disable" |

## Connection String Safety

| Driver | Protection |
|--------|------------|
| PostgreSQL | `PgConnectOptions` builder API — special chars in password/host/db handled safely |
| MySQL | `validate_mysql_database_name()` rejects backticks, semicolons, null bytes; 64-char limit |
| SQLite | `validate_sqlite_path()` rejects `../`, relative paths; requires absolute path or `:memory:` |

## Block Reference Safety

| Protection | Threat |
|-----------|--------|
| Dangerous key blocklist | `__proto__`, `constructor`, `prototype` blocked in `navigateJson` (TS + Rust) |
| Dependency depth limit | MAX_DEPTH=50 in topological sort and recursive execution |
| Alias/env collision warning | Warning when block alias shadows environment variable name |

## Query Audit Log

- All executed queries logged to `query_log` table (both success and error)
- Query text truncated to 500 characters to bound storage
- Records: `connection_id`, `query`, `status` (success/error), `duration_ms`, `created_at`
- Retention: automatic cleanup every 30 minutes — entries older than 30 days or exceeding 50,000 rows are pruned

## Cache Integrity

- Block hash computed server-side: `SHA-256(content + "|env:" + environment_id + "|conn:" + connection_id)`
- Switching environment or connection produces different hash, invalidating stale cache
- Execution locks (`block_execution_locks` table) prevent TOCTOU race on concurrent block execution
- Permission broker requires user confirmation for `execute_block` via chat sidecar
