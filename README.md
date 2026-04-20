# httui

**Your API docs, alive.**

A desktop markdown editor with a runtime inside. Write the doc, hit run, ship the proof.

[Website](https://httui.com) | [Releases](https://github.com/gandarfh/httui-notes/releases) | [Architecture](docs/ARCHITECTURE.md)

## What is httui?

httui collapses four tools into one markdown file:

| Before | With httui |
|--------|-----------|
| Document APIs in Notion | Docs that execute |
| Test requests in Postman | Requests next to the docs |
| Query the DB in DBeaver | SQL in the same file |
| Chain calls in a shell script | Blocks reference blocks |

Everything serializes to standard `.md` files. Read them in vim, diff them in git, open them in Obsidian.

## Features

**Executable blocks** — HTTP requests, SQL queries, and E2E test flows live inline in your markdown as fenced code blocks.

**Block references** — `{{create-user.response.id}}` lets blocks reference each other. Dependencies execute automatically in the right order. DAG by construction, no cycles possible.

**Database support** — Postgres, MySQL, SQLite with schema-aware autocomplete. SQL references become bind parameters, never string-interpolated.

**E2E testing** — Chain HTTP calls, extract variables between steps, assert status and JSON shape. See which step failed and why.

**Environments** — Key-value variables resolved with `{{KEY}}` syntax. Secret values encrypted via OS keychain.

**AI assistant** — Claude agent with MCP tools that reads, searches, and modifies your notes. Every write stops at a permission prompt with side-by-side diff.

**Multi-pane editor** — Binary tree layout with tabs, drag-drop reordering, split views.

**Vim mode** — Custom TipTap extension with motions that navigate ProseMirror textblocks.

**Full-text search** — FTS5 index in SQLite. Quick-open (`Cmd+P`) and content search (`Cmd+Shift+F`).

**Result caching** — Results cached by content hash. Rerun only what changed.

## Tech stack

| Layer | Technology |
|-------|-----------|
| Runtime | Tauri v2 (Rust) |
| Frontend | React + TypeScript + Vite |
| Editor | TipTap + CodeMirror |
| UI | Chakra UI v3 + Emotion |
| Storage | SQLite (SQLx) + filesystem (.md) |
| Search | FTS5 |
| AI | Claude Agent SDK via Node.js sidecar |
| Secrets | OS keychain (keyring crate) |

## Getting started

Download the latest release from [Releases](https://github.com/gandarfh/httui-notes/releases), point at a folder of markdown, type `/http`. That's the onboarding.

### Building from source

```bash
# Prerequisites: Rust, Node.js 20+

# Development
make dev

# Production build
make build

# Tests
npm run test                       # Frontend
cd src-tauri && cargo test         # Backend
```

## Security

- Passwords and secret environment variables are encrypted via the OS keychain. SQLite only stores a sentinel value.
- SQL block references are always converted to bind parameters — zero string interpolation.
- Chat AI writes require explicit user permission with diff review.

## License

MIT

## Author

[João Ferreira](https://github.com/gandarfh)
