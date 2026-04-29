# Concepts

> If you've worked in a notebook editor before (Jupyter, Hex, Mode,
> Postman collections), most of this will feel familiar — except
> that everything is a file in a git repo, and httui has no server.

## Vault

A **vault** is just a git repository. Inside it:

- `runbooks/` holds your `.md` files
- `connections.toml` defines the databases / HTTP targets your
  blocks talk to
- `envs/<name>.toml` holds per-environment variables
- `.httui/workspace.toml` holds workspace-shared defaults
- `notes.db` (SQLite) caches results, run history, and chat
  sessions — gitignored

When you "open" a vault, httui scans it for the above files. If
none are present it offers to scaffold them.

## Environments

Switching env is reading a different file. No branches, no
checkouts, no working-tree changes.

```
envs/local.toml         # your local-dev URLs and tokens
envs/staging.toml       # shared staging config (committed)
envs/staging.local.toml # your personal override (gitignored)
envs/prod.toml          # production config (branch-protected)
```

The TopBar dropdown lists every `envs/*.toml` (skipping `.local`
siblings). Switching the active env is purely a read change — your
runbook content doesn't move.

### Personal overrides

Drop `envs/staging.local.toml` next to the committed
`envs/staging.toml` to override individual values for yourself
without touching the shared file:

```toml
# envs/staging.local.toml — gitignored
[vars]
BASE_URL = "http://localhost:8080"
```

httui deep-merges the override on top of the base at read time.
**Writes from the app always target the base file** (committed),
never the `.local` sibling. The override stays your private
side-channel.

The same pattern applies to `connections.local.toml` and
`.httui/workspace.local.toml`.

## Secrets

Sensitive values live in the OS keychain, never in the TOML file.
The TOML carries a reference instead:

```toml
[connections.payments-staging]
type = "postgres"
host = "pg-staging.acme.local"
user = "app"
password = "{{keychain:conn:payments-staging:password}}"
```

When you create a connection through the app, httui:

1. Stores the password in the keychain under
   `conn:<connection-id>:password`
2. Writes only the `{{keychain:...}}` reference to
   `connections.toml`

A teammate cloning the same vault gets the **reference**, not
your password. They run a runbook, the app sees the ref hasn't
been populated locally, and the first-run modal prompts them to
fill it in.

### Reference syntax

Anywhere a TOML value would normally hold a string, you can drop
in a `{{backend:address}}` reference:

| Backend | Example | Meaning |
|---|---|---|
| `keychain` | `{{keychain:conn:pg:password}}` | OS keychain entry |
| `1password` | `{{1password:op://Personal/db/password}}` | 1Password CLI lookup (Epic 16, planned) |
| `pass` | `{{pass:databases/staging}}` | passwordstore.org / GPG agent (planned) |
| `env` | `{{env:DB_URL}}` | OS env var (escape hatch) |

### Anti-cleartext check

httui's TOML validator **rejects raw secret values** in
`[secrets]` sections. If you write `password = "hunter2"` directly
the app refuses to save and asks you to use a reference instead.
The escape hatch is a `# httui:allow-cleartext` comment on the
preceding line — only useful for genuinely non-sensitive values
that happen to share the field name.

## References inside runbooks

Block bodies can reference values from earlier blocks plus
environment variables:

```http
GET {{BASE_URL}}/users/{{$prev.body.id}}
Authorization: Bearer {{ADMIN_TOKEN}}
```

- `{{BASE_URL}}` — variable from the active env
- `{{ADMIN_TOKEN}}` — secret from the active env (resolves through
  the keychain)
- `{{$prev.body.id}}` — captured value from the previous block's
  response

The reference resolver walks the document **above the current
block** to find named outputs. Block aliases (`alias=req1` in the
fence info string) make captures explicit:

```http
```http alias=login
POST {{BASE_URL}}/auth/login
Content-Type: application/json

{ "user": "admin" }
```

Then in the next block:

```http
GET {{BASE_URL}}/me
Authorization: Bearer {{login.body.token}}
```

## Multi-user, multi-machine

The git workflow does the heavy lifting:

- **Two devs, one vault**: edits propagate through normal
  pull-request flow. Each dev keeps their personal `.local.toml`
  overrides + their own keychain.
- **One dev, two machines**: code/runbooks sync via git. Secrets
  are re-entered per machine — intentional, secrets never leave
  the box. Power users point at 1Password / pass to skip this
  prompt (Epic 16, planned).

## What's a file vs SQLite

| Data | Lives in | Synced via git |
|---|---|---|
| Runbooks (`.md`) | repo | yes |
| Connections / envs / workspace defaults | committed `*.toml` | yes |
| Passwords + secret env vars | OS keychain | no |
| Personal overrides | `*.local.toml` | no (gitignored) |
| Per-machine prefs (theme, font) | `~/.config/httui/user.toml` | no |
| Run history | SQLite | no |
| Block result cache | SQLite | no |
| Chat sessions | SQLite | no |

SQLite is **cache + ephemeral state**, not source of truth.

## See also

- [Block authoring](./blocks.md) — fence syntax, references,
  capture/chain
- [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) — code shape and
  process model
- [ADR 0001 — TOML schemas](./adr/0001-toml-schemas.md)
- [ADR 0002 — Secret references](./adr/0002-secret-references.md)
- [ADR 0004 — Local overrides](./adr/0004-local-overrides.md)
