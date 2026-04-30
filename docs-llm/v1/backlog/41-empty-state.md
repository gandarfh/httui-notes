# Epic 41 — Empty state polish

First-launch screen when the user has no recent vaults and no folder
currently open. Canvas §3 mocks Fuji bg + serif headline + 3 cards
(Em branco / Templates / Importar).

**Depende de:** Epic 17 (vault open/scaffold/clone backend) + Epic 40
(Fuji bg + serif tokens)
**Desbloqueia:** —
**Status:** partial done (Stories 01-07 shipped at component level
— commits d5917f1 + 6755c2e + 32d8f5f + 6a24781 + 459053c + 3e368c8
+ d0d9657 + 95689c4; carries: 04/05 picker logic + 06 paste-URL
handler + 07 detection hook + AppShell mount)
**Effort:** 2-3 days

---

## Story 01: Layout

### Tasks

- [ ] `EmptyVaultScreen.tsx` — 260px sidebar / 1fr main (canvas spec)
- [ ] **Main bg composition** (3 stacked layers, `position:absolute`):
      - `fuji.png` cover, `position: center 35%`, opacity **0.32**
      - Linear gradient top-down (paper at 40% → 78% → 100%)
      - Radial gradient bottom-vignette
- [ ] **Eyebrow badge** (mono 11px weight 700 ls 0.12 accent):
      `NEW · WORKSPACE READY`
- [ ] **H1** (serif 64px weight 400 line-height 1.05):
      ```
      Um caderno em
      branco, e um
      <em>request</em> esperando.
      ```
      Where `<em>` is italic weight 500 in `--accent`
- [ ] **Lead paragraph** (serif 18px italic max-width 540):
      "Cada runbook é um arquivo `.md` que você lê, executa e
      versiona. Comece em branco, parta de um template, ou traga
      sua coleção do Postman."
      Inline `.md` is mono 14px non-italic with
      `color-mix --accent 12%` highlight bg.
- [x] 3 cards centered (`1.3fr 1fr 1fr` grid, gap 14, max-width 760) — closed by 3e368c8
- [ ] Sidebar (260px) — see Story 02
- [ ] Mounted by AppShell when `workspaceStore.vaultPath === null`

## Story 02: Sidebar (260px) — done (commit 6755c2e)

### Tasks

- [x] WORKSPACE label (mono 11px weight 700 ls 0.08 fg.2 uppercase)
      — closed by 6755c2e.
- [x] Workspace pill — 18×18 square avatar with first letter +
      name + chev-d. Defaults to "default" placeholder; click
      handler optional. Carry: real workspace concept (per-machine
      workspace identity separate from per-vault) when that ships.
- [x] CTA "Novo runbook" — accent bg via `<Btn variant="primary">`,
      plus icon. Dispatches the existing `handleCreate` scaffold
      flow.
- [x] RECENTES + empty-state copy — closed by 6755c2e.
- [x] EXPLORAR with 4 bullets (Templates / Connections (0) /
      Variables (0) / Members (1)) — closed by 6755c2e.

## Story 03: Em branco card (PROTAGONIST) — done (commit 32d8f5f)

### Tasks

- [x] Deep-ink-blue background + 12px radius + spec'd box-shadow —
      closed by 32d8f5f. Uses `THEME_DARK.bg`.
- [x] Decorative giant `✎` 140px serif opacity 0.06 in top-right,
      aria-hidden + non-interactive — closed by 32d8f5f.
- [x] "RECOMENDADO" eyebrow 13px weight 600 uppercase accent —
      closed by 32d8f5f.
- [x] Title serif 26px weight 500 "Em branco" — closed by 32d8f5f.
- [x] Body 13px opacity 0.75 — closed by 32d8f5f.
- [x] CTA inline pill (white bg, ink text, 32px tall) "Criar
      primeiro runbook →" with descriptive aria-label — closed by
      32d8f5f.
- [x] Click → existing scaffold flow (`handleCreate`) — closed by
      32d8f5f.

## Story 04: Templates card — partial done (commit 6a24781)

### Tasks

- [x] Visual card per canvas spec (white bg, line border, 12px
      radius, moss icon, serif title, body, 3-bullet starter list +
      "+ N templates →" accent tail) — closed by 6a24781.
- [ ] **Carry**: real template registry — list built-in templates
      from `httui-core/embedded-templates/` + vault-local
      `.httui/templates/*.md`; click handler opens the picker that
      copies the chosen template into a fresh vault via
      `scaffold_vault`.

## Story 05: Importar card

### Tasks — partial done (commit 459053c)

- [x] Visual card per canvas spec (white card, line border, 12px
      radius, orange ↘ icon, serif title, body, 6 pill chips
      Postman / Bruno / Insomnia / OpenAPI / HAR / .env) — closed
      by 459053c. `IMPORT_FORMATS` exported.
- [ ] **Carry**: file-picker + per-format parser modules under
      `httui-core/src/import/` mapping into v1 vault layout
      (`runbooks/<name>.md` + `connections.toml` + `envs/`).
      `.env` parser already exists from Epic 54 Story 01 (commits
      cbce6e1 + 8b87e60) — reuse `httui_core::dotenv`.
- [ ] **Carry**: dry-run preview + error report for un-mappable
      items.

## Story 06: Footer hint (margin-top 36) — partial done (commit d0d9657)

### Tasks

- [x] Visual hint with ⌘V kbd + Tour placeholder — closed by
      d0d9657. Tour kept visible with `cursor: not-allowed` + title
      "Coming in v1.x" per spec.
- [x] ⌘V paste-URL handler — closed by 8c8b43b. Document-level
      paste listener on `<EmptyVaultScreen>`; pure
      `extractUrl`/`buildRunbookFromUrl` helpers in
      `lib/paste-url.ts` (11 tests, 100% coverage). URL hit triggers
      `handleCreateWithUrl` — scaffold + `write_note(vault,
      "runbooks/untitled.md", body)` + `switchVault`. Non-URL
      pastes (and pastes inside inputs / textareas /
      contenteditable) fall through to the OS.

## Story 07: First-launch banner after MVP upgrade — partial done (commit 95689c4)

### Tasks

- [x] `<MigrationBanner onMigrate onDismiss docsHref?>` visual —
      closed by 95689c4. `role="alert"`, primary CTA, dismiss icon
      button, docs link.
- [ ] **Carry**: AppShell mount of `<MigrationBanner>` (slice 3)
      + wire `migrate_vault_to_v1` Tauri dispatch through the
      banner's `onMigrate` callback (slice 4).
      Slice 1 shipped (commit 5e13578): dismissal persistence
      schema + `useSettingsStore.setMvpMigrationDismissed`.
      Slice 2 shipped (commit 2be0096): backend
      `detect_migration_candidate` + `detect_vault_migration`
      Tauri command + `useMigrationDetection(vaultPath)` hook
      returning `{ candidate, shouldShowBanner, dismiss, refresh }`.

## Acceptance criteria

- New install opens to Fuji empty state; never an error
- All 3 cards reachable by keyboard (Tab + Enter)
- Importar handles a real Postman v2.1 collection without losing
  request bodies or env vars
- Banner only fires once per detected MVP db; dismissable
