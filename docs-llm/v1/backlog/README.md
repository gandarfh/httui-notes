# V1 backlog — index

58 epics, serial dependency relaxed in places (some can run in
parallel after the foundation lands). Chronological order of
implementation; 39–52 introduced by `design-canvas-reconciliation.md`
+ audit-011, and 53–55 by audit-013 (canvas micro-detail extraction
revealed 3 more gaps).

Original target was 8-12 weeks solo. With the canvas reconciliation
the visible scope grows to ~17–20 weeks; the work was always implied,
just unbudgeted (see audit-011).

## Phases

| Range | Phase |
|---|---|
| 00-04 | Foundation — OSS readiness |
| 04.5 | Coverage gate (touched-files rule) |
| 05 | Architecture decisions (ADRs) |
| 06-12 | Storage migration (SQLite → files) |
| 13-16 | Secrets UX |
| 17-20 | App-level UX |
| 20a | Storage layer review & polish (sweep) |
| 21 | Drop out-of-scope features |
| 22-26 | Quick popovers (5) |
| 27-30 | Right sidebar tabs (4) |
| 30a | UI layer review & polish (sweep) |
| 31 | TUI parity |
| 32-35 | Tests + release pipeline |
| 36-38 | Documentation + launch |
| 39-41 | Workbench shell + design system + empty state |
| 42-44 | Connections + Vars + Envs refined UI |
| 45-47 | Block features v1 (assertions, captures, run diff) |
| 48-49 | Git panel UI + share via repo URL |
| 50-52 | DocHeader card + pre-flight + frontmatter/tags |
| 53-55 | Canvas micro-detail gaps (EXPLAIN viz, .env discovery, AI changelog) |

## Cross-cutting rules

- **Coverage**: every file modified in a commit must have ≥80% line
  coverage. Enforced from Epic 04.5 onward — see
  [definition-of-done.md](../definition-of-done.md).
- **Tech debt**: tracked in [tech-debt.md](../tech-debt.md). Items get
  retired opportunistically (epic that touches the area splits/tests
  what it touches) or in sweep epics (20a, 30a).

## Full list

| # | Epic | Status |
|---|---|---|
| 00 | [Codebase reorganization](./00-codebase-reorganization.md) | done |
| 01 | [Initial OSS docs](./01-initial-oss-docs.md) | done |
| 02 | [CI/CD pipeline](./02-ci-cd-pipeline.md) | done |
| 03 | [Pre-OSS audit](./03-pre-oss-audit.md) | done |
| 04 | [Code style baseline](./04-code-style-baseline.md) | done |
| 04.5 | [Coverage gate (touched-files rule)](./04.5-coverage-gate.md) | done (commit 98fd753) |
| 05 | [Architecture decisions (ADRs)](./05-architecture-decisions.md) | done |
| 06 | [TOML infrastructure](./06-toml-infrastructure.md) | done |
| 07 | [Connections migration](./07-connections-migration.md) | done (cutover landed in Epic 19 Story 02 Phase 3 — commit 086e7bd) |
| 08 | [Environments migration](./08-environments-migration.md) | done (cutover landed in Epic 19 Story 02 Phase 2 — commit 2432e18) |
| 09 | [Workspace + user config](./09-workspace-user-config.md) | partial done (closes by Epic 19 Story 01 / Epic 40 Story 06 — UI consumer) |
| 10 | [Local override mechanism](./10-local-override.md) | partial done (closes by Epic 40 Story 06 — UI consumer) |
| 11 | [File watcher for `.toml`](./11-file-watcher.md) | done (env-side closed in Phase 2; conn-side closed in Phase 3 — commit 086e7bd) |
| 12 | [Vault migration script](./12-vault-migration-script.md) | done (Phase 1+2+3 of Epic 19 made connections.toml + envs/*.toml the runtime source — commits 037f470 / 2432e18 / 086e7bd) |
| 13 | [Keychain prompt fix](./13-keychain-prompt-fix.md) | partial done (closes by Epic 34 — prod fix is cert-bound, audit-008) |
| 14 | [Touch ID protection](./14-touch-id-protection.md) | blocked (needs real Touch ID hardware testing) |
| 15 | [Windows Hello protection](./15-windows-hello.md) | blocked (needs Windows + Hello hardware testing) |
| 16 | [1Password CLI integration](./16-1password-integration.md) | blocked (needs `op` CLI installed for real test) |
| 17 | [Open / Clone / Create vault](./17-vault-open-clone-create.md) | partial done (closes by Epics 41+48 — empty-state UI + git clone) |
| 18 | [First-run batch secret setup](./18-first-run-secret-setup.md) | partial done (closes by Epic 41 — first-launch banner + Epic 39 status reminder) |
| 19 | [Settings split (user vs workspace)](./19-settings-split.md) | partial done (Stories 02 + 03 fully shipped; Story 01 UI carries over to Epic 40 Story 06) |
| 20 | [Git panel](./20-git-panel.md) | partial done (closes by Epic 48 — panel UI + network ops) |
| 20a | [Storage layer review & polish (sweep)](./20a-storage-refactor-sweep.md) | done (all 8 Stories closed; Story 06 ships foundation only — per-store error migration carried opportunistically) |
| 21 | [Drop out-of-scope features](./21-drop-out-of-scope.md) | deferred (UI audit; see audit-009) |
| 22 | [Popover — ⌘E env switcher](./22-popover-env-switcher.md) | pending after Epic 39+44 (rescoped — audit-012) |
| 23 | [Popover — connection quick-edit](./23-popover-connection-quick.md) | pending after Epic 42 (rescoped — audit-012) |
| 24 | [Popover — variable inline edit](./24-popover-variable-inline.md) | pending after Epic 43 (rescoped — audit-012) |
| 25 | [Popover — ⌘⇧V new variable](./25-popover-new-variable.md) | merged into Epic 43 Story 05 (audit-012) |
| 26 | [Popover — clone environment](./26-popover-clone-environment.md) | merged into Epic 44 Story 02 (audit-012) |
| 27 | [Sidebar — Outline tab](./27-sidebar-outline.md) | pending after Epic 39 (independent — audit-012) |
| 28 | [Sidebar — Schema tab polish](./28-sidebar-schema-polish.md) | pending after Epic 27+42 (rescoped — audit-012) |
| 29 | [Sidebar — History tab](./29-sidebar-history.md) | pending after Epic 27+47 (rescoped — audit-012) |
| 30 | [Sidebar — Comments tab](./30-sidebar-comments.md) | dropped (git-first; replaced by PR review — audit-011) |
| 30a | [UI layer review & polish (sweep)](./30a-ui-refactor-sweep.md) | pending after Epic 39+50 (rewritten with concrete Stories — audit-012) |
| 31 | [TUI parity](./31-tui-parity.md) | deferred (out-of-scope per `feedback_notes_app_focus`; see audit-009) |
| 32 | [Critical-path test coverage](./32-critical-path-tests.md) | partial done (Story 01 ready to execute autonomously — block exec integration tests) |
| 33 | [Performance baselines](./33-performance-baselines.md) | partial done (Story 02 task #1 shipped — `docs/PERFORMANCE.md` in commit c321aae; harness + CI integration carry forward; real-hw measurement waits for user) |
| 34 | [Code signing + packaging](./34-code-signing-packaging.md) | partial — Stories 01-02 (write scripts + entitlements + notarize flow) ready to execute; Story 03 (apply Developer ID) blocked on cert |
| 35 | [Release pipeline](./35-release-pipeline.md) | partial done (Stories 01 + 02 shipped in commit 1be68da — Windows MSI + CHANGELOG body + prerelease detection; Stories 03 + 04 wait for two-tag soak + Homebrew/winget submissions) |
| 36 | [ARCHITECTURE.md v1](./36-architecture-doc.md) | partial done (Story 02 ready to execute autonomously — Mermaid diagrams) |
| 37 | [User docs](./37-user-docs.md) | partial done (Stories 01 + 02 + 03 + 04 shipped — getting-started + concepts + blocks + chat-mcp; Story 05 hosting decision waits for human) |
| 38 | [Migration guide + launch](./38-migration-guide-launch.md) | partial done (Stories 03 + 04 closes by Epics 19/32/34/35 + ~1 week before tag — launch gate) |
| 39 | [Workbench shell redesign](./39-workbench-shell.md) | partial done (Stories 01-05 shipped — commits 002e1f5, e7bc8a2, 90bdb3f, 83edce8, 6d08e61, 6293e3c, f4e74ea, 05e27b2; mount-into-editor + per-file persistence carries) |
| 40 | [Visual design system](./40-design-system.md) | partial done (all 6 Stories shipped end-to-end — commits 446a10d, 6767693, e4b8b8b, dc8538b, f4e74ea, 590d823, 2a0ae19, dd71cd7, 78f7a81, ed0d2dc, 1e3bc77, fd22383; carries: Story 01 woff2 self-host, Story 02 HttpFencedPanel badge (Epic 30a Story 02), Story 03 PNG assets) |
| 41 | [Empty state polish](./41-empty-state.md) | partial done (Stories 01-07 shipped at component level — commits d5917f1, 6755c2e, 32d8f5f, 6a24781, 459053c, 3e368c8, d0d9657, 95689c4; carries: 04+05 picker logic + 06 paste-URL handler + 07 detection hook + AppShell mount) |
| 42 | [Connections refined UI](./42-connections-refined.md) | in progress (Stories 01-03 shipped at component level — commits 0f1fb06, 8ed373d, 3f70006, a4eaae5; audit-031; carries: real enrichment + store loader + page mount + Stories 04-06 + PK/FK row counts backend ext) |
| 43 | [Variables master-detail](./43-vars-master-detail.md) | pending (canvas §6 vars; new — audit-011) |
| 44 | [Environments page](./44-envs-page.md) | pending (canvas §6 envs; new — audit-011) |
| 45 | [Block assertions](./45-block-assertions.md) | pending (canvas §10 v1; new — audit-011) |
| 46 | [Captures + auto-capture](./46-captures.md) | pending (canvas §10 v1; new — audit-011) |
| 47 | [Run diff](./47-run-diff.md) | pending (canvas §10 v1; new — audit-011) |
| 48 | [Git panel UI](./48-git-panel-ui.md) | pending (canvas §11+§9 audit; new — audit-011) |
| 49 | [Share via repo URL](./49-share-repo-url.md) | pending (canvas §9 share rewrite; new — audit-011) |
| 50 | [DocHeader frontmatter card](./50-docheader-card.md) | pending (canvas §4 center; new — audit-011) |
| 51 | [Pre-flight checklist](./51-preflight.md) | pending (canvas §4 docheader; new — audit-011) |
| 52 | [YAML frontmatter + tags](./52-frontmatter-tags.md) | pending (canvas §4 docheader; new — audit-011) |
| 53 | [SQL EXPLAIN ANALYZE plan tree](./53-sql-explain-analyze.md) | pending (canvas Workbench §SqlBlock; new — audit-013) |
| 54 | [.env auto-discovery on vault open](./54-env-autodiscovery.md) | partial done (Story 01 closed — commits cbce6e1 + 8b87e60; Stories 02-04 carry over) |
| 55 | [AI-generated commit changelog](./55-ai-commit-changelog.md) | pending (canvas Flow §FlowSave; new — audit-013) |

## Re-routed dependencies after audit-011 + audit-012

audit-011 introduced epics 39-52. audit-012 reconciled overlap and
rewrote the sweep epics (20a, 30a) with concrete Stories per
tech-debt item.

**Merged (closed; redirected at the file)**

- Epic 25 → Epic 43 Story 05 (⌘⇧V new variable absorbed)
- Epic 26 → Epic 44 Story 02 (clone environment absorbed)

**Rescoped (kept; smaller surface)**

- Epic 22 (⌘E env switcher) — keyboard popover only; Epic 39 owns
  the visual switcher — depends on Epic 39 + Epic 44
- Epic 23 (connection quick-edit) — sidebar-anchored shortcut to
  Epic 42 actions — depends on Epic 42
- Epic 24 (variable inline) — CodeMirror chip-anchored quick view —
  depends on Epic 43
- Epic 28 (sidebar Schema) — runbook-context view reusing Epic 42
  component — depends on Epic 27 + Epic 42
- Epic 29 (sidebar History) — list view feeding Epic 47 diff —
  depends on Epic 27 + Epic 47

**Dropped (git-first lens)**

- Epic 30 (sidebar Comments) — replaced by PR review; no UI built

**Sweep epics now actionable (with concrete Stories)**

- Epic 20a — 8 Stories, every storage tech-debt item owned;
  depends on Epic 19 cutover
- Epic 30a — 8 Stories, BlockRegistry + panel splits + ESLint
  cleanup; depends on Epics 39 + 50

**Tech-debt cross-refs** — every item in `tech-debt.md` now lists a
`Closed by:` pointer to the specific epic + story.

## Definition of done — v1

All checked before public OSS release:

- [ ] Storage migrated to files (epics 06-12)
- [ ] Secrets UX (Touch ID + fix prompt) (epics 13-16)
- [ ] First-run flow working (epic 18)
- [ ] Settings split (epic 19)
- [ ] Git panel (epic 20)
- [ ] Codebase reorganized (epic 00)
- [ ] CI green (epic 02)
- [ ] Essential docs (README, CONTRIBUTING, ARCH, SECURITY) (epics 01, 36, 37)
- [ ] Critical-path tests covered (epic 32)
- [ ] Mac signed + Windows + Linux artifacts (epics 34, 35)
