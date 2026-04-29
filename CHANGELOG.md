# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog 1.1](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] — pre-v1

httui has not been publicly released yet. The codebase on `main` is being
reworked toward v1; expect breaking changes between commits. The first
tagged release will be `v1.0.0`.

The list below tracks notable changes accumulated during the v1
foundation work (epics 00–37). The "v1 launch" line is reached once the
remaining items in the
[Definition of Done](docs-llm/v1/backlog/README.md#definition-of-done--v1)
checklist are green — primarily the React frontend cutover (Epic 19),
the signed/cross-platform release pipeline (Epics 34–35), and the final
launch checklist (Epic 38, Story 03).

### Added

- **File-backed configuration** — connections, environments and the
  per-machine UI prefs now live in plain TOML files (vault root +
  `~/.config/httui/user.toml`), not in `notes.db`. SQLite is retained as
  cache and for ephemeral session state only. (Epics 06–12)
- **Local overrides** — every committed `*.toml` config file accepts a
  sibling `*.local.toml` that deep-merges over the base on read; writes
  always target the base file. The vault's `.gitignore` auto-includes
  the `*.local.toml` block. (Epic 10, ADR 0004)
- **File watcher** — the desktop app watches `connections.toml`,
  `envs/*.toml`, `.httui/workspace.toml` and `~/.config/httui/user.toml`
  via `notify`; external edits invalidate the in-process cache and
  emit a Tauri event. (Epic 11)
- **Vault migration tooling** — Tauri command `migrate_vault_to_v1`
  walks the legacy SQLite tables and writes the v1 file layout. Backs
  up `notes.db` first; idempotent on re-run; supports a dry-run
  preview. (Epic 12, see [`docs/MIGRATION.md`](docs/MIGRATION.md))
- **Secret backend abstraction** — `SecretBackend` trait with a
  `Keychain` default impl plus a parser for `{{keychain:…}}` markers in
  TOML. Slot for future `1Password` / `Stronghold` / `pass` impls.
  (Epic 13)
- **Vault open / scaffold / validate** — `open_vault`,
  `scaffold_vault`, `check_is_vault` Tauri commands; first-run flow
  for empty directories writes the v1 skeleton (`runbooks/`,
  `connections.toml`, `envs/`, `.httui/`, `.gitignore`). (Epic 17)
- **First-run missing-secrets scan** — `first_run_missing_secrets`
  Tauri command lists keychain markers referenced by the vault that
  have no value on this machine, so the UI can prompt for batch entry.
  (Epic 18)
- **Settings split foundation** — `user.toml` (per-machine prefs)
  vs. `.httui/workspace.toml` (vault defaults) split, with the seven
  legacy `app_config` UI keys promoted to the new schema. Schema
  bump shipped; UI restructure deferred to a frontend session. (Epic 19)
- **Git panel backend** — `httui_core::git` shells out to `git` for
  status, log, branch, fetch, pull, push and remote inspection;
  exposed through Tauri commands ready for the panel UI to consume.
  (Epic 20)
- **Codebase reorganization** — desktop app moved into
  `httui-desktop/`, marketing landing into `httui-web/`, chat sidecar
  into `httui-sidecar/`. Shared logic lives in `httui-core/`. The TUI,
  MCP server and chat sidecar all read the same vault on disk.
  (Epic 00)
- **Quality gates** — pre-push and CI gate every modified `.rs`/`.ts`/
  `.tsx` file at ≤600 production lines and ≥80% line coverage on the
  file as a whole; ESLint warnings for `complexity`,
  `max-lines-per-function`, `max-params`, `max-depth` baseline
  recorded. (Epic 04.5, Epic 04)
- **OSS readiness docs** — README, CONTRIBUTING, SECURITY,
  CODE_OF_CONDUCT, LICENSE plus `docs/ARCHITECTURE.md`, four ADRs
  and user-facing `docs/concepts.md` + `docs/blocks.md`.
  (Epics 01, 36, 37)

### Changed

- **Editor stack** — TipTap rich-text editor and the legacy "E2E"
  block were removed; the editor is now CodeMirror 6 only. Block
  panels (HTTP, DB) mount via React portals into CM6 widget DOM.
- **State management** — most React Contexts replaced by Zustand
  stores (pane, chat, workspace, environment, settings,
  schemaCache). Only `WorkspaceContext` survives.
- **Editor content storage** — moved from React state into a
  module-level `Map` to avoid re-renders on every keystroke; unsaved
  files tracked in a module-level `Set` for the same reason.
- **Performance — large HTTP response bodies** — body viewer is now a
  read-only CodeMirror `EditorView` with language picked from
  `Content-Type`, replacing the older `<pre dangerouslySetInnerHTML>`
  + `lowlight` render that blocked the webview on multi-MB bodies.
- **Performance — HTTP body memory cap** — the executor refuses to
  buffer past 100 MB and returns a `[body_too_large]` placeholder.
- **HTTP block — V1 timing** — `total_ms` + `ttfb_ms` only;
  `dns_ms` / `connect_ms` / `tls_ms` and `connection_reused` deferred
  to V2 (would require swapping `reqwest` for `isahc`/libcurl; see
  `docs/http-timing-isahc-future.md`).
- **HTTP block — fenced-code-native storage format** — body is HTTP
  message text inside a ```http fence (info-string tokens `alias`,
  `timeout`, `display`, `mode`); legacy JSON-bodied blocks are parsed
  on read. (Epic 24)

### Removed

- **TipTap-based editor** and its custom vim-mode adapter — replaced
  by CodeMirror 6 with `@replit/codemirror-vim`. (commits 7aa97e8,
  0aa2868, 9124ad4)
- **E2E block type** — superseded by the HTTP block + run-history.
- **Web-app and Docker-self-host roadmap items** — explicitly out of
  scope for v1 (`docs-llm/v1/out-of-scope.md`); marketing landing
  copy trimmed to match.

### Fixed

- **Markdown serializer round-trip** — fenced code blocks for
  executable types (```http, ```db-*) survive the CM6 markdown
  parser/serializer cycle without corruption.
- **HTTP block — header validity** — invalid HTTP-token header names
  produce a clear error instead of `reqwest`'s generic `builder error`.
- **HTTP block — partial body on cancel** — `tokio::select!` observes
  the cancel token at every chunk in the body loop; cancelling
  mid-body returns a clean `Cancelled` chunk rather than partial bytes.
- **Chat — auto-save vs. MCP writes** — purely event-driven
  suppression of auto-save while a `update_note` tool call is
  in-flight, replacing the earlier timeout-based scheme.
- **File conflict banner** — files modified externally surface a
  banner with Reload / Keep Mine choices; auto-save is suppressed
  while the conflict is unresolved.

### Security

- **Connection passwords** stored in OS keychain by default, with a
  sentinel reference in storage; same applies to environment
  variables marked `is_secret`. Plaintext fallback only when the
  keychain is unavailable.
- **SQL block reference resolution** — `{{alias.response.path}}`
  references in SQL are always converted to bind parameters
  (`$1`, `?`); never string-interpolated. Closes the obvious
  injection vector for chained DB blocks.
- **Touch ID / Windows Hello protection** — design captured in
  Epics 14–15; **not yet shipped** — the implementations are
  blocked on real hardware testing. Until then, the keychain prompt
  in dev/unsigned builds is documented but accepted (see audit-008).

[Unreleased]: https://github.com/gandarfh/httui-notes/commits/main
