# Chat / MCP

The right-hand chat panel is a Claude session anchored to your
active vault. The model reads and writes vault files (notes,
connections, environments) through a small set of MCP tools — same
permission rules apply whether the model invokes them or you click
the equivalent UI control.

## Open the panel

`Cmd+B` toggles the chat panel. On first open the sidecar (Node
process bundled with the app) spawns and connects to Anthropic's
API; subsequent toggles reuse the running process.

The panel header shows the current working directory the chat is
anchored to — defaults to your active vault path; click it to point
the session at a different folder.

## What the model can do

Out of the box the chat has access to four MCP tool families that
the bundled `httui-mcp` server exposes:

| Family | Tools |
|---|---|
| **notes** | `list_notes`, `read_note`, `create_note`, `update_note`, `search_notes` |
| **connections** | `list_connections`, `get_connection` |
| **environments** | `list_environments`, `get_environment_variables` |
| **blocks** | `list_blocks_in_note`, `get_block_settings`, `get_block_history` |

Notes / connections / environments tools route through the same
file-backed stores the UI uses — `connections.toml`, `envs/*.toml`,
`runbooks/*.md`. Blocks tools surface metadata only (settings,
history) — no body content, no execution.

## Permission system

Tool calls don't run silently. Each one checks against this
cascade before executing:

1. **Bash** → always asks the user (no auto-allow).
2. **Edit / Write outside the session cwd** → hard deny.
3. **Read / Glob / Grep inside the session cwd** → auto-allow.
4. **Persisted rule** (`tool_permissions` table, scope `always`) →
   apply.
5. **Session rule** (scope `session`) → apply.
6. **Fallback** → ask via the in-app permission banner.

The banner offers three scopes when you approve:

- **Once** — applies to this single call.
- **Session** — applies for the rest of this chat session.
- **Always** — persists in the local SQLite. Manage saved rules
  via the gear icon in the chat header.

For `update_note` the banner shows a compact diff with the
file path and `+N -M` line stats. Clicking "View Diff" opens a
side-by-side merge view (CodeMirror); the chat won't apply the
edit until you Allow.

## Image attachments

Up to 20 images per message, 5MB each. Three input paths:

- File picker (paperclip icon).
- Clipboard paste — `Cmd+V` over the chat input.
- Tauri native drag-drop — drag an image from the OS file manager
  into the chat input region.

Images are normalized before send: side > 2048px scales down via
Lanczos3, then re-encoded to JPEG Q85. Source files stay
untouched on disk.

## Wikilinks in your message

Type `[[note-name]]` in the chat input. httui scans the active
vault for a matching note (case-insensitive stem match), inlines
its content as a context block for the model, and keeps the
literal `[[...]]` in the message log so future scrolls show what
you originally wrote.

## Sessions

The chat stores sessions in the local SQLite (`notes.db`).
Session list lives in the left tab of the chat panel. Each
session keeps its own:

- Message history
- CWD anchor
- Persisted permission rules
- Token-usage roll-up

The Anthropic-side `claude_session_id` round-trips so a session
resumes intact after an app restart. If the resume fails (rare —
backend changes, deleted session id), the panel offers "Continue
as a new conversation" — same messages locally, fresh
`claude_session_id` upstream.

## Custom MCP tools

The bundled `httui-mcp` server is just one MCP entry. Extra
servers configure under `~/.config/httui/user.toml`:

```toml
[mcp.servers.my-server]
command = "/usr/local/bin/my-mcp"
args = ["--vault", "${VAULT_PATH}"]
```

Each entry spawns a local process the chat can route tool calls
to alongside the built-ins. The standard MCP stdio protocol
applies; see the [MCP spec](https://modelcontextprotocol.io/) for
the surface a server has to expose.

## Token usage

Per-day + per-session token roll-ups live under the **Usage** tab.
Tracks `input_tokens` / `output_tokens` / `cache_read_tokens`
separately so you can see the cache hit rate (cache reads are 10×
cheaper than fresh reads). Cache efficiency lands as a single
percentage at the top.

## Things to know

- The chat is **Anthropic-only** today. No swap-in of OpenAI / open
  models — the protocol assumptions in the sidecar are
  Claude-specific.
- The chat is **online-only** at the moment. No offline mode.
- The chat respects the **same conflict banner** as the editor —
  if it tries to write a note that's been edited externally
  during the chat session, the conflict banner fires before the
  diff and you decide whether to merge.
