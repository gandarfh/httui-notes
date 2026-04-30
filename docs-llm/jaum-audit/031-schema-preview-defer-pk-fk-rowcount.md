# 031 — Schema preview defers PK/FK icons + row counts

**Date:** 2026-04-30 00:20
**Epic:** 42 — Connections refined UI
**Story:** 03 — Detail panel — schema preview

## Context

Story 03 task list calls for "table tree with PK/FK icons + row
counts". The shipped `<ConnectionDetailSchemaPreview>` component
omits both: it renders the table tree with column count + the
"Hot tables" top-N section, but no PK/FK chips and no row counts.

The reason: `httui_core::db::schema_cache::SchemaEntry` carries
only `(schema_name, table_name, column_name, data_type)`. There is
no `is_pk` / `is_fk` / `references` columns and no
`approximate_row_count`. Adding them requires:

1. Backend introspection-SQL changes per driver — a new query for
   PK/FK constraints + a `pg_class.reltuples` (postgres) /
   `information_schema.tables.table_rows` (mysql) /
   `pragma_table_info` (sqlite) lookup for row counts.
2. New columns on the `schema_cache` SQLite table (with
   migration `012_schema_cache_pk_fk_rowcount.sql`).
3. New struct fields on `SchemaEntry` + serialisation contract
   change for the Tauri `getCachedSchema` / `introspectSchema`
   commands.
4. Frontend `SchemaTable.columns[]` extension + cache eviction
   on schema change.

That's a multi-file backend change crossing migration + introspection
+ serialisation + frontend types — bigger than a Story 03 slice.

## Options considered

- **A** — Block Story 03 on the backend extension (do not ship
  the schema preview component until PK/FK + row counts are
  available).
- **B** — Ship the visual component now without PK/FK + row
  counts, defer those to a follow-up slice or to Epic 28
  (sidebar Schema tab — same data needs).
- **C** — Mock the data on the frontend (synthetic PK/FK chips
  hard-coded for testing). Not real; would mislead the user.

## Decision

Chose **B**. Rationale:

1. The visible payoff of Story 03 is the table tree + Hot tables
   section; PK/FK chips and row counts are progressive
   enhancement on the row, not the structural shape of the
   panel.
2. The same component is reused by Epic 28 (sidebar Schema tab)
   per the canvas reconciliation. Backend extensions land once
   for both surfaces.
3. Loop discipline — `feedback_follow_roadmap_order` says don't
   stack carry-slices indefinitely. The PK/FK + row count
   extension is a clean Story-of-its-own (call it Story 03a)
   that the user can prioritise against the rest of Epic 42 +
   Epic 28 work.

Trade-off accepted: the canvas mock shows tiny PK/FK chips next
to column names; today's render shows just the column name +
data type. Documented in the component's top-of-file comment.

## Reversibility

- Cost to undo: trivial.
- How: add the columns to `SchemaTable.columns[]`, render
  the chips in `ConnectionDetailSchemaPreview.TableNode`.
- When it would make sense to revert: when the backend extension
  ships (Story 03a or as part of Epic 28 prerequisites).

## Follow-ups

- [ ] tech-debt.md — add a "Schema introspection: PK/FK + row
      counts" entry with this audit as the pointer.
- [ ] Story 03a (or absorbed into Epic 28): backend introspection
      change + migration 012 + serialisation update +
      frontend rendering.
