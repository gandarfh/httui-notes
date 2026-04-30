# Epic 42 — Connections refined UI

Master-detail layout for connections matching canvas §5: list left,
detail panel right with credentials + schema preview + hot tables +
"used in runbooks" back-references + Test/Rotate/Duplicate footer.
Replaces the current Chakra form-only experience.

**Depende de:** Epic 19 cutover (`ConnectionsStore` is the source of
truth; `db::connections` legacy commands removed)
**Desbloqueia:** Epic 23 (connection quick-edit popover), Epic 28
(sidebar Schema tab pulls preview from here)
**Status:** in progress (Stories 01-04 shipped at component level — commits 0f1fb06, 8ed373d, 3f70006, a4eaae5, d6a3698; audit-031 deferral on PK/FK + row counts)
**Effort:** 5-6 days

---

## Story 01: Master-detail layout (canvas: 220 / 1fr / 420) — slice 1 done (0f1fb06)

### Tasks

- [x] `ConnectionsPage.tsx` — 3-col grid `220px 1fr 420px` — closed by 0f1fb06.
- [x] **Sidebar (220px) — kind filters** (canvas spec, 9 types):
      | Kind | Name | Icon | Hue (oklch) |
      |---|---|---|---|
      | postgres | PostgreSQL | 🐘 | `0.62 0.10 250` |
      | mysql | MySQL / MariaDB | 🐬 | `0.62 0.10 215` |
      | mongo | MongoDB | 🍃 | `0.55 0.13 145` |
      | bigquery | BigQuery | 📊 | `0.62 0.10 240` |
      | grpc | gRPC | ⚡ | `0.62 0.14 280` |
      | graphql | GraphQL | ◆ | `0.62 0.16 330` |
      | http | HTTP / REST base URL | 🌐 | `0.74 0.07 215` |
      | ws | WebSocket | ↔ | `0.62 0.10 215` |
      | shell | Shell / Bash | ▷ | `0.50 0.014 240` |
      Each row: 18px icon + name + count (mono right). Selected row
      `--bg-3` bg.
- [x] **POR AMBIENTE** sub-section: env name (mono 12px) + dot color
      + count — closed by 0f1fb06.
- [x] **Hint card** at sidebar bottom: 🔑 "Credenciais locais —
      Senhas vivem no keychain. Conexão é só nome + host."
      (10px text, `--bg-2` bg, soft border) — closed by 0f1fb06.
- [x] List header: H1 serif 26px "Connections" + status text
      "16 · 14 ok · 1 slow · 1 down" (color-coded mono) — closed
      by 0f1fb06.
- [x] Right-aligned buttons: `▶ Test all` (ghost) + `+ Nova` (primary)
      — closed by 0f1fb06.
- [x] Search box: "Buscar por nome, host, env… ⌘K" — closed by
      0f1fb06.
- [x] **Compact list** rows (9px 12px padding, grid
      `26px 1.5fr 1.4fr 80px 70px 60px`) — closed by 8ed373d:
      `<ConnectionListRow>` covers icon (or fallback for sqlite),
      name + PROD chip, host mono 10px, env mono 11px, status dot
      + latency, "N uses", ⋮ row-action trigger. Selection styled
      with 2px accent left border + accent.soft bg.
- [x] Footer hint: "⌘P abre quick-edit · ⌘⇧N nova · ⌘⌥T testar todas"
      — closed by 0f1fb06.
- [x] Empty selection shows "Select a connection or create a new one"
      — closed by 0f1fb06.

## Story 02: Detail panel — credentials section — done at component level (3f70006)

### Tasks

- [x] Read-only summary by default: host, port, user, database,
      `••••••••` for password — closed by 3f70006.
- [x] "Edit" toggles fields editable; "Save" writes through
      `ConnectionsStore` — closed by 3f70006 (component-level
      callback `onSave(input: UpdateConnectionInput)`; consumer
      wires to the store when the page is mounted).
- [x] Inline rotate-password button: prompts for new value, writes
      to keychain, updates `{{keychain:…}}` ref in `connections.toml`
      — closed by 3f70006 (component callback `onRotatePassword(newPw)`;
      consumer wires to keychain + `update_connection` on mount).

## Story 03: Detail panel — schema preview — done at component level (a4eaae5)

### Tasks

- [x] Reuses `schemaCacheStore.fetchSchema(connection_id)` — closed
      by a4eaae5. Component takes `schema/loading/error/onRefresh`
      from the consumer; the page wires `useSchemaCacheStore.ensureLoaded`
      / `refresh` on mount.
- [~] Shows table tree with column counts — closed by a4eaae5.
      **PK/FK icons + per-table row counts deferred** to a follow-
      up backend extension (audit-031) — `SchemaEntry` doesn't
      carry that metadata yet. Carries to Story 03a or Epic 28.
- [x] "Hot tables" — top 5 tables ordered by hit count — closed
      by a4eaae5 (`HOT_TABLES_LIMIT` exported, top-N section
      renders above the table tree). Real source from a
      `block_run_history` join lands with the page mount.

## Story 04: Detail panel — used-in-runbooks — done at component level (d6a3698)

### Tasks

- [x] Vault grep for blocks with `db-<connection_id>` block type
      — closed by d6a3698. Pure scanner `findUsagesInFile` /
      `findUsagesAcrossVault` in `connection-usages.ts` walks
      markdown line-by-line and matches opening fences with
      whitespace-bounded `db-<id>` token. Tauri-side vault-walk
      command carries — consumer hook drives the scanner.
- [x] List file:line entries; click to open file at that block —
      closed by d6a3698. `<ConnectionDetailUsedIn>` renders
      file:line + optional 80-char preview line, dispatches
      `onOpen(filePath, line)`.
- [ ] Cached on connection select; refreshes on file save —
      consumer cache hook (carry; uses the existing `fs/watcher.rs`
      debounce). Component is consumer-driven so this lands
      with the page mount slice.

## Story 05: Footer actions

### Tasks

- [ ] **Test** — calls `test_connection` Tauri command; shows
      success/failure inline with latency
- [ ] **Rotate** — opens password rotation dialog (Story 02)
- [ ] **Duplicate** — clones the connection with " (copy)" appended
      to name; password not copied (forces re-entry)
- [ ] **Delete** — confirms, removes from `connections.toml` + keychain

## Story 06: New connection modal with tabs (canvas spec)

### Tasks

- [ ] Modal 880×~660 centered on dimmed list bg
- [ ] **Sidebar pick-kind (220px)** with header serif 16
      "Nova conexão" + sub "Escolha o tipo"; lists all 9 types from
      Story 01
- [ ] **Form area (1fr)**:
      - Header row: connection icon 32 + serif 22 type name +
        sub "Suporta versões 11+. SSH tunnel disponível." 11px
      - Right hint pill: "⌥ Cole uma `connection string`"
      - **Tabs (4)** with 2px accent underline on active:
        - **Formulário** (active by default)
        - Connection string
        - SSH tunnel
        - SSL
- [ ] Postgres form fields:
      - Nome
      - Host (2fr) + Porta (90px) grid
      - Database + Usuário grid
      - Senha (type=password) with hint "Salva apenas no seu
        keychain. Outro device → recadastrar."; suffix "🔑 keychain"
- [ ] **"Vincular ao ambiente"** pills: each env (local / staging /
      qa-eu / prod (read-only)) selectable; active gets accent-soft
      bg + accent border. `+ novo` dashed pill at the end.
- [ ] **Test result inline** (10×12 padding,
      `color-mix --ok 8%` bg, `--ok 30%` border, 8px radius):
      `dot-ok` + "Conexão OK" weight 500 + mono "postgres 15.4 · 47
      tables · 18ms" + "Re-testar" right (11px accent)
- [ ] Footer buttons (margin-top 22):
      `Salvar conexão` (primary) + `Cancelar` (text-only) + flex +
      `▶ Testar conexão` (ghost)
- [ ] Connection string tab — paste `postgres://…`, parser fills
      Form fields
- [ ] SSH tunnel tab — host, port, key file path, jump-host fields
      (SSH support itself is v1.x scope per `out-of-scope.md` — for
      v1, show "Coming soon" + the parsed-string flow)
- [ ] SSL tab — sslmode, root cert path, client cert + key

## Acceptance criteria

- Master-detail navigates with arrow keys (j/k or Up/Down)
- Schema preview loads in <500ms for cached schemas, with a spinner
  for fresh fetches
- Used-in-runbooks accurate after add/remove block + file save
- Rotate + duplicate don't leave dangling keychain entries
- New connection from a `postgres://` string parses correctly across
  postgres / mysql / sqlite / mongodb URLs
