# Epic 16 — Database Security Hardening

> Security audit and hardening for all database-related functionality: connections, query execution, schema introspection, result handling, and MCP integration.

## Threat Model

| # | Threat | Vector | Severity | File(s) | Status |
|---|--------|--------|----------|---------|--------|
| T01 | PostgreSQL connection string injection | Password/host/db with special chars injected via format!() | CRITICAL | connections.rs:257-259 | Open |
| T02 | MySQL USE statement injection | Database name with backtick escape bypass | CRITICAL | connections.rs:338 | Open |
| T03 | SQLite path traversal | database_name with ../ to access arbitrary files | CRITICAL | connections.rs:271 | Open |
| T04 | Keychain fallback to plaintext | Keychain failure silently stores password in SQLite | CRITICAL | connections.rs:441-443 | Open |
| T05 | Password field in Connection DTO | list_connections returns password via Tauri IPC | CRITICAL | connections.rs:53-71, main.rs:277 | Open |
| T06 | Permission broker ignores DB operations | Sidecar can execute_block for DB without permission prompt | CRITICAL | permissions.rs:35-90 | Open |
| T07 | MCP execute_block unlimited access | No rate limiting or authorization on block execution via MCP | CRITICAL | httui-mcp/server.rs:151-162 | Open |
| T08 | Multi-statement SQL injection | Queries with `;` bypass subquery wrapping | HIGH | connections.rs:699,823,945 | Open |
| T09 | EXPLAIN ANALYZE executes mutations | `EXPLAIN ANALYZE DELETE` runs the DELETE | HIGH | connections.rs:640-651 | Open |
| T10 | Placeholder normalization ignores comments | `?` inside `/* */` or `--` gets converted, shifting params | HIGH | connections.rs:1061-1093 | Open |
| T11 | Pool not invalidated on connection update | Stale pool serves old config after update_connection | HIGH | connections.rs:480-557 | Open |
| T12 | Pool last_used not refreshed on cache hit | Cleanup evicts actively-used connections | HIGH | connections.rs:142-177 | Open |
| T13 | Number bind values silently coerced to string | Large numbers exceed i64/f64, bound as string | HIGH | connections.rs:780,903,1023 | Open |
| T14 | Error messages expose connection internals | sqlx errors may include connection URL with password | HIGH | connections.rs:321,347,357 | Open |
| T15 | Keychain resolution returns sentinel as value | `__KEYCHAIN__` string returned as variable value on failure | HIGH | environments.rs:40-45 | Open |
| T16 | HTTP/E2E blocks executable via MCP sidecar | Sidecar can make outbound HTTP requests via execute_block | HIGH | httui-mcp/server.rs:152 | Open |
| T17 | Block result cache has no access control | Any block can access cached results of any other block | HIGH | block_results.rs:37-66 | Open |
| T18 | Secrets exposed during environment duplicate | Keychain values resolved to plaintext during copy | HIGH | environments.rs:130-132 | Open |
| T19 | No fetch_size/offset cap on backend | API accepts arbitrary values, potential OOM/DoS | MEDIUM | executor/db/mod.rs:42-57 | Open |
| T20 | SSL mode defaults to disable | Remote connections unencrypted by default, downgrade possible | MEDIUM | connections.rs:256,292 | Open |
| T21 | Pool max_pool_size unchecked cast | i64 to u32 cast, 0 or negative causes DoS | MEDIUM | connections.rs:310-318 | Open |
| T22 | bind_values count vs placeholder count mismatch | Fewer binds silently use NULL, more are ignored | MEDIUM | executor/db/mod.rs:14, connections.rs:702 | Open |
| T23 | JSON array/object bind values coerced to string | Non-primitive types serialized as JSON string, type mismatch | MEDIUM | connections.rs:784,907,1027 | Open |
| T24 | Schema introspection no rate limiting | Rapid connection switching hammers target DB | MEDIUM | main.rs:94-110 | Open |
| T25 | Sidecar NDJSON protocol unsigned | Compromised sidecar can inject forged tool results | MEDIUM | protocol.rs:150-154 | Open |
| T26 | EnvVariable secrets returned unmasked via Tauri IPC | Frontend receives full secret values | MEDIUM | environments.rs:19, main.rs:364 | Open |
| T27 | MCP exposes connection metadata (user, host, port) | Sidecar can enumerate all configured databases | MEDIUM | httui-mcp/tools/connections.rs:9-24 | Open |
| T28 | Autocomplete exposes cached result structure | Column names from SELECT visible in dropdown | LOW | cm-autocomplete.ts:82-120 | Open |
| T29 | Environment variable keys visible in autocomplete | Secret key names like DATABASE_PASSWORD exposed | LOW | cm-autocomplete.ts:163-170 | Open |
| T30 | No query audit logging | No record of executed queries for incident investigation | LOW | Full execution path | Open |
| T31 | Block hash ignores environment/connection context | Cache returns stale results when env vars or connection change | HIGH | hash.ts:5-12, block_results.rs:20-26 | Open |
| T32 | Prototype pollution via JSON path navigation | `{{block.__proto__}}` accesses dangerous properties in navigateJson | HIGH | references.ts:74-79, references.rs:69-83 | Open |
| T33 | notes.db unencrypted and no file permissions | SQLite app DB readable by any same-user process | HIGH | db/mod.rs:20 | Open |
| T34 | Tauri IPC: 20 DB commands with no ACL/capabilities | Compromised webview (XSS) can call all DB commands | CRITICAL | main.rs (all DB commands) | Open |
| T35 | Block hash computed client-side, not server-side | Frontend can spoof hash to poison cache | HIGH | main.rs:59-67 (get_block_result) | Open |
| T36 | No recursion depth limit in dependency resolution | Deep block chain (100+) causes stack overflow DoS | MEDIUM | dependencies.ts:53-80, runner.rs:92-182 | Open |
| T37 | Env var shadowing via block alias | Block named same as secret env var intercepts resolution | MEDIUM | references.ts:139-181, references.rs:143-168 | Open |
| T38 | Concurrent block execution race condition (TOCTOU) | Same block executed twice simultaneously, mutations duplicated | MEDIUM | block_results.rs:14-35, dependencies.ts:126-206 | Open |

## Stories

### Story 16.1 — Secure Connection String Building
> Fix T01, T02, T03

**Tasks:**
- [ ] Postgres: replace format!() with PgConnectOptions builder API (like MySQL already uses MySqlConnectOptions)
- [ ] MySQL: use prepared statement or proper identifier escaping for USE statement, reject database names with backticks/semicolons
- [ ] SQLite: validate database_name path — resolve to absolute, reject path traversal (../), whitelist allowed base directories
- [ ] Add unit tests for injection attempts in connection creation

### Story 16.2 — Keychain Fail-Secure
> Fix T04, T15, T18

**Tasks:**
- [ ] On keychain store failure: return error instead of falling back to plaintext, surface warning to user
- [ ] On keychain resolve failure: return explicit error, not `__KEYCHAIN__` sentinel as the value
- [ ] Environment duplicate: verify keychain availability before duplicating secrets, re-encrypt each value
- [ ] Add integration test: simulate keychain failure, verify no plaintext storage

### Story 16.3 — Connection DTO Sanitization
> Fix T05, T14, T26, T27

**Tasks:**
- [ ] Create `ConnectionPublic` DTO without password field, use in list_connections Tauri response
- [ ] Sanitize database error messages: log full error server-side, return generic message to frontend
- [ ] Mask secret environment variable values in Tauri `list_env_variables` response (or add `masked: bool` parameter)
- [ ] MCP connections tool: remove username from response, keep only name/driver/id

### Story 16.4 — Permission Broker for Executors
> Fix T06, T07, T16

**Tasks:**
- [ ] Add `execute_block` to permission broker — require user confirmation for DB/HTTP/E2E execution from sidecar
- [ ] MCP execute_block tool: add rate limiting (max N calls per minute per connection)
- [ ] Restrict MCP execute_block to only execute blocks that exist in the current note (no arbitrary params)
- [ ] Add test: verify sidecar DB execution triggers permission prompt

### Story 16.5 — Query Execution Hardening
> Fix T08, T09, T10

**Tasks:**
- [ ] Reject multi-statement queries: detect `;` outside of string literals and comments, return error
- [ ] Restrict is_select detection: reject `EXPLAIN ANALYZE` with mutation keywords (DELETE/UPDATE/INSERT/DROP), reject `PRAGMA` with `=`
- [ ] Fix placeholder normalization: track `/* */` block comments and `--` line comments, skip `?` inside them
- [ ] Add fuzz tests: SQL injection attempts against subquery wrapping

### Story 16.6 — Connection Pool Lifecycle
> Fix T11, T12, T21

**Tasks:**
- [ ] Update `last_used` on every `get_pool()` cache hit, not only on cache miss
- [ ] Invalidate cached pool when `update_connection()` is called (add `PoolManager.invalidate(id)`)
- [ ] Validate pool config ranges: max_pool_size 1-100, timeout_ms 100-300000, port 1-65535
- [ ] Add test: update connection config, verify next query uses new pool

### Story 16.7 — Bind Parameter Safety
> Fix T13, T22, T23

**Tasks:**
- [ ] Reject JSON numbers outside safe integer range (> i64::MAX) instead of string fallback
- [ ] Reject non-primitive JSON bind values (arrays, objects) with explicit error
- [ ] Validate bind_values count matches `?` placeholder count in query (after comment stripping)
- [ ] Add test: oversized numbers, mismatched bind count, nested JSON values

### Story 16.8 — Input Validation & Rate Limiting
> Fix T19, T20, T24

**Tasks:**
- [ ] Add fetch_size cap: max 1000 in backend validation
- [ ] Add offset cap: max 1_000_000 in backend validation
- [ ] Change SSL default from "disable" to "prefer", add UI warning when "disable" is selected
- [ ] Debounce schema introspection: max 1 call per connection per 5 seconds

### Story 16.9 — Result Cache Isolation
> Fix T17

**Tasks:**
- [ ] Scope block result cache by vault path (already uses file_path, verify it's sufficient)
- [ ] Verify reference resolution only accesses blocks within the same document (DAG by construction — audit for edge cases)
- [ ] Consider encrypting cached results at rest (evaluate performance impact)

### Story 16.10 — Observability
> Fix T25, T28, T29, T30

**Tasks:**
- [ ] Add query audit log: table `query_log` with timestamp, connection_id, query (truncated to 500 chars), status, duration_ms
- [ ] Filter secret-flagged env variable keys from autocomplete suggestions (or show key without value)
- [ ] Add HMAC to sidecar protocol messages (shared secret established at sidecar spawn)
- [ ] Limit autocomplete depth for block results to 2 levels (prevent deep structure exposure)

### Story 16.11 — Tauri IPC Hardening
> Fix T34

**Tasks:**
- [ ] Implement Tauri v2 capabilities for all DB-related commands (execute_block, connections CRUD, env CRUD, schema)
- [ ] Add CSP policy in tauri.conf.json (currently `null`)
- [ ] Restrict asset protocol scope from `["**"]` to specific directories

### Story 16.12 — Cache Integrity
> Fix T31, T35, T38

**Tasks:**
- [ ] Include environment context + connection_id in block hash computation (hash.ts)
- [ ] Move hash computation server-side: backend computes SHA-256(file_path + content + connection_id + env_hash), frontend no longer passes hash
- [ ] Add atomic cache-check-and-execute to prevent TOCTOU race on concurrent block execution
- [ ] Add test: change env var, verify cache invalidated

### Story 16.13 — Reference Resolution Safety
> Fix T32, T36, T37

**Tasks:**
- [ ] Block dangerous property names in JSON path navigation: `__proto__`, `constructor`, `prototype` (both references.ts and references.rs)
- [ ] Add MAX_DEPTH=50 recursion limit in dependency resolution (dependencies.ts and runner.rs)
- [ ] Warn when block alias collides with environment variable name (or require `env:` prefix)
- [ ] Add test: prototype pollution attempt, deep chain DoS, alias/env collision

### Story 16.14 — App Database Protection
> Fix T33

**Tasks:**
- [ ] Set notes.db file permissions to 0600 on Unix after creation
- [ ] Evaluate SQLite encryption (sqlcipher or PRAGMA key) — benchmark performance impact
- [ ] Document security model: what's protected by keychain vs what's plaintext in notes.db

## Implementation Order

1. **Story 16.1** — Connection string injection (CRITICAL, easy wins with builder APIs)
2. **Story 16.11** — Tauri IPC hardening (CRITICAL, blocks XSS escalation)
3. **Story 16.4** — Permission broker for executors (CRITICAL, blocks MCP attack surface)
4. **Story 16.2** — Keychain fail-secure (CRITICAL, behavioral change)
5. **Story 16.3** — DTO sanitization (CRITICAL+HIGH, prevents info leaks)
6. **Story 16.5** — Query execution hardening (HIGH, prevents SQL injection variants)
7. **Story 16.12** — Cache integrity (HIGH, prevents stale/poisoned cache)
8. **Story 16.6** — Pool lifecycle (HIGH, prevents stale connection issues)
9. **Story 16.13** — Reference resolution safety (HIGH, prevents prototype pollution + DoS)
10. **Story 16.7** — Bind parameter safety (HIGH, prevents type confusion)
11. **Story 16.14** — App database protection (HIGH, protects data at rest)
12. **Story 16.8** — Input validation & rate limiting (MEDIUM, prevents DoS)
13. **Story 16.9** — Result cache isolation (HIGH, audit existing isolation)
14. **Story 16.10** — Observability (LOW-MEDIUM, long-term value)
