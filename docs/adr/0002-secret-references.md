# ADR 0002 — Secret reference syntax and resolution

**Status:** Accepted
**Date:** 2026-04-29

## Context

Vault files (see ADR 0001) are committed to git. Anything sensitive must
not be a literal value in those files. We need a syntax for "look this
up at runtime" that is:

- Unambiguous in TOML strings
- Backend-agnostic (keychain, 1Password, pass, plain env var)
- Self-documenting (a reviewer reading the file knows what's a reference)
- Composable with non-secret variable interpolation already in blocks
  (`{{ENV_VAR}}`)

The MVP today uses `__KEYCHAIN__` as a sentinel string in SQLite, with
the actual key name implicit (per-table convention). That doesn't carry
backend or address info, so it can't represent multiple backends or
explicit keychain namespaces.

## Decision

### Canonical syntax

Secret references are TOML strings of the form:

```
"{{<backend>:<address>}}"
```

Where `<backend>` is one of `keychain`, `1password`, `pass`, `env`. The
`<address>` shape is backend-specific.

Keychain (default) addresses use **two segments**, namespace and key:

```
"{{keychain:NAMESPACE:KEY}}"
```

The double-colon address is a deliberate choice: it gives us a flat
namespace that matches typical OS-keychain APIs (service + account)
without forcing per-vault prefix collisions.

### Backends

| Backend | Address shape | Example |
|---|---|---|
| `keychain` | `NAMESPACE:KEY` | `{{keychain:payments-staging:app}}` |
| `1password` | `op://VAULT/ITEM/FIELD` | `{{1password:op://Eng/payments-prod/password}}` |
| `pass` | `path/to/secret` | `{{pass:work/payments-prod/db}}` |
| `env` | `NAME` | `{{env:GITHUB_TOKEN}}` |

`keychain` is always available. The others are opt-in: the user must
have the corresponding tool/agent configured (see `secrets.backend` in
ADR 0001's `user.toml` schema).

### Resolution order — `auto` backend

When `secrets.backend = "auto"` in `user.toml` (the default), httui
resolves a `{{keychain:...}}` reference by trying providers in this
order:

1. OS keychain (always)
2. 1Password CLI if `op` is on `$PATH` and the user is signed in
3. `pass` if `pass` is on `$PATH`
4. Process environment via `env:` is **never** consulted automatically —
   it must be requested explicitly via `{{env:NAME}}` in the file

Explicit-backend references (`{{1password:...}}`, `{{pass:...}}`,
`{{env:...}}`) bypass the chain and only consult that one backend.

If `secrets.backend` is set to a specific backend (e.g. `"1password"`),
unprefixed `{{keychain:...}}` refs are routed to that backend's
equivalent address space — but only if a translation exists. When in
doubt, fail with a clear error rather than silently picking the wrong
provider.

### Distinguishing secrets from regular variables

httui already supports `{{VAR}}` (no colon, no dot) for env-var
interpolation in block bodies. The distinguishing rule:

- Contains a `:` → secret reference, resolved against a backend
- Contains a `.` → block reference (`{{alias.response.path}}`)
- Otherwise → environment variable lookup against the active env

These three namespaces are disjoint by syntax. The resolver can decide
without ambiguity.

### Schema validation — anti-secret-in-cleartext

The validator scans every string field in TOML files written by humans
and rejects values that match high-confidence secret patterns
**unless** they are wrapped in a `{{...}}` reference. Patterns:

- AWS access key: `^AKIA[0-9A-Z]{16}$`
- AWS secret key: 40-char base64-ish in a field named `*_secret*` or
  `*password*`
- GitHub token: `^gh[pousr]_[A-Za-z0-9]{36,}$`
- Slack token: `^xox[abprs]-[A-Za-z0-9-]{10,}$`
- JWT: `^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$`
- Private key blocks: starts with `-----BEGIN`
- High-entropy hex >= 32 bytes in a field named like `*token*` /
  `*password*` / `*secret*`

The list is **policy in this ADR; the canonical regex set lives in
code** (`httui-core`) so it can evolve without an ADR rev. False
positives are mitigated by allowing an inline override comment:

```toml
api_key = "test-key-not-secret"  # httui:allow-cleartext
```

### Migration from MVP `__KEYCHAIN__` sentinel

Out of scope for this ADR — handled by epic 12 (vault migration script).
That script translates each MVP secret into a `{{keychain:NAMESPACE:KEY}}`
reference, where `NAMESPACE` derives from the connection or env name and
`KEY` is the field name (`password`, `token`, etc).

## Consequences

**Positive**
- One uniform syntax across backends; resolver implementation is a
  trait per backend.
- Reviewers can spot secrets at a glance (`{{...}}`).
- Future backends (Vault, AWS Secrets Manager, etc) just add a new
  `<backend>` token.
- Anti-cleartext validator is a real defense-in-depth layer for vaults
  pushed to public repos.

**Negative**
- Two-segment keychain address (`NAMESPACE:KEY`) is more verbose than
  the MVP's implicit single-name approach. Accepted for clarity.
- Validator regex needs maintenance as new secret formats appear; an
  inline override escape hatch is necessary.

**Neutral**
- The trio of `{{...}}` namespaces (secret / block / env) means the
  resolver dispatches by content. Disjoint syntax prevents ambiguity
  but readers still need to learn the rule. Document in user-facing
  docs (epic 37).
