# Technical debt — v1

Living tracker. Items get **picked off opportunistically** by the
epic that touches the area, plus two dedicated **sweep epics** (20a
storage, 30a UI) for cross-area review.

Categories are SOLID violations + concrete code smells. **Size alone is
not debt** — it's only a signal.

> **audit-012 update:** every item below now names the **specific
> epic + story** that retires it. Where the owner is "20a sweep",
> see `backlog/20a-storage-refactor-sweep.md` for the matching
> Story (rewritten with concrete Stories per item). Same for "30a".

---

## SRP — multiple responsibilities in one unit

### `httui-core/src/db/connections.rs` (2872 L) — CLOSED (Epic 20a Story 01)

**Closed by:** Epic 20a Story 01 across 8 commits:
- `a5019dd` — extract `db/pool_manager.rs` (PoolManager + StatusEmitter)
- `d7f57df` — extract `db/query_error.rs` (QueryErrorInfo + sanitize/enrich)
- `02ed418` — extract `db/sql_scanner.rs` (SqlScanner + split/normalize/count)
- `8a65d0e` — extract `db/pool.rs` (DatabasePool + create_pool + builders + validators)
- `e3874e6` — extract `db/pool_exec_sqlite.rs`
- `<6th>` — extract `db/pool_exec_pg.rs`
- `<7th>` — extract `db/pool_exec_mysql.rs`
- `<8th>` — move dispatcher (impl DatabasePool execute_query) + DTOs + validate_bind_values to pool.rs

connections.rs went from 2894 L → **403 production lines** (size-gate
passes). The remaining content is DTOs (`Connection`,
`ConnectionPublic`, `CreateConnection`, `UpdateConnection`),
`validate_connection_fields`, `row_to_connection`, and the legacy
SQLite CRUD funcs (`list_connections`, `get_connection`,
`create_connection`, `update_connection`, `delete_connection`) — the
last group is now used only by `SqliteLookup` test adapter. Their
removal is Phase 4 of Epic 19 cutover (drop migrated SQLite tables
+ dead-code cleanup).

### `ConnectionsStore` (`vault_config/connections_store.rs`) — CLOSED (Epic 20a Story 02)

Was 615 prod lines, opt-out of both size + coverage gates
(audit-002). Now 418 prod lines @ 89% coverage; both opt-outs
removed (commit `91aa030`).

**Closed by:** Epic 20a Story 02 across 4 commits:
- `cc94b64` — extract `vault_config/secret_resolver.rs` (keychain
  ref ↔ raw value plumbing; reused by `EnvironmentsStore`)
- `ec95328` — rewire `ConnectionsStore` to call into
  `secret_resolver`
- `048ebae` + `ba43729` — rewire `EnvironmentsStore` to call into
  `secret_resolver` + add 7 tests pushing env store from 67% → 96%
  coverage
- `91aa030` — extract `vault_config/connection_views.rs` (variant
  accessors + `to_public` + `to_legacy` + `ConnectionPublic` DTO);
  drop both opt-outs from `connections_store.rs`

**Carry-over:** Story 02 also planned a generic
`vault_config/cached_file.rs` shared across the three stores. Left
on the radar — pulling the shape into a generic adds type
complexity without reducing line count meaningfully (env store
caches a `BTreeMap`, the others a single entry). See Story 02
notes in the epic file.

`environments_store.rs` (was 619 L; now 434 prod L @ 96%) is
covered by the same Story; no separate item to close.

### `PoolManager` (inside `db/connections.rs`) — independent

Mixes: pool lifecycle + TTL eviction + query_log cleanup + status
emission. Refactor target: split eviction loop into separate task,
move `query_log` cleanup out (it isn't pool concern).

**Closed by:** Epic 20a Story 01 (same Story; PoolManager extracted into its own file with eviction + cleanup separated)

### `httui-desktop/src-tauri/src/main.rs` (1019 L → 534 L) — CLOSED (Epic 20a Story 05)

Was 1019 prod L with `// size:exclude file` (audit-002). Now 534
prod L; size opt-out removed.

**Closed by:** Epic 20a Story 05 across 4 commits:
- `c6ed277` — extract `commands/files.rs` (7 vault file commands)
- `ea95b1c` — extract `commands/schema.rs` (2 introspection cmds)
- `989512b` — extract `commands/settings.rs` (2 app_config cmds)
- `93913ea` — extract `commands/blocks.rs` (14 block commands +
  SharedDbExecutor / SharedHttpExecutor newtypes); drops the
  size:exclude opt-out

The `// coverage:exclude file` opt-out on main.rs stays — same
shape as the other Tauri-shell exclusions. A `commands/migration.rs`
extraction was scoped but not done because the migration command
isn't registered in main.rs today (audit-005 deferred Phase 4 to
Epic 19 cutover); picks up automatically when that lands.

---

## OCP — closed against extension

### `Connection` enum (10 variants) — CLOSED (Epic 20a Story 03)

Was: adding a variant (Sqlite was the last) forced touching every
`match` in `validate.rs`, `connections_store.rs`, conversion
helpers.

**Closed by:** Epic 20a Story 03 across 3 commits:
- `b65dcad` — `trait DbConnection` + 10 impls + `Connection::as_dyn()`
- `6399c5f` — `connection_views.rs` accessors delegate via `as_dyn()`
- `3f1299d` — `validate_connections_file` collapses to single
  trait dispatch; per-variant field checks moved onto each impl

Adding a new connection type now touches:
1. `vault_config/connections.rs` — new Config struct + Connection
   enum variant
2. `vault_config/connection_traits.rs` — new `impl DbConnection`
   block + 1 line in `Connection::as_dyn()` match

That's 2 files, both natural homes for connection-type definition.
`validate.rs`, `connection_views.rs`, `connections_store.rs`, and
all other consumers are untouched.

**Carry-over**: `pool_options()` on the trait migrates the
`db/pool.rs::create_pool` per-driver match. Belongs to Story 04
(DIP) since it ships alongside the `AppConfigSource` abstraction.

### Frontend has no `BlockRegistry`

CLAUDE.md openly calls this out: adding a new block type edits
`MarkdownEditor.tsx` (1087 L). Three coordinated touches every time
(file, CM6 extension, Portal mount).

**Target** — **Epic 30a Story 01**: build the registry — block types
register themselves with CM6 extension + Portal mount + slash command.
`MarkdownEditor.tsx` consumes the registry, no hand-wiring.

**Closed by:** Epic 30a Story 01

---

## ISP — fat interfaces

### `db::connections::Connection` DTO (17 fields)

Most callers use 3-4. The schema introspection caller wants
`(name, driver, host, port, database, user, password)`. The pool
builder wants `(driver, ssl_mode, timeout_ms, max_pool_size)`. The
status display wants `(name, last_tested_at)`. We pass the whole
struct everywhere.

**Target** — **Epic 20a Story 03 / 04** (audit-012 reroute):
the `trait DbConnection` migration replaces field access with method
calls; role-specific views fall out of the trait surface (`pool_options()`,
`secret_refs()`, `display_name()`).

**Closed by:** Epic 20a Story 03 + 04 (combined effect)

### Tauri `State<'_, SqlitePool>` everywhere

Commands take the pool directly, even when they only forward to a
function that wraps it. Couples every command to SQLite as the
config backend.

**Target** — **Epic 20a Story 04**: commands take
`State<'_, Arc<dyn AppConfigSource>>` or domain-specific state
(`State<'_, Arc<ConnectionsStore>>`).

**Closed by:** Epic 20a Story 04

---

## DIP — concrete-type dependencies

### `PoolManager::new(app_pool: SqlitePool, ...)` — CLOSED (086e7bd)

Direct dependency on SQLite.

**Closed by:** Epic 19 Story 02 Phase 3 (commit `086e7bd`).
`PoolManager::new_with_emitter` and `new_standalone` now take
`Arc<dyn ConnectionLookup>` (`db/lookup.rs`). The `app_pool` field
is retained only for `cleanup_query_log`; removing that final
SQLite tie is part of Epic 20a Story 01.

### Keychain coupling

`db::connections::create_connection` literally imports
`super::keychain::{conn_password_key, store_secret, KEYCHAIN_SENTINEL}`.
Hard binding to OS keychain.

**Target** — **Epic 13** introduced `trait SecretBackend` with
`Keychain` as default impl + parser for `{{keychain:…}}` markers
(commit `6d50998`). 1Password / Stronghold / pass impls slot in via
Epics 14-16 (blocked on hardware).

**Closed by:** Epic 13 (foundation done, commit 6d50998); follow-up
backends in 14/15/16 when hardware allows

---

## Code smells (orthogonal to SOLID)

### Strings as types — partially CLOSED (Epic 20a Story 07)

- ~~`driver: String` accepts `"weirdb"`~~ — closed by `enum DbDriver`
  in `httui-core/src/db/driver.rs` (commit `5b332f4`). Boundary
  parsing in `pool.rs::create_pool` and
  `connections_store.rs::build_connection_from_input` now goes
  through `DbDriver::from_str`.
- `theme: String`, `density: String` in `UserFile` — **deferred to
  Epic 40** (visual design system). The codebase intentionally
  accepts free-form themes (e.g. `high-contrast`); a strict enum
  would either break that or need a `#[serde(other)]` fallback.
  Epic 40 commits to a closed theme set; the enum migration ships
  there. See `audit-017`.

### Magic strings — partially CLOSED (Epic 20a Story 07)

- ~~Driver names hard-coded in 6+ files~~ — closed by `DbDriver`
  enum (commit `5b332f4`).
- ~~`"connections.toml"`, `"envs"`, `".httui"`, `"workspace.toml"`
  scattered~~ — closed by `vault_config/layout.rs` (commit
  `0a63001`). 5 callers migrated.
- `KEYCHAIN_SENTINEL = "__KEYCHAIN__"` — **carry-over**: still
  alive in legacy `db::connections` reads. Removal blocked on
  Epic 19 frontend cutover; fires automatically when the legacy
  SQLite path goes.

**Closed by:** Epic 20a Story 07 (driver + paths) + Epic 19
cutover (sentinel) + Epic 40 (theme/density)

### Error handling without structure — partially CLOSED (Epic 20a Story 06)

- ~~`.map_err(|e| e.to_string())` is the only available shape at
  the vault_config boundary~~ — closed by Epic 20a Story 06 (commit
  `4d93a6d`). `vault_config::error::{VaultConfigError,
  ConnectionsError}` now exist with `#[from]` impls, stable `code()`,
  and full unit-test coverage on the type surface.
- The `.map_err(|e| e.to_string())` call sites themselves persist —
  migrations are incremental (~58 functions in `vault_config/*` plus
  their Tauri command callers). New code reaches for the typed
  errors directly; legacy callers migrate when touched for other
  reasons.

**Closed by:** Epic 20a Story 06 (foundation); per-store migration
lands opportunistically.

### Inline business rules
- `validate_connection_fields` directly in CRUD module instead of
  validation layer
- Tauri command lambdas doing parsing + invocation + DTO conversion
  inline

**Target** — addressed implicitly by **Epic 20a Story 05**
(per-domain command modules absorb validation into
`commands/connections.rs` etc., away from CRUD).

**Closed by:** Epic 20a Story 05

### Frontend monoliths
- `HttpFencedPanel.tsx` (3.876 L) — 4 ESLint complexity hits
- `DbFencedPanel.tsx` (2.200 L) — 4 ESLint complexity hits
- `MarkdownEditor.tsx` (1087 L) — 1 hit; retired by BlockRegistry
- `cm-hybrid-rendering.ts` (4 hits) — one legitimate state machine,
  two extractable
- `AuditSection.tsx` (1065 L), `ThemeSection.tsx` (698 L) — pure UI but
  suspiciously big

**Target** — **Epic 30a Stories 02-05**: split monoliths,
extract sub-components, audit settings panels.

**Closed by:** Epic 30a Stories 02 (HttpFencedPanel), 03 (DbFencedPanel), 04 (ESLint cleanup), 05 (settings panel audit)

### Frontend other
- Prop drilling in `HttpFencedPanel.tsx` — addressed by Story 02 split
- `useEffect` chains for fetch logic that should be in query hooks
- Business logic in components instead of stores

**Target** — **Epic 30a Story 08** (audit + further splits as
findings dictate).

**Closed by:** Epic 30a Story 08

### `lib/tauri/commands.ts` 6-param call
- `saveBlockResult` is the single ESLint `max-params` hit; Tauri RPC
  signature mirrors the Rust command on the other side.

**Target** — **Epic 30a Story 07**: promote params to an object on
both sides; coordinate with Epic 20a if it touches the same command.

**Closed by:** Epic 30a Story 07

---

## ESLint complexity baseline (2026-04-29)

The frontend `eslint.config.js` adds four function-granularity rules
as **warnings**, mirroring the size-check pre-push gate at the file
level. Baseline sweep before turning the screws — these are the
warning counts as of today; Epic 30a is the cleanup window.

| Rule | Threshold | httui-desktop | httui-web |
|---|---|---|---|
| `max-lines-per-function` | 150 L | 35 | 6 |
| `complexity` | 15 (cyclomatic) | 30 | 0 |
| `max-depth` | 4 | 7 | 0 |
| `max-params` | 5 | 1 | 0 |
| **total** | | **73** | **6** |

Test files (`__tests__/`, `*.test.{ts,tsx}`, `*.spec.{ts,tsx}`,
`test/`) are excluded — long `describe(() => { ... })` arrows are
idiomatic vitest, not SRP debt. Mirrors the test exclusion in
`scripts/size-check.sh`.

Hot files (also already SRP debt above):
- `HttpFencedPanel.tsx` — 4 hits (already split target in Epic 30a)
- `MarkdownEditor.tsx` — 1 hit
- `AuditSection.tsx` — 1 hit
- `DbFencedPanel.tsx` — 4 hits (already split target)
- `cm-hybrid-rendering.ts` — 4 hits (CodeMirror extension; one
  legitimate state machine, two extractable)
- `lib/tauri/commands.ts:392` (`saveBlockResult`, 6 params) — the
  single `max-params` hit. Tauri RPC signature mirrors the Rust
  command; fix in Epic 30a (or earlier when the block-result
  caching gets revisited) by promoting the params to an object on
  both sides.
- `components/layout/editor-toolbar/blockCount.ts` (commit `05e27b2`,
  Epic 39 Story 03) — 3 `no-useless-assignment` ESLint **errors**
  (lines 27/41/48 — `currentExec` reassigned without subsequent
  read). Pre-existing; lint isn't part of the pre-push gate so it
  shipped. Cheap fix (drop the dead assignments). Pick up next time
  Epic 39 Story 03 is touched, or in Epic 30a Story 04 (ESLint
  cleanup).

**Why warn, not error**: ~90 hits today. Flipping to `error` would
either gate every PR touching the listed monoliths or trigger a wave
of `// eslint-disable-next-line` graffiti. Warnings stay visible
during code review; Epic 30a retires them in batch.

---

## Coverage debt

**Target rule**: every file modified in a commit must have ≥80%
coverage on the file as a whole. Enforced by `scripts/coverage-check.sh`
at pre-push and in CI (Epic 04.5).

Files currently below 80% (estimated; pending real measurement):

- `httui-core/src/db/connections.rs` — likely <40% (massive surface,
  mostly integration-style coverage)
- `httui-desktop/src-tauri/src/main.rs` — likely <30% (Tauri command
  shells, some not testable from Rust at all)
- Most chat-related code — heavy mocking required
- TUI `vim/*.rs` — frozen scope per `feedback_notes_app_focus`,
  exempt by virtue of not being touched

The gate handles this naturally: nothing forces coverage on legacy
files we don't edit. When we do edit them (refactor sweeps), they
must come up to 80% at the same time.

## Size debt

**Target rule**: every modified `.rs`/`.ts`/`.tsx` file must stay
≤600 production lines (Rust `mod tests` excluded). Enforced by
`scripts/size-check.sh` at pre-push and in CI.

Files over the limit today (no current opt-out — they only block on
touch):

- `httui-tui/src/vim/parser.rs` — 3595 L (frozen scope)
- `httui-tui/src/vim/dispatch.rs` — 3525 L (frozen scope)
- `httui-tui/src/commands/db.rs` — 2996 L
- `httui-core/src/db/connections.rs` — 2872 L (split scheduled in
  Epic 12 cutover and Epic 20a sweep)
- `httui-tui/src/ui/blocks.rs` — 2564 L
- `httui-core/src/executor/http/mod.rs` — 1690 L
- `httui-tui/src/sql_completion.rs` — 1685 L
- `httui-tui/src/vim/motions.rs` — 1506 L (frozen scope)
- `httui-tui/src/buffer/document.rs` — 1483 L
- `httui-desktop/src-tauri/src/main.rs` — 1013 L (split target in
  Epic 20a)
- `httui-desktop/src/components/blocks/http/fenced/HttpFencedPanel.tsx` —
  2597 L (split target in Epic 30a)

Files with a current `// size:exclude file` opt-out:

- `httui-tui/src/app.rs` (1748 prod L) — TUI app entrypoint, frozen
  scope per `feedback_notes_app_focus`. Sweep owner: Epic 31 (TUI
  parity, currently deferred). Justified in
  `docs-llm/jaum-audit/023-tui-app-rs-size-exclude.md`. Added during
  pre-push gate hygiene 2026-05-01.
- `httui-desktop/src/components/layout/connections/ConnectionForm.tsx`
  (631 prod L) — connection-form monolith; will be rewritten for the
  canvas-spec §5 Connections refined UI. Sweep owner: Epic 42.
  Justified in
  `docs-llm/jaum-audit/024-connection-form-size-exclude.md`. Added
  during pre-push gate hygiene 2026-05-01.

Files with a current `// coverage:exclude file` opt-out:

- `httui-desktop/src/components/editor/MarkdownEditor.tsx` (538 L) —
  audit-022; **closes by Epic 30a Story 01** (BlockRegistry refactor
  removes the integration-only test surface)
- `httui-core/src/db/pool_exec_pg.rs` (148 L) — async pg query
  execution; needs live Postgres pool. Audit-027 batch; **closes by
  Epic 32** (DB integration test harness).
- `httui-core/src/db/pool_exec_mysql.rs` (254 L) — async mysql query
  execution; needs live MySQL pool. Audit-027 batch; **closes by
  Epic 32**.
- `httui-core/src/db/pool_manager.rs` (196 L) — pool lifecycle + TTL
  eviction loop; coupled to live pools. Audit-027 batch; **closes
  by Epic 32**.
- `httui-core/src/db/schema_cache_remote.rs` (~50 L) — async
  Postgres + MySQL introspection wrappers (split out of
  `schema_cache.rs` so the pure mappers + SQLite path stay under
  the gate at 97.4%). Audit-028; **closes by Epic 32**.
  > `schema_cache.rs` was in the audit-027 opt-out list at 78%; now
  > 97.4% post-split (commits `225c6e3` extract pure mappers,
  > `<this commit>` extract async shells). Opt-out lifted there.

> `httui-desktop/src-tauri/src/main.rs` was excluded at 1019 prod
> lines (audit-002); Epic 20a Story 05 closed the split (commit
> `93913ea`) and removed the opt-out. Now 534 prod lines.
> `httui-core/src/vault_config/connections_store.rs` was excluded
> here at 615 prod lines (audit-002); Epic 20a Story 02 closed
> the split (commit `91aa030`) and removed both opt-outs.

Files with a current `// coverage:exclude file` opt-out:

- `httui-desktop/src-tauri/src/main.rs` — Tauri command shells +
  setup wiring with no extractable logic; substantive code lives in
  `httui-core` and per-domain modules. Removed in Epic 17 / 20a.
- `httui-desktop/src/lib/tauri/commands.ts` — pure `invoke()`
  wrappers + IPC types. Reviewed in Epic 19 (settings split) once
  the frontend cuts over to the new vault_config commands.
- `httui-desktop/src/lib/tauri/git.ts` — same shape as commands.ts:
  pure `invoke()` wrappers + IPC types for the Epic 20 git panel.
  Substantive logic lives in `httui_core::git` (tested at 100%).
  Reviewed in Epic 30a (UI sweep) once the panel UI lands.
- `httui-desktop/src-tauri/src/fs/watcher.rs` — thread-driven OS-level
  FS watcher (notify crate event loop + Tauri emit calls). Pure
  classification logic lives in `httui_core::vault_config::watch_paths`
  at 100% coverage. Integration test harness scheduled for Epic 32.
  Justified in `docs-llm/jaum-audit/004-watcher-rs-coverage-exclude.md`.
- `httui-desktop/src-tauri/src/commands/environments.rs` — Tauri command
  shells (delegating to `EnvironmentsStore`). Substantive logic
  (file-backed CRUD, atomic write, secret resolution) covered at >80%
  in `httui_core::vault_config::environments_store`. Pure helpers
  (`make_var_id` / `parse_var_id`) tested in-module. Justified in
  `docs-llm/jaum-audit/016-env-commands-coverage-exclude.md`.
  Retires when Epic 20a Story 05 lands the per-domain command harness.
- `httui-desktop/src-tauri/src/commands/connections.rs` — same shape
  (Tauri command shells delegating to `ConnectionsStore`).
  Substantive logic (file-backed CRUD + `to_legacy` resolution)
  covered at >80% in `httui_core::vault_config::connections_store`.
  Pure helpers (`to_wire`, `to_port`) tested in-module with 6 tests.
  Same retirement schedule as the environments shell (Epic 20a Story 05).
- `httui-desktop/src-tauri/src/commands/files.rs` — Tauri command
  shells (`list_workspace`, `read_note`, `write_note`,
  `create_note`, `delete_note`, `rename_note`, `create_folder`)
  delegating to `crate::fs::*`. Substantive logic covered in the
  fs module tests. Same retirement schedule as the other two
  shells. Justified in
  `docs-llm/jaum-audit/018-files-commands-coverage-exclude.md`.

---

## Tooling

### `scripts/coverage-check.sh` — FE lcov path mismatch

**Symptom**: any commit touching only frontend files
(`httui-desktop/src/**.tsx`) reports MISSING coverage even when
tests cover the file.

**Cause**: vitest writes lcov SF lines as `src/components/...` (paths
relative to the `httui-desktop/` cwd it ran from). The gate diffs
`git diff --name-only` (paths relative to repo root, e.g.
`httui-desktop/src/components/...`). The match in `extract_coverage`
never finds a hit.

**Fix shape (~10 lines)**: in the awk inside `extract_coverage`,
also try `t` with the `httui-desktop/` prefix stripped before
comparing against `sf`.

**Closed by**: TBD — opportunistic, next FE-touching iteration. See
`docs-llm/jaum-audit/020-coverage-gate-fe-path-mismatch.md`.

## How items get retired

1. **Opportunistic**: epic touches an area → splits + tests as part
   of that epic's story 01 (always Story 01, before any feature work)
2. **Sweep**: dedicated epic (20a, 30a) reviews previously-touched
   areas + adjacencies + applies DIP + types
3. **Greenfield**: epic adds new area → SOLID by construction; no
   debt accrues

When an item lands in a commit, mark it **closed** here with the
commit hash. We treat `tech-debt.md` like a CHANGELOG — the date and
sha are the record.

---

## Closed items (with commits)

- **SRP — `db/connections.rs` (2894 L → 403 prod)** — closed by
  Epic 20a Story 01 across 8 commits (`a5019dd`, `d7f57df`,
  `02ed418`, `8a65d0e`, `e3874e6`, `1c8bacd`, `3387db1`, `a07e744`).
  Split into `db/pool.rs`, `db/pool_manager.rs`,
  `db/query_error.rs`, `db/sql_scanner.rs`,
  `db/pool_exec_sqlite.rs`, `db/pool_exec_pg.rs`,
  `db/pool_exec_mysql.rs`. Each <600 L. Size-gate passes.
- **SRP — `vault_config/connections_store.rs` (615 prod opt-out → 418 prod / 89% cov)** —
  closed by Epic 20a Story 02 across 4 commits (`cc94b64`,
  `ec95328`, `048ebae`+`ba43729`, `91aa030`). Extracted
  `vault_config/secret_resolver.rs` (shared with `EnvironmentsStore`)
  and `vault_config/connection_views.rs` (variant accessors +
  `to_public` + `to_legacy` + `ConnectionPublic` DTO). Both
  size + coverage opt-outs removed.
- **OCP — `Connection` enum 10-variant shotgun match** — closed by
  Epic 20a Story 03 across 3 commits (`b65dcad` trait + 10 impls +
  `as_dyn`, `6399c5f` connection_views delegation, `3f1299d`
  validate_connections_file collapse). New connection types touch
  2 files instead of 4-5. `connection_traits.rs` 269 prod L @ 89%
  cov; `validate.rs` 313 → 246 prod L @ 98% cov.
- **Code smells — `driver: String` + scattered path strings** —
  partially closed by Epic 20a Story 07 across 2 commits
  (`0a63001` `vault_config/layout.rs` constants; `5b332f4`
  `db/driver.rs` `enum DbDriver` + dispatch migration in
  `pool.rs::create_pool` + `connections_store.rs::
  build_connection_from_input`). Theme/Density enum migration
  deferred to Epic 40 (audit-017); `KEYCHAIN_SENTINEL` removal
  carried to Epic 19 frontend cutover.
- **SRP — `httui-desktop/src-tauri/src/main.rs` (1019 prod L → 534
  prod L)** — closed by Epic 20a Story 05 across 4 commits
  (`c6ed277` files.rs, `ea95b1c` schema.rs, `989512b` settings.rs,
  `93913ea` blocks.rs). 25 Tauri commands extracted; size:exclude
  opt-out (audit-002) removed. coverage:exclude stays — same
  rationale as other Tauri-shell exclusions.
- **Code smell — error handling without structure (foundation)** —
  closed by Epic 20a Story 06 (commit `4d93a6d`).
  `vault_config::error::{VaultConfigError, ConnectionsError}`
  shipped with `#[from]` impls (io::Error / toml::de::Error /
  toml::ser::Error), stable `code()` namespace (VC-001..VC-009 +
  CN-001..CN-003), and 9 unit tests pinning the codes. Per-store
  `Result<_, String>` migration carries forward as opportunistic
  follow-up.
- **DIP — `PoolManager::new(SqlitePool)`** — closed by Epic 19
  Story 02 Phase 3 (`086e7bd`). Trait `ConnectionLookup` decouples
  pool from storage backend.
- **Keychain coupling (foundation)** — closed by Epic 13
  (`6d50998`). `trait SecretBackend` introduced;
  `Keychain` is the default impl. Hardware-bound 1Password / Hello
  / Touch ID impls follow as Epics 14-16 unblock.
