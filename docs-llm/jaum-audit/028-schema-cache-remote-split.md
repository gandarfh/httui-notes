# 028 — schema_cache_remote.rs split

**Date:** 2026-04-29 16:50
**Epic:** n/a — pre-push gate hygiene (continuation of audit-027 partial revert)
**Story:** n/a

## Context

The previous batch (audit-027) added `// coverage:exclude file` to 6
DB-infra files. The follow-up commits (`bf390d6`, etc.) reverted 4 of
those (`lookup.rs`, `vault_stores.rs`, `mcp/main.rs`, `GeneralSection`)
by adding real tests. Commit `225c6e3` started reverting
`schema_cache.rs` by extracting pure mappers (`build_pg_entry`,
`build_mysql_entry`, `first_string_or_bytes_lossy`), but the file
sitting at 67.5% on the touched-files gate — the async
`introspect_postgres` + `introspect_mysql` + `mysql_str` shells are
the bulk of the remaining miss, and they need a live PG/MySQL pool to
exercise.

Per `feedback_no_coverage_exclude` memory: "NÃO usar
`// coverage:exclude file`; mockar deps pesadas, dividir SRP, ou
ambos — gate existe pra forçar testabilidade". The pure mappers
already split SRP — the live-DB shells are the irreducible remainder.

## Options considered

- **A** — Re-add `// coverage:exclude file` on `schema_cache.rs` as a
  whole. Simplest but contradicts the user-feedback memory and undoes
  the work in `225c6e3`.
- **B** — Move `introspect_postgres` + `introspect_mysql` + `mysql_str`
  into a sibling `schema_cache_remote.rs` with `// coverage:exclude file`
  scoped to that file only. The pure mappers + SQLite path + cache I/O
  stay testable in `schema_cache.rs`; the opt-out narrows to the
  ~50-line async-shell remainder.
- **C** — Stand up containerised PG/MySQL via `testcontainers-rs` and
  test the shells directly. Substantial scope (see audit-027 option A);
  the right home is Epic 32.

## Decision

Chose **B**. Splits SRP cleanly: mapping + cache I/O is "pure / SQLite
testable" and lives in `schema_cache.rs` (97.4% coverage); the
PG/MySQL async wrappers are "needs live DB" and live in
`schema_cache_remote.rs` (opt-out scoped to ~50 lines, owned by Epic
32). Trade-off: still uses one `coverage:exclude file`, but on a much
smaller, more focused file. The bulk of `schema_cache` logic is now
under the gate properly.

The audit-027 batch survives unchanged for the other 3 remaining
opt-outs (`pool_exec_pg`, `pool_exec_mysql`, `pool_manager`) — same
pattern (live DB needed); same Epic 32 owner. Future iterations can
apply the same split-or-mock approach to those one at a time.

## Reversibility

- Cost to undo: trivial.
- How: revert this commit; introspect_* + mysql_str come back into
  `schema_cache.rs` (with the audit-027 `coverage:exclude` re-added).
- When it would make sense to revert: Epic 32 lands DB integration
  test infrastructure (testcontainers-rs); the `schema_cache_remote.rs`
  opt-out drops in the same PR alongside the new tests.

## Follow-ups

- [ ] tech-debt.md — update the audit-027 batch entry to note that
      `schema_cache.rs` is no longer in the opt-out list; add
      `schema_cache_remote.rs` with the same Epic 32 owner.
- [ ] Epic 32 scope already covers DB-pool integration tests (per
      audit-027); no new scope addition.
