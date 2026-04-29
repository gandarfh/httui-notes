# ADR 0003 — File watcher contract

**Status:** Accepted
**Date:** 2026-04-29

## Context

httui v1 keeps configuration in files (ADR 0001). Those files can
change behind the app's back: `git pull`, manual edits in `$EDITOR`, a
teammate force-pushed and the user fast-forwarded, an external script
rewrote `connections.toml`. The frontend must learn about these changes
and reconcile them with in-app edits without trampling either side.

The MVP already has a `.md` watcher with a `ConflictBanner` reload/keep
flow. We extend the same idea to TOML config files.

## Decision

### Watch targets

The watcher tracks, per active vault:

- All `*.md` files inside the vault root (recursive)
- `connections.toml` at vault root
- `envs/*.toml` (any name)
- `envs/*.local.toml`
- `.httui/workspace.toml`

The user-level `~/.config/httui/user.toml` is **not** watched at runtime
— it's read on app start and on explicit "Reload settings" action.
Per-machine, single-writer.

### One watcher, glob-based

A single OS-level watcher (notify crate, recursive at vault root) emits
raw events. A dispatcher routes by path → category (md / connections /
env / workspace) → category-specific handler.

Rationale: per-file watchers don't scale (a vault can have hundreds of
`.md` files); separate watchers per category multiply syscalls.

### Debounce

250 ms after the last event of a given category, fire the handler.
Editors and git often emit a flurry of events for one logical change
(write `.tmp` → rename → fsync → mtime touch); coalescing avoids
spurious reloads.

The 250 ms is a *trailing* debounce — after the burst goes quiet for
250 ms, fire once. Don't lead-edge fire; the first event in a `git
pull` may not be the file the user cares about.

### Atomic write contract

When httui writes any watched file:

1. Write to `<file>.tmp` in the same directory
2. `fsync`
3. `rename` over `<file>` (atomic on POSIX; near-atomic on Windows via
   `MoveFileEx` with `MOVEFILE_REPLACE_EXISTING`)
4. Update the in-process "last known mtime" for the path to the
   post-rename mtime
5. Suppress watcher events for that path for 500 ms (the watcher *will*
   see our own write and we don't want to react to it)

Suppression is per-path, time-bounded. If suppression is still active
when an external write lands, the worst case is we miss an external
edit until the next watcher tick — acceptable; the conflict banner
catches it on the next user save.

### Conflict detection

Before any httui write to a watched file:

1. `stat` the file on disk
2. Compare its mtime with the last-known mtime captured the last time
   we read it
3. If on-disk mtime > last-known and the file content hash differs →
   **conflict**: do not write, surface ConflictBanner with
   reload/overwrite

For `.md` files this is the existing flow. For TOML, the flow is
identical but the banner copy says "configuration file modified
externally" and the reload action re-parses the TOML and rebroadcasts
the new state to subscribed stores.

### Handler responsibilities by category

| Category | On change |
|---|---|
| `*.md` | Existing flow: ConflictBanner if open, else silent reload |
| `connections.toml` | Re-parse, rebuild connections store, invalidate schema cache for changed connections |
| `envs/*.toml` (incl. `.local`) | Re-parse, rebuild env store; if changed env is active, broadcast var-set update |
| `.httui/workspace.toml` | Re-parse, update workspace defaults; if active env changed and the user didn't override, switch active env |

Schema-cache invalidation is conservative: only the connections whose
fields actually changed (host/port/db/user — anything affecting
connection identity) get their cached schema dropped.

### Cross-platform notes

- **macOS**: FSEvents via `notify::FsEventWatcher`. Recursive watch on
  vault root works. FSEvents coalesces aggressively, which the 250 ms
  debounce already accommodates.
- **Linux**: inotify. Recursive watch is *not native*; `notify` walks
  and registers per-directory. Limit `fs.inotify.max_user_watches`
  matters; document the bump (`sysctl fs.inotify.max_user_watches=524288`)
  in troubleshooting docs (epic 37).
- **Windows**: `ReadDirectoryChangesW` via `notify`. Recursive flag
  works. Renames across directories show as paired delete/create —
  handler treats them as such.

### Polling fallback

For pathological setups (network filesystems, sandboxed environments
where notify fails), `notify`'s `PollWatcher` is used as a fallback
when the native backend errors on init. Default poll interval: 5 s.
Surface a banner so the user knows they're on the slow path.

## Consequences

**Positive**
- One watcher = one thread, one event stream, one debounce loop —
  predictable.
- Atomic write + mtime check + suppression window covers the common
  races.
- Conflict UX reuses an already-validated pattern.
- Forward-compatible: adding a new watched category is a new
  dispatcher arm.

**Negative**
- Suppression window is heuristic; under heavy concurrent external
  writes during a httui write we can drop a notification. Mitigated
  by the next-write conflict check.
- Linux's recursive-watch quirks mean a very large vault can hit the
  inotify limit. Documented, not solved in code.

**Neutral**
- Polling fallback exists but is opt-in by failure detection. Users on
  sane setups never see it.
