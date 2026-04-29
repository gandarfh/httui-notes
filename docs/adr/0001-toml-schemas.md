# ADR 0001 — TOML schemas for vault and user config

**Status:** Accepted
**Date:** 2026-04-29 (revised same day after first review — see Revisions)

## Context

httui v1 moves from "SQLite as source of truth" to "files in the repo as
source of truth, SQLite as cache" (see `architecture-git-native.md`).
That requires a file format and concrete schemas for:

- `connections.toml` — shared connection definitions (committed)
- `envs/{name}.toml` — per-environment vars (committed)
- `envs/{name}.local.toml` — personal overrides (gitignored)
- `.httui/workspace.toml` — workspace defaults (committed)
- `~/.config/httui/user.toml` — per-machine user prefs

Three options were considered: TOML, YAML, JSON.

## Decision

### Format: TOML

- Comment-friendly (devs can document a connection inline)
- Stable (TOML 1.0)
- First-class in the Rust ecosystem (`toml` crate, used by `Cargo.toml`)
- Tabular constructs (`[connections.x]`, `[[arrays]]`) are well-suited
  to the repeating shapes we need
- Less footgunny than YAML (no significant whitespace, no implicit type
  coercion surprises like `NO`→`false`)
- More commentable than JSON

### Versioning

Every TOML written by httui carries a top-level `version = "1"`. Bump
only on **breaking** schema changes. The migrator (epic 12) reads any
known older version and writes the current one.

```toml
version = "1"
```

Files without a `version` are treated as `"1"` for v1 itself
(grandfathered) — only relevant if a user hand-wrote files before the
field was introduced.

### Schemas

#### `connections.toml`

One file per vault, all connections together (single file is simpler;
splitting per connection is a v2 conversation if it ever matters).

**Any string field accepts a `{{...}}` reference** (ADR 0002). Use
references not only for passwords but for any value that's sensitive
*or* per-machine. Common cases:

- `user` — username can reveal a privileged account or naming
  convention; treat as secret-like by default
- `host` / `port` — when developers tunnel through different addresses
  per machine, override via `connections.local.toml` (ADR 0004)
- `database`, `project_id`, `endpoint` — same reasoning when they vary

```toml
version = "1"

[connections.payments-staging]
type = "postgres"
host = "pg-staging.acme.local"
port = 5432
database = "payments"
user = "{{keychain:payments-staging:user}}"      # ref, not literal — see ADR 0002
password = "{{keychain:payments-staging:password}}"
ssl_mode = "require"                             # disable | allow | prefer | require | verify-ca | verify-full
read_only = false

[connections.payments-api]
type = "http"
base_url = "https://api.staging.acme.dev"
default_headers = { "X-Tenant" = "{{TENANT_ID}}", "Authorization" = "Bearer {{keychain:payments-api:token}}" }
timeout_ms = 30000

[connections.events-store]
type = "mongo"
uri = "{{keychain:events-store:uri}}"            # full connection string, since it embeds creds

[connections.cache]
type = "mysql"
host = "mysql-staging.acme.local"
port = 3306
database = "cache"
user = "{{keychain:cache:user}}"
password = "{{keychain:cache:password}}"

[connections.bq-analytics]
type = "bigquery"
project_id = "acme-analytics"
credentials_path = "{{keychain:bq-analytics:credentials_json}}"

[connections.events-stream]
type = "ws"
url = "wss://stream.staging.acme.dev/events"

[connections.checkout-grpc]
type = "grpc"
endpoint = "checkout.staging.acme.dev:443"
tls = true

[connections.product-api]
type = "graphql"
endpoint = "https://api.staging.acme.dev/graphql"

[connections.deploy-shell]
type = "shell"
shell = "bash"          # bash | zsh | sh | pwsh
cwd = "{{REPO_ROOT}}"
```

**Common fields** on every connection:
- `type` (required, enum)
- `read_only` (optional, default `false`)
- `description` (optional)

**Per-type fields** are spec'd alongside the executor — the schema
validator knows the shape per `type`. Unknown fields produce a warning,
not an error (forward-compat).

**Sensitive-by-default fields.** The validator flags as warnings any
literal (non-`{{...}}`) value in fields named `user`, `username`,
`password`, `token`, `secret`, `key`, `auth`, `credentials*`, `uri`
(when it's a DB URI), or `*_secret`. Users can suppress with the
`# httui:allow-cleartext` escape hatch (ADR 0002), but the default
nudges everyone toward references.

#### `envs/{name}.toml`

Variables split across two sections by sensitivity. The split is
**structural**, not just a flag, so the app can tell at parse time
which keys deserve masking, lock icons, and stricter validation.

```toml
version = "1"

[vars]
# Non-sensitive values. Literals allowed. References allowed too
# (e.g. resolving a non-secret value via env var on this machine).
BASE_URL = "https://api.staging.acme.dev"
TENANT_ID = "tnt_8f2a91"
PG_HOST = "db-staging.acme.local"
PG_DB = "payments"

[secrets]
# Sensitive values. The validator REJECTS literals here — every value
# MUST be a {{...}} reference. The key (left side) is committed; the
# value (right side) is just a pointer.
ADMIN_TOKEN = "{{keychain:env:staging:ADMIN_TOKEN}}"
PG_USER = "{{keychain:env:staging:PG_USER}}"
PG_PASSWORD = "{{keychain:env:staging:PG_PASSWORD}}"
STRIPE_KEY = "{{1password:op://Eng/stripe-staging/api-key}}"

[meta]
description = "Staging — Acme primary"
read_only = false
require_confirm = false  # if true, mutating blocks (POST/PUT/DELETE/UPDATE) prompt before run
color = "amber"          # optional UI hint: amber, red, green, blue, gray
```

`prod.toml` typically sets `read_only = true, require_confirm = true,
color = "red"`.

**Resolution.** `{{KEY}}` in a block (no colon, no dot — see ADR 0002)
looks up `KEY` first in `[secrets]`, then in `[vars]`. Collisions across
sections are flagged by the validator — the user should pick one.

**First-run secret prompt.** Because `[secrets]` keys are committed and
values are references, a fresh clone immediately knows which secrets
the user must populate (epic 18). The app scans every `envs/*.toml`
and `connections.toml` for unresolved references and batch-prompts.

#### `envs/{name}.local.toml`

Same shape as the base file, but only the keys the user wants to
override. Gitignored. See ADR 0004 for merge semantics.

```toml
version = "1"

[vars]
BASE_URL = "http://localhost:8080"
```

#### `.httui/workspace.toml`

Workspace-level shared settings, committed. **Strictly limited to
collaboration-relevant defaults.** Anything visual or per-user
(theme, font, density, sidebar width, shortcuts) lives in `user.toml`
— not here. Reason: a vault is shared across many devs with different
machines and preferences; the repo has no business dictating colors
or fonts.

```toml
version = "1"

[defaults]
environment = "staging"      # which env to load on open
git_remote = "origin"
git_branch = "main"
```

That's it. If a setting feels like it belongs in `workspace.toml` but
isn't here, ask first whether it really needs to be shared across all
collaborators — most don't.

#### `~/.config/httui/user.toml`

Per-machine, never synced. Lives at the OS-appropriate config dir
(`%APPDATA%\httui\user.toml` on Windows, `~/Library/Application
Support/httui/user.toml` on macOS, `$XDG_CONFIG_HOME/httui/user.toml`
on Linux — `~/.config/httui/user.toml` is the typical Linux path).

```toml
version = "1"

[ui]
theme = "dark"               # dark | light | system
font_family = "JetBrains Mono"
font_size = 14
density = "comfortable"      # comfortable | compact

[shortcuts]
# overrides on top of defaults; missing keys keep their default
"toggle.sidebar" = "Cmd+B"

[secrets]
backend = "auto"             # see ADR 0002
biometric = true
prompt_timeout_s = 60

[mcp]
# optional MCP server config — out of scope for v1, structure reserved
```

### Schema validation

- Implemented in Rust alongside the parser (`httui-core`).
- Rejects unknown top-level sections with a warning (not error) —
  forward-compatible.
- Rejects values that look like raw secrets (token-shaped strings) in
  any field that documents a `{{...}}` reference (see ADR 0002).
- Reports errors with file path + line number + suggestion.

### Round-trip

The parser must preserve user comments and key order on round-trip. The
`toml_edit` crate provides this; `toml` (DOM-based) does not. Decision:
**use `toml_edit` for read+write of vault files**, fall back to plain
`toml` for read-only paths if perf becomes an issue.

## Consequences

**Positive**
- Diffable, reviewable, comment-able config; no separate UI needed to
  understand a vault.
- Standard tooling (any text editor) works.
- Round-trip preserves user intent.
- Forward-compat: unknown fields warn but don't break.

**Negative**
- TOML doesn't support deeply nested heterogeneous structures
  ergonomically — but our schemas are intentionally flat.
- Two crates (`toml_edit` for write, optionally `toml` for hot reads)
  means slightly larger dep surface.
- `version` field forces every future schema change to either be
  backward-compatible at v1 or force a migrator. Accepted cost.

**Neutral**
- Schemas live in code (Rust types) as well as in this ADR. The Rust
  side is authoritative once code lands; ADR is the contract.

## Revisions

### 2026-04-29 — initial review feedback

After the first read-through, three corrections landed before this ADR
was treated as locked:

1. **`user` and other privileged fields in `connections.toml` should
   be references, not literals.** Rationale: usernames can reveal
   account naming conventions and privilege tiers. Solution: any
   string field accepts a `{{...}}` reference, and the validator now
   warns on literal values in fields named like credentials
   (`user`, `password`, `token`, `auth`, `uri`, etc).

2. **Env vars need a structural marker for "this is a secret".**
   Rationale: a `is_secret = true` flag inline would be easy to
   forget. Solution: split `[vars]` (literals OK) from `[secrets]`
   (validator forces `{{...}}` references). The split is structural,
   so the app knows at parse time which keys to mask, and so first-run
   prompting (epic 18) can list missing secrets without ambiguity.

3. **`workspace.toml` should not carry visual settings.** Rationale:
   theme, font, density, sidebar width, shortcuts are per-developer
   preferences; the shared repo has no business dictating them.
   Solution: removed `[theme]` and `[ui]` from `workspace.toml`. It
   now contains only `[defaults]` (env, git remote, git branch).
   Everything visual stays in `user.toml`.

### 2026-04-29 — Sqlite variant added (epic 07)

The original schema listed nine connection types: postgres, mysql,
mongo, http, ws, grpc, graphql, bigquery, shell. The MVP however
already supports `sqlite` as a third DB driver (see migration `001`).
Dropping it would break parity. Added a tenth variant:

```toml
[connections.local-cache]
type = "sqlite"
path = "/Users/me/cache.db"
```

`SqliteConfig` carries only `path` (no host/port/credentials), and
the validator skips credential checks for it. No further changes to
the schema contract.
