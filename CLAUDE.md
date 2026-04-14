# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Notes — desktop markdown editor with executable blocks (HTTP client, DB query runner, E2E test runner) inline in documents. Built with Tauri v2 (Rust backend) + React + TypeScript + TipTap + CodeMirror + Chakra UI v3.

## Commands

```bash
# Development
make dev                           # Run app in dev mode (frontend HMR + backend rebuild)
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

- UI components use Chakra UI v3 with Emotion. Use Chakra primitives (Box, Flex, HStack, Menu, Dialog, etc.) and semantic tokens (bg, fg, border). Snippets in `src/components/ui/`. Use `onSelect` (not `onClick`) for `Menu.Item`. Consult the Chakra MCP tools for component examples.
- Do NOT use Chakra `Dialog.Root` for popups that need to return focus to the editor — use `Portal` + `Box` instead. The Dialog focus trap prevents ProseMirror from receiving keyboard input after closing.
- Tauri IPC uses `invoke()` from `@tauri-apps/api/core`. Frontend wrappers live in `src/lib/tauri/`.
- Passwords and env variable values are encrypted via OS keychain (Tauri keychain plugin), never stored in plaintext.
- Markdown serialization preserves fenced code blocks for executable blocks (```http, ```db-*, ```e2e) — they must survive roundtrip through the TipTap parser/serializer.

## Frontend architecture (hooks + contexts)

**AppShell** is a thin composition layer (~100 lines) that wires hooks and context providers:

**Hooks** (`src/hooks/`):
- `usePaneState` — pane layout tree, tab management, editor content store (module-level Map)
- `useVault` — vault path, file tree, switchVault, openVault
- `useFileOperations` — CRUD (create/rename/delete notes and folders)
- `useEditorSession` — file open, auto-save (1s debounce), markdown conversion
- `useKeyboardShortcuts` — global Cmd+B/P/S/W/Tab/\ shortcuts
- `useSidebarResize` — drag-to-resize sidebar
- `useSessionPersistence` — startup restore + save-on-change via single `restore_session` IPC call
- `useFileSearch` / `useContentSearch` / `useEscapeClose` — search modal logic

**Contexts** (`src/contexts/`):
- `WorkspaceContext` — vault state + file operations + file select (consumed by Sidebar, FileTree, TopBar, QuickOpen, SearchPanel)
- `PaneContext` — layout + actions + editor change (consumed by PaneContainer, PaneNode, StatusBar, FileTree)
- `EditorSettingsContext` — vim mode (consumed by PaneNode, StatusBar)

**Component structure:**
- `src/components/layout/file-tree/` — FileTree, FileTreeNode, InlineInput
- `src/components/layout/pane/` — PaneContainer, PaneNode, SplitView

## Multi-pane system

- Pane layout is a binary tree (`src/types/pane.ts`): each node is either a leaf (tabs + editor) or a split (horizontal/vertical with ratio). Each tab stores its `vaultPath` so tabs from different vaults coexist.
- State managed by `usePaneState` hook (`src/hooks/usePaneState.ts`). Editor contents stored in module-level `Map` outside React state.
- Session persistence via `restore_session` Rust command — single IPC call reads all configs, parses layout, reads file contents, and lists workspace in parallel. `list_workspace` filters `node_modules`, `target`, and other heavy directories.

## Vim mode

- Custom TipTap extension at `src/components/editor/vim/`. Toggle via StatusBar badge.
- Motions navigate by walking document textblocks (not DOM coordinates) — works with all ProseMirror node types.
- Normal mode blocks text input via `keypress` preventDefault + `beforeinput` handler.
- `j/k` find next/previous textblock by iterating positions in the ProseMirror document tree.

## Search

- Quick-open (`Cmd+P`): fuzzy file name search via Rust `search_files` with subsequence scoring.
- Full-text (`Cmd+Shift+F`): FTS5 index in SQLite, rebuilt on vault switch, `search_content` with snippet highlighting.
- Both use Portal-based panels (not Dialog) to avoid focus trap issues.

## Docs

- `docs/SPEC.md` — Full product specification (features, data models, Tauri commands, UI details).
- `docs/ARCHITECTURE.md` — Plugin architecture with code examples.
- `docs/backlog/` — Epics with stories and tasks. `README.md` has dependency graph and implementation order.
