# ADR 0004 — Local override semantics for `*.local.*` files

**Status:** Accepted
**Date:** 2026-04-29

## Context

The vault model (ADR 0001) puts shared config in committed TOML files
(`envs/staging.toml`, `connections.toml`). Individual developers
sometimes need different values without polluting the shared file
(point `BASE_URL` to localhost, swap a connection host to a tunnel,
flip an env var for an experiment). The convention is a sibling
`*.local.*` file that is gitignored.

This ADR locks the semantics: how merging works, where writes land,
and how the file is discovered.

## Decision

### Files in scope

| Base | Override |
|---|---|
| `envs/{name}.toml` | `envs/{name}.local.toml` |
| `connections.toml` | `connections.local.toml` |
| `.httui/workspace.toml` | `.httui/workspace.local.toml` |

User config (`~/.config/httui/user.toml`) does not have a `.local`
sibling — it's already per-machine.

### Merge rule

1. Read the base file. If absent, treat as empty.
2. Read the `.local` file. If absent, that's fine — base is the result.
3. Deep-merge: the override's leaf values win at every level.
4. **Arrays replace, they do not concatenate.** If the base has
   `default_headers = [...]` and the override has its own
   `default_headers = [...]`, the override list is the result. This is
   the only safe rule — concatenation makes deletions impossible.
5. Tables (`[connections.x]`) merge key by key. To delete a key in the
   override, the user has to remove it from the base or accept its
   inheritance — there is no `delete` marker. (We don't try to invent
   one; the alternative would be a custom syntax that breaks the
   "valid TOML" guarantee.)

### Write target

httui **always writes to the base file**, never to `.local`. Reasons:

- Writes from the app are typically meant to be shared (rename a
  connection, edit a non-secret var). Writing to `.local` would silently
  hide the change from teammates.
- `.local` files are an explicit "I know what I'm doing" surface; the
  app shouldn't author them.
- Single writer per file simplifies the conflict story (ADR 0003).

UI implication: when a value is currently *masked* by a local override,
the form input shows both — base value (read-only) and the active
override — so editing the base in-app produces an obvious "your edit
won't take effect, the local override wins" hint. The user can copy or
remove the override manually.

### Discoverability and gitignore

When httui creates a vault (`git init` flow, epic 17) or detects an
existing vault without our entries, it ensures the following lines exist
in `.gitignore` at the vault root:

```
# httui local overrides — never commit these
envs/*.local.toml
connections.local.toml
.httui/workspace.local.toml
.httui/cache/
```

If `.gitignore` exists without these lines, httui appends them in a
single contiguous block with the comment header. It does not remove
duplicates or reorganize the rest of the file.

If a `.local` file is found **inside** a tracked path (`git ls-files`
shows it), httui surfaces a one-time warning: "this file is tracked,
your local overrides may be committed accidentally" with a "fix it"
button that runs `git rm --cached <file>`. Auto-untracking without
asking would be too aggressive.

### Examples

#### Override a single var

`envs/staging.toml` (committed):

```toml
version = "1"

[vars]
BASE_URL = "https://api.staging.acme.dev"
TENANT_ID = "tnt_8f2a91"
```

`envs/staging.local.toml` (gitignored):

```toml
version = "1"

[vars]
BASE_URL = "http://localhost:8080"
```

Effective: `BASE_URL = "http://localhost:8080"`,
`TENANT_ID = "tnt_8f2a91"`.

#### Override a connection host

`connections.toml`:

```toml
version = "1"

[connections.payments-staging]
type = "postgres"
host = "pg-staging.acme.local"
port = 5432
database = "payments"
user = "app"
password = "{{keychain:payments-staging:app}}"
```

`connections.local.toml`:

```toml
version = "1"

[connections.payments-staging]
host = "127.0.0.1"
port = 15432
```

Effective: same connection, but pointed at a local SSH tunnel. Password
ref still resolves through the same keychain entry.

### Cache invalidation

When a `.local` file changes (watcher fires per ADR 0003), the resolver
re-merges and rebroadcasts. The base file's cache entry is *not*
invalidated by a `.local` change alone — it's the merged view that
changes. Implementation note: the resolver caches the merged result
keyed by `(base_path, base_mtime, local_path, local_mtime)`.

### Validator behavior

The schema validator (ADR 0001) treats `.local` files as additive:
unknown sections in `.local` warn but don't break, just like the base.
The anti-cleartext-secret check (ADR 0002) applies to `.local` files
too — they're still files on the user's disk and we don't want raw
tokens lying around even if gitignored.

## Consequences

**Positive**
- Personal experimentation without polluting shared config.
- One predictable write target (base) means atomic-write + conflict
  detection (ADR 0003) stays straightforward.
- Gitignore auto-augmentation prevents the most common leak.
- Resolver implementation is a single small merge function, used
  identically across env / connection / workspace files.

**Negative**
- Cannot represent "delete a key" in a `.local` file. Accepted: vault
  authors own the base file.
- The "your edit is masked by local override" UI hint adds form
  complexity. Worth it; otherwise the user is mystified by their own
  changes vanishing.
- A user can hand-edit `.local` to bypass conventions (e.g. add a
  field that doesn't exist in the base). The validator will warn but
  not block. Accepted as power-user freedom.

**Neutral**
- The "no concat for arrays" rule is the only sane choice but means
  users porting from systems with concat semantics need a re-learn.
  Document in user docs (epic 37).
