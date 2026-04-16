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

**Block references:** `{{alias.response.path}}` — blocks can only reference blocks above them in the document (DAG by construction). Resolution priority: block reference > environment variable (if alias collides with env var, block wins). Environment variables use the same syntax without dots: `{{ENV_KEY}}` resolves from the active environment.

## Key Conventions

- UI components use Chakra UI v3 with Emotion. Use Chakra primitives (Box, Flex, HStack, Menu, Dialog, etc.) and semantic tokens (bg, fg, border). Snippets in `src/components/ui/`. Use `onSelect` (not `onClick`) for `Menu.Item`. Consult the Chakra MCP tools for component examples.
- Do NOT use Chakra `Dialog.Root` for popups that need to return focus to the editor — use `Portal` + `Box` instead. The Dialog focus trap prevents ProseMirror from receiving keyboard input after closing.
- Tauri IPC uses `invoke()` from `@tauri-apps/api/core`. Frontend wrappers live in `src/lib/tauri/`.
- Passwords and sensitive env variable values are encrypted via OS keychain (`keyring` crate). Sentinel value `__KEYCHAIN__` stored in SQLite, real value in keychain. Fallback to plaintext if keychain unavailable.
- Markdown serialization preserves fenced code blocks for executable blocks (```http, ```db-*, ```e2e) — they must survive roundtrip through the TipTap parser/serializer.

## Performance — critical rules

- **All React NodeViews (block views) MUST be wrapped with `React.memo`** with comparator `(prev, next) => prev.selected === next.selected && prev.node === next.node`. Without this, TipTap re-renders ALL NodeViews on every ProseMirror transaction (every keystroke), causing severe input lag.
- **`shouldRerenderOnTransaction: false`** must be set on `useEditor` to prevent the Editor component from re-rendering on every transaction.
- **`markUnsaved` must NOT call `setLayout`** — it uses a module-level `Set<string>` to avoid triggering React state updates on every keystroke.
- **CSS objects in Editor must be static** (extracted outside the component as constants) to avoid Emotion recomputation on re-render.
- **Do NOT use the `Typography` TipTap extension** — its input rules process every keystroke and cause lag.
- **EditorDragDrop mousemove handler must be throttled** with `requestAnimationFrame`.
- **TableToolbar must only listen to `selectionUpdate`**, not `transaction`.

## Frontend architecture (hooks + contexts)

**AppShell** is a thin composition layer (~100 lines) that wires hooks and context providers:

**Hooks** (`src/hooks/`):
- `usePaneState` — pane layout tree, tab management, editor content store (module-level Map), unsaved files (module-level Set)
- `useVault` — vault path, file tree, switchVault, openVault
- `useFileOperations` — CRUD (create/rename/delete/move notes and folders)
- `useEditorSession` — file open, auto-save (1s debounce), markdown conversion
- `useKeyboardShortcuts` — global Cmd+B/P/S/W/Tab/\ shortcuts
- `useSidebarResize` — drag-to-resize sidebar
- `useSessionPersistence` — startup restore + save-on-change via single `restore_session` IPC call
- `useFileSearch` / `useContentSearch` / `useEscapeClose` — search modal logic
- `useEnvironments` — environment CRUD, active switching, variable management
- `useConnectionStatus` — listens to `connection-status` Tauri events for real-time connection state
- `useFileConflicts` — detects externally modified files, suppresses auto-save during conflict

**Contexts** (`src/contexts/`):
- `WorkspaceContext` — vault state + file operations + file select (consumed by Sidebar, FileTree, TopBar, QuickOpen, SearchPanel)
- `PaneContext` — layout + actions + editor change (consumed by PaneContainer, PaneNode, StatusBar, FileTree)
- `EditorSettingsContext` — vim mode (consumed by PaneNode, StatusBar)
- `EnvironmentContext` — environments list, active environment, CRUD, variable resolution (consumed by TopBar, HttpBlockView, EnvironmentManager)
- `ConflictContext` — file conflict state (consumed by PaneNode for ConflictBanner)

**Component structure:**
- `src/components/layout/file-tree/` — FileTree (with @dnd-kit drag-drop), FileTreeNode, InlineInput
- `src/components/layout/pane/` — PaneContainer, PaneNode, SplitView
- `src/components/layout/connections/` — ConnectionForm, ConnectionsList
- `src/components/layout/environments/` — EnvironmentManager (drawer with env list + key-value editor + secret toggle)
- `src/components/layout/ConflictBanner.tsx` — banner for externally modified files

## Multi-pane system

- Pane layout is a binary tree (`src/types/pane.ts`): each node is either a leaf (tabs + editor) or a split (horizontal/vertical with ratio). Each tab stores its `vaultPath` so tabs from different vaults coexist.
- State managed by `usePaneState` hook (`src/hooks/usePaneState.ts`). Editor contents stored in module-level `Map` outside React state. Unsaved files tracked in module-level `Set` (not in layout state — avoids re-renders on keystroke).
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

## HTTP block

- Block type `http` in `src/components/blocks/http/`. Methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS.
- Input: method selector (color-coded), URL field, tabs for Params/Headers/Body/Settings. All value fields use `InlineCM` (single-line CodeMirror) with `{{ref}}` autocomplete, highlighting, and hover tooltip showing resolved values.
- Output: status badge (granular colors by status class), elapsed time, response size, syntax-highlighted body (JSON/HTML/XML/plain), collapsible response headers, copy button.
- Binary responses: backend returns `{ encoding: "base64", data: "..." }` for image/video/audio/PDF/zip. Frontend renders images inline, PDFs in iframe, others as info + download button. Maximize button opens fullscreen overlay.
- Execution flow: resolve dependencies (execute referenced blocks first, with dedup lock for shared deps) → fetch env variables → resolve `{{...}}` in URL/headers/params/body → execute via Tauri → cache result by content hash.
- Timeout: 30s client default, per-request override via `timeout_ms` field in Settings tab.
- Backend executor: `src-tauri/src/executor/http.rs` — uses reqwest, classifies errors (timeout, connection_failed, too_many_redirects, body_error).

## E2E block

- Block type `e2e` in `src/components/blocks/e2e/`. Runs sequential HTTP steps with assertions and variable extraction between steps.
- Input: base URL (InlineCM with `{{ref}}`), default headers (key-value, inherited by all steps), ordered step list (collapsible cards with up/down reorder).
- Each step mirrors the HTTP block layout: colored method selector + URL in bordered box, two tab groups:
  - **Request tabs** (Params / Headers / Body) — HTTP request configuration, same pattern as HTTP block.
  - **Assertions tabs** (Expect / Extract) — test validations, separated from request config. Expect has status, JSON match (key=path, value=expected), body contains. Extract maps variable names to JSON paths.
- Output: summary bar ("2/3 passed" with progress bar), per-step result cards (pass/fail icon, status badge, elapsed time, expandable response body with syntax highlighting, assertion errors with expected vs received, extracted variables).
- Execution flow: resolve dependencies → fetch env variables → resolve `{{...}}` in all fields → send to backend `E2eExecutor` → steps execute sequentially, extractions passed to subsequent steps, query params appended to URL → cache result.
- Backend executor: `src-tauri/src/executor/e2e.rs` — uses reqwest, appends query params, validates expectations (status, JSON path match, body contains), extracts variables by JSON path, continues on step failure.
- Slash command: `/e2e` creates a new E2E block.

## Environments

- Managed via `useEnvironments` hook + `EnvironmentContext`. Tables `environments` and `env_variables` in SQLite.
- TopBar dropdown to select active environment. EnvironmentManager drawer (`src/components/layout/environments/`) for CRUD + key-value editing.
- `{{KEY}}` (no dots) in any HTTP block field resolves to the active environment's variable value. Keys appear in `{{` autocomplete alongside block aliases.
- Backend: 8 Tauri commands for full CRUD (list/create/delete/duplicate environments, set active, list/set/delete variables).
- Sensitive variables: `is_secret` flag + lock toggle in UI. Secret values encrypted via OS keychain (`keyring` crate), sentinel `__KEYCHAIN__` in SQLite.

## Security — Keychain

- Module: `src-tauri/src/db/keychain.rs` — `store_secret`, `get_secret`, `delete_secret`, `resolve_value`.
- Connection passwords: stored in keychain on create/update, sentinel in SQLite. Resolved in `build_connection_string`.
- Environment variables: `is_secret` field (migration `002_env_is_secret.sql`). Secret values stored in keychain, resolved on read in `row_to_variable`.
- Fallback: if keychain unavailable, values stored plaintext with no error.

## Block utilities

Shared infrastructure in `src/lib/blocks/`:
- `references.ts` — parse `{{...}}` syntax, resolve against block contexts + env variables, navigate JSON by dot-path. Priority: block ref > env var.
- `dependencies.ts` — extract referenced aliases, auto-execute dependencies before current block. Dedup lock via `inflightExecutions` Map prevents duplicate execution of shared dependencies.
- `cm-references.ts` — CodeMirror decoration plugin for `{{ref}}` syntax highlighting + hover tooltip showing resolved values or errors.
- `cm-autocomplete.ts` — CodeMirror completion for `{{` — shows block aliases (with cached/no result detail) and env variable keys (with env detail).
- `hash.ts` — SHA-256 content hash for block result cache invalidation.
- `document.ts` — walk ProseMirror doc to collect blocks above current position.

## Editor features

- **Table toolbar** (`src/components/editor/extensions/TableToolbar.tsx`): floating toolbar when cursor is in a table. Add/delete rows and columns, delete table.
- **Drag-drop validation** (`EditorDragDrop.tsx`): `validateBlockMove()` prevents moving executable blocks in ways that would break the reference DAG.
- **File conflict banner** (`ConflictBanner.tsx`): shown when an open file is modified externally. Options: Reload (re-read from disk) or Keep Mine (overwrite). Auto-save suppressed during conflict.
- **Display mode animation** (`ExecutableBlockShell.tsx`): CSS transitions between input/split/output modes.
- **Mermaid theme sync**: re-initializes with dark/default theme on colorMode change.

## Docs

- `docs/SPEC.md` — Full product specification (features, data models, Tauri commands, UI details).
- `docs/ARCHITECTURE.md` — Plugin architecture with code examples.
- `docs/backlog/` — Epics with stories and tasks. `README.md` has dependency graph and implementation order. All 11 epics complete.
