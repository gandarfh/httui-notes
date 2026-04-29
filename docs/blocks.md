# Block authoring

Blocks are fenced code blocks inside a `.md` runbook that httui
executes inline. Two types ship today:

- **HTTP block** — `\`\`\`http`
- **DB block** — `\`\`\`db-<connection-id>`

A block's body is plain text inside the fence. The toolbar that
appears around it (alias, run button, response tabs) is rendered
on top of the markdown without changing the underlying file —
your `.md` stays portable.

## HTTP block

Minimal example:

````
```http alias=fetch-user
GET https://api.example.com/users/42
```
````

The fence info string carries optional flags before the body. Body
syntax is plain HTTP — the request line, then headers, then a
blank line, then the body.

### Info-string flags

| Flag | Default | Meaning |
|---|---|---|
| `alias=<name>` | none | Names the block so later blocks can reference its captures (`{{fetch-user.body.id}}`). Required for capture/chain. |
| `timeout=<ms>` | 30000 | Request timeout in milliseconds. |
| `display=<mode>` | `split` | `input`, `output`, or `split` — how the panel lays out the form vs the response. |
| `mode=<raw\|form>` | `raw` | `raw` shows HTTP-message text; `form` shows a tabular Params/Headers/Body editor. Both edit the same fence body. |

Canonical flag order is `alias → timeout → display → mode`. httui
rewrites to canonical order on save.

### Methods

GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS — all supported. The
toolbar method picker colours the body's first line according to
the verb so a glance tells you what the block does.

### Headers + body

```
```http alias=login
POST {{BASE_URL}}/auth/login
Content-Type: application/json
Authorization: Bearer {{ADMIN_TOKEN}}

{
  "user": "admin",
  "device": "{{TENANT_ID}}-laptop"
}
```
```

References (`{{...}}`) resolve in URL, header keys, header values,
and body before the request fires.

### Capture / chain

Once a block has an alias, later blocks can read its captured
response:

```
```http alias=me
GET {{BASE_URL}}/me
Authorization: Bearer {{login.body.token}}
```
```

Capture syntax: `{{<alias>.<field>.<json-path>}}`. Common fields:

- `body` — JSON-parsed response body (or text for non-JSON)
- `headers.<name>` — response headers
- `status` — status code
- `cookies.<name>` — set-cookie value

JSON paths follow dot notation: `{{login.body.user.id}}`,
`{{login.body.tokens[0]}}`.

### Run + cancel

- **⌘↵** — run
- **⌘.** — cancel mid-stream (works for long downloads)
- **⌘⇧C** — copy as cURL

Bodies up to 100 MB are kept in memory. Above that, httui
short-circuits with `[body_too_large]` to avoid OOM on accidental
downloads.

### Send-as: code generation

The status-bar `⤓` menu exports the current block as:

- `cURL`
- `fetch` (browser/Node)
- Python `requests`
- `HTTPie`
- Plain `.http` file (REST Client / IntelliJ format)

References resolve to their current values in the export, so
`{{BASE_URL}}` becomes the literal staging URL in the snippet.

## DB block

Each connection from `connections.toml` gets its own block type.
A connection named `pg-staging` is invokable as
`\`\`\`db-pg-staging`:

````
```db-pg-staging
SELECT id, email, created_at
FROM users
WHERE created_at > now() - interval '1 day'
ORDER BY created_at DESC
LIMIT 50
```
````

### Mutation guard

DELETE / UPDATE / INSERT / TRUNCATE statements pop a confirmation
prompt before running. The guard is structural — httui parses the
SQL with a small scanner, not just a regex on the first word, so
`UPDATE` inside a comment doesn't trigger a false positive.

If the connection has `is_readonly = true` in the TOML, mutations
are refused entirely.

### References in SQL

References are converted to bind parameters, never
string-interpolated:

```
```db-pg-staging
SELECT * FROM orders WHERE customer_id = {{user.body.id}}
```
```

Becomes `SELECT * FROM orders WHERE customer_id = $1` with the
captured value bound as `$1`. **No SQL injection vector**.

### Result tabs

The response panel has a virtualised grid for tabular data plus
tabs for query metadata, raw response, and exports (CSV, JSON,
SQL `INSERT` statements).

## References — full grammar

Anywhere a string field accepts user input (URL, header value,
SQL parameter), references resolve in this order:

1. **Block reference**: `{{<alias>.<field>.<path>}}` — wins over
   env vars when the alias matches.
2. **Env variable**: `{{<KEY>}}` — looks up `[vars]` then
   `[secrets]` in the active env.

Empty resolution surfaces as a yellow warning in the editor's
hover tooltip; missing secrets surface as a red error.

## Toolbar / status bar features

- **Method-coloured request line** in HTTP blocks (GET=cyan,
  POST=green, PUT=yellow, DELETE=red, etc.)
- **Toolbar**: status badge, alias chip, method picker, host
  display, raw/form toggle, run button, settings drawer
- **Status bar**: status dot, host, elapsed time, response size,
  "ran X ago", `⤓` send-as menu
- **History drawer**: last N runs of this specific block (default
  10), via the toolbar history icon

## Slash commands

Type `/` in the editor to insert a block template:

- `/HTTP Request` — generic
- `/HTTP GET` / `/HTTP POST` / `/HTTP PUT` / `/HTTP DELETE` — pre-filled
- (DB-block templates are added per connection automatically)

Templates land with the cursor on the request line ready for typing.

## See also

- [Concepts](./concepts.md) — vault, environments, secrets
- [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) — execution path
