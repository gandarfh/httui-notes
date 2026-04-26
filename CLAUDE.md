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
- `usePaneState` — pane layout tree, tab management (file + diff tabs), editor content store (module-level Map), unsaved files (module-level Set)
- `useVault` — vault path, file tree, switchVault, openVault
- `useFileOperations` — CRUD (create/rename/delete/move notes and folders)
- `useEditorSession` — file open, auto-save (1s debounce), markdown conversion, suppressAutoSave/unsuppressAutoSave for MCP writes
- `useChat` — chat state machine (messages, streaming, tool activity, permissions, pending file updates). Accepts `ChatFileCallbacks` for event-driven auto-save suppression
- `useChatSessions` — session CRUD, active session tracking, CWD management
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
- `ChatContext` — sessions, messages, streaming, permissions, tool activity, resume failure (consumed by ChatPanel, ChatConversation, ChatInput, PermissionBanner, DiffViewer)

**Component structure:**
- `src/components/layout/file-tree/` — FileTree (with @dnd-kit drag-drop), FileTreeNode, InlineInput
- `src/components/layout/pane/` — PaneContainer, PaneNode, SplitView
- `src/components/layout/connections/` — ConnectionForm, ConnectionsList
- `src/components/layout/environments/` — EnvironmentManager (drawer with env list + key-value editor + secret toggle)
- `src/components/layout/ConflictBanner.tsx` — banner for externally modified files
- `src/components/chat/` — ChatPanel, ChatConversation, ChatInput, ChatMessageBubble, ChatSessionList, ChatMarkdown, ToolUseBlock, PermissionBanner, PermissionManager, UsagePanel
- `src/components/editor/DiffViewer.tsx` — side-by-side diff view with executable block widgets
- `src/components/blocks/standalone/StandaloneBlock.tsx` — executable block for diff context (outside TipTap)

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

The HTTP block is a fenced-code-native CM6 implementation (epic 24 — `docs/http-block-redesign.md`). Methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS.

**Storage format** — body is HTTP-message text inside a ```http fence:
```
```http alias=req1 timeout=30000 display=split mode=raw
GET https://api.example.com/users?page=1
Authorization: Bearer {{TOKEN}}
```
```
Info-string tokens: `alias`, `timeout`, `display`, `mode` (`raw|form`). Canonical write order is `alias → timeout → display → mode`. Pre-redesign blocks with a JSON body (`{"method":"...","url":"..."}`) are detected by the parser and converted on read — vault stays compatible.

**Architecture:**
- `src/lib/blocks/http-fence.ts` — parser/serializer for both info string and HTTP-message body. `parseHttpMessageBody` / `stringifyHttpMessageBody` are idempotent (canonical reformat). `parseLegacyHttpBody` + `legacyToHttpMessage` handle the JSON shim.
- `src/lib/codemirror/cm-http-block.tsx` — CM6 extension: scanner, decorations, atomic-on-fences-only, transactionFilter, method coloring on the first body line, keymap (⌘↵ run, ⌘. cancel, ⌘⇧C copy as cURL). Holds a portal registry (toolbar / form / result / statusbar slots) so React mounts inside the widget DOM.
- `src/components/blocks/http/fenced/HttpFencedPanel.tsx` — React panel mounted via `createPortal` into each registered slot. Toolbar (badge / alias / method / host / `[raw│form]` toggle / ▶ / ⚙), result tabs (Body / Headers / Cookies / Timing / Raw with `pretty│raw` sub-toggle), status bar (status dot, host, elapsed, size, "ran X ago", `⤓` Send-as menu), settings drawer (Chakra `Portal` + `Box`, NEVER `Dialog` — preserves CM6 focus). Form mode replaces the body lines with a tabular Params/Headers/Body editor; each input uses local state + commit-on-blur to avoid the round-trip lag of re-emitting raw on every keystroke.
- `src/components/editor/HttpWidgetPortals.tsx` — subscribes to the portal registry and renders panels.

**Execution:**
- Streamed via `executeHttpStreamed` (`src/lib/tauri/streamedExecution.ts`) — `Tauri::Channel<HttpChunk>` carries `Headers { ttfb_ms } → BodyChunk* → Complete`. Frontend uses `onHeaders` for the immediate status update and `onProgress` (cumulative bytes) to drive the "downloading X kb…" status-bar indicator. `Complete` is the cache-write trigger — intermediate `BodyChunk` bytes are discarded by the V1 frontend (the consolidated body lives in `Complete`).
- Cancel via `cancelBlockExecution(executionId)`. The backend's `tokio::select!` observes the token at every chunk in the body loop, so cancel mid-body works (returns `Err("Request cancelled")`, which the Tauri command turns into `HttpChunk::Cancelled`). Partial bytes are discarded.
- Refs `{{...}}` resolved in URL, header keys + values, param keys + values, body before dispatch. Header names that resolve to invalid HTTP tokens (e.g. value with spaces) produce a clear error instead of reqwest's generic `builder error`.
- Cache hash: `sha256(method + URL with sorted-encoded params + sorted headers + body + env-snapshot of *only* referenced vars)`. Mutation methods (POST/PUT/PATCH/DELETE) are NEVER served from cache — they always re-execute.
- Backend executor: `httui-core/src/executor/http/` — `mod.rs` has `HttpExecutor::execute_streamed(params, cancel, on_chunk)` consuming `Response::bytes_stream()` in a loop, and `execute_with_cancel` as a thin wrapper with a no-op callback (so legacy callers keep working unchanged). `types.rs` has `HttpResponse`, `Cookie`, `TimingBreakdown` (with `connection_reused: bool`), `HttpChunk { Headers, BodyChunk, Complete, Error, Cancelled }`. Captures `Set-Cookie` via `parse_set_cookie`.
- **Memory cap:** `MAX_BODY_BYTES = 100 MB`. Above this the executor returns `[body_too_large]` before copying further bytes — defends against OOM on accidental downloads. `is_binary_content_type(content_type)` decides whether `body` is base64-encoded vs JSON-parsed in `Complete`.
- **V1 timing:** `total_ms` (full execution) + `ttfb_ms` (split between `req.send()` returning headers and the first body chunk). `dns_ms`/`connect_ms`/`tls_ms` stay `None` and `connection_reused` stays `false` — the full breakdown requires swapping reqwest for isahc/libcurl, deferred to V2 (see `docs/http-timing-isahc-future.md` for criteria + skeleton).
- **Body viewer:** `HttpBodyCM6Viewer` in `HttpFencedPanel.tsx` is a CodeMirror 6 read-only `EditorView` with `oneDarkHighlightStyle` and language picked from Content-Type (`json`/`xml`/`html`/`svg`, with the legacy heuristic as fallback). Replaces a `<pre dangerouslySetInnerHTML>` + `lowlight` render that blocked the webview on multi-MB bodies. The `lowlight` package itself stays in `package.json` — still used by `E2eBlockView`, `ChatMarkdown`, `Editor`.

**Run history (Story 24.6):** `block_run_history` SQLite table (migration `009`) stores **metadata only** (method, URL canonical, status, sizes, elapsed, outcome, timestamp) — never request/response bodies. Trim: 10 rows per (file_path, alias). Drawer shows last N. Tauri commands: `list_block_history`, `insert_block_history`, `purge_block_history`.

**Code generation (Story 24.7):** `src/lib/blocks/http-codegen.ts` exports `toCurl`, `toFetch`, `toPython`, `toHTTPie`, `toHttpFile`. Snippets are pre-computed in panel state (resolved refs included) so the clipboard write happens synchronously inside the user-gesture window — avoid the gotcha where `await` between click and `clipboard.writeText` silently denies. Status-bar `⤓` menu offers all 5; `Mod-Shift-c` shortcuts directly to cURL.

**Slash commands:** `/HTTP Request`, `/HTTP GET`, `/HTTP POST`, `/HTTP PUT`, `/HTTP DELETE` insert templates in the new HTTP-message format with cursor on the request line.

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

## Chat system

- Full design in `docs/chat-design.md`. Chat panel in `src/components/chat/`, hooks in `src/hooks/useChat.ts` and `useChatSessions.ts`.
- Architecture: React frontend → Tauri Rust backend → Node.js sidecar (`sidecar/src/`) → Claude Agent SDK. Communication via NDJSON protocol over stdin/stdout.
- Sidecar spawned lazily on first chat message. Health-checked via ping/pong. Auto-respawn with exponential backoff.
- MCP server: `httui-mcp` binary with 14 tools (list/read/create/update notes, search, connections, environments). Registered as MCP tool for the sidecar.

**Sessions:** SQLite-backed (`sessions` table). `claude_session_id` for resume across restarts. On resume failure, offers "Continue as new conversation" (clears `claude_session_id`, re-sends last message).

**Permission system:** `PermissionBroker` (`src-tauri/src/chat/permissions.rs`) intercepts tool calls before prompting the user. Cascading logic:
1. Bash → always ask user
2. Edit/Write outside session `cwd` → hard deny (no prompt)
3. Read/Glob/Grep inside session `cwd` → auto-allow
4. DB persisted rule (`tool_permissions` table, scope `always`) → apply
5. DB session rule (scope `session`) → apply
6. Fallback → ask user via PermissionBanner

PermissionBanner (`src/components/chat/PermissionBanner.tsx`): scope selector (Once/Session/Always). For `update_note` tools, shows compact banner with file path, line stats (+N -M), and "View Diff" button. PermissionManager panel (gear icon) lists and deletes persisted rules.

**Diff viewer:** When `update_note` is detected, opens a side-by-side diff tab (`DiffViewer.tsx`) using `@codemirror/merge`. Both sides read-only. Fenced code blocks (```http, ```db-*, ```e2e) rendered as executable `StandaloneBlock` widgets inside CodeMirror via `StateField` decorations (`src/lib/codemirror/cm-block-widgets.tsx`). Blocks have SQL/JSON syntax highlighting (`oneDarkHighlightStyle`) and line-level diff decorations (red for deletions, green for additions). Allow/Deny buttons in diff header.

**Diff tab lifecycle:** `TabState` extended with `kind: "diff"`. `usePaneState` has `openDiffTab`/`closeDiffTab` actions. Diff tabs are transient — filtered from session persistence.

**Auto-save protection for MCP writes:** Event-driven state machine in `useChat`:
- `chat:tool_use` with `update_note` → `onFileWriteStart` callback → `suppressAutoSave(filePath)` (cancels pending auto-save timer)
- `chat:tool_result` for that tool → `onFileWriteComplete` callback → `unsuppressAutoSave(filePath)` + `forceReloadFile(filePath)` (reloads from disk into editor)
- No timeouts — purely driven by tool lifecycle events.

**Image attachments:** File picker, clipboard paste, and Tauri native drag-drop (`getCurrentWebview().onDragDropEvent()`). Max 20 images, 5MB each. Images normalized before sending to Claude: resize if either side > 2048px (Lanczos3), re-encode as JPEG Q85 (`normalize_image` in `commands.rs`, uses `image` crate).

**CWD per session:** Displayed in chat header bar (truncated path). Click to change via directory picker. Falls back to active vault path. Passed to sidecar for tool execution context.

**Wikilinks in chat:** User text scanned for `[[target]]` patterns in `send_chat_message`. Matching notes resolved by filesystem search (case-insensitive stem match). Note content injected as context blocks for the sidecar. Original `[[...]]` preserved in DB for display.

**Usage stats:** Tokens aggregated per day/session in `usage_stats` table (upserted on `chat:done`). `cache_read_tokens` tracked alongside `input_tokens`/`output_tokens`. UsagePanel (`src/components/chat/UsagePanel.tsx`) shows CSS bar chart (last 30 days), cache efficiency percentage, and summary cards. Accessible via "Usage" tab in ChatPanel.

## Docs

- `docs/SPEC.md` — Full product specification (features, data models, Tauri commands, UI details).
- `docs/ARCHITECTURE.md` — Plugin architecture with code examples.
- `docs/chat-design.md` — Chat system technical design (1000 lines): protocol spec, session lifecycle, streaming, permissions, MCP integration.
- `docs/backlog/` — Epics with stories and tasks. `README.md` has dependency graph and implementation order. All 14 epics complete.
