# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Notes — desktop markdown editor with executable blocks (HTTP client, DB query runner, E2E test runner) inline in documents. Built with Tauri v2 (Rust backend) + React + TypeScript + TipTap + CodeMirror + daisyUI.

## Commands

```bash
# Development
cargo tauri dev                    # Run app in dev mode (frontend + backend)
npm run dev                        # Frontend only (Vite dev server)

# Build
cargo tauri build                  # Production build
npm run build                      # Frontend production build

# Backend tests
cd src-tauri && cargo test         # Run all Rust tests
cd src-tauri && cargo test <name>  # Run specific test

# Frontend tests
npm run test                       # Run all frontend tests
npm run test -- <pattern>          # Run specific test

# Lint
npm run lint                       # ESLint
cd src-tauri && cargo clippy       # Rust linter
```

## Architecture

Full details in `docs/ARCHITECTURE.md`. Key concepts:

**Plugin architecture (Open/Closed):** New block types are added as vertical slices without modifying existing code. Each block = TipTap node extension + React UI + Rust executor.

**Frontend layers:**
- `BlockRegistry` — dynamic registration of block types. Each block self-registers on import.
- `ExecutableBlockShell` — shared UI wrapper for all blocks (display modes, run button, states, caching).
- Block types extend `ExecutableBlock` TipTap node via `.extend()`, inheriting shared attributes (alias, displayMode, executionState).

**Backend layers:**
- `Executor` trait + `ExecutorRegistry` — dispatch by `block_type` string. One generic `execute_block` Tauri command routes to the right executor.
- Tauri `Channel<ExecutionEvent>` for real-time streaming from backend to frontend.

**Storage is dual:**
- Vault (filesystem) — `.md` files with YAML-serialized blocks in fenced code blocks. Users never see/edit YAML.
- SQLite (`notes.db`) — connections, environments, block result cache, app config, schema cache, FTS5 search index.

**SQL safety:** Block references in SQL (`{{alias.response.path}}`) are always converted to bind parameters (`$1`, `?`), never string-interpolated.

**Block references:** `{{alias.response.path}}` — blocks can only reference blocks above them in the document (DAG by construction). Resolution is recursive with caching.

## Key Conventions

- UI components use daisyUI classes (Tailwind plugin). Prefer daisyUI components (`btn`, `card`, `modal`, `badge`, `table`, `select`, etc.) over custom styles.
- Tauri IPC uses `invoke()` from `@tauri-apps/api/core`. Frontend wrappers live in `src/lib/tauri/`.
- Passwords and env variable values are encrypted via OS keychain (Tauri keychain plugin), never stored in plaintext.
- Markdown serialization preserves fenced code blocks for executable blocks (```http, ```db-*, ```e2e) — they must survive roundtrip through the TipTap parser/serializer.

## Docs

- `docs/SPEC.md` — Full product specification (features, data models, Tauri commands, UI details).
- `docs/ARCHITECTURE.md` — Plugin architecture with code examples.
- `docs/backlog/` — Epics with stories and tasks. `README.md` has dependency graph and implementation order.
