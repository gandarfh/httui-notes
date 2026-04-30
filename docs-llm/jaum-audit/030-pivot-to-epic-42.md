# 030 — Pivot to Epic 42 after user roadmap-order pushback

**Date:** 2026-04-29 18:00
**Epic:** n/a — loop discipline correction
**Story:** n/a

## Context

Mid-session, after committing Epic 41 Story 07 carry slice 4
(`a142ff2`) — which closed the migration banner end-to-end —
the user surfaced this complaint:

> "eu sinto que a gente teve um monte de commit no desktop, porem
> parece que não vi a impleentacao de nada, parece que esta sempre
> mexewndo nas mesmas coisas... vc nao parece que esta seguindo o
> cronograma, implementa na ordem bonitinha que temos, tem um
> monte de feature que tinha no inicio que pulamos para ter o
> backend primeiro, mas até agora nao voltamos nelas..."

Looking back at this autonomous session's commits in chronological
order:

| Commit | What |
|---|---|
| `8b704b3` | refactor: split schema_cache_remote (audit-028) |
| `5b8eb50` | docs: SESSION-LOG entry |
| `ff8b28c` | test: pool_manager opt-out lift |
| `47d2004` | docs: SESSION-LOG + state snapshot |
| `5e13578` | feat: mvp_migration_dismissed schema (slice 1) |
| `71bbecb` | docs: SESSION-LOG + audit-029 + close-out |
| `2be0096` | feat: MVP migration detection hook (slice 2) |
| `58af5da` | docs: SESSION-LOG + state snapshot |
| `a142ff2` | feat: MigrationBannerHost in AppShell (slices 3+4) |

9 commits. 4 are docs/audit hygiene. 3 are audit-027 unwind
internals (schema_cache + pool_manager). 4 are migration banner —
a corner-case feature that fires only on the small subset of
users upgrading from the deprecated MVP. **Zero** commits on the
canvas-driven flagship epics (42-52) the original cronograma
promised after 39-41 closed at component level.

The user is right. This is the loop pattern the
`feedback_follow_roadmap_order` memory entry now flags as the
anti-pattern: stacking carry-slices and hygiene churn instead of
moving to the next fresh epic.

## Options considered

- **A** — Continue down the current path (more carry-slice work
  on remaining Epic 41 carries — Templates picker, Importar
  parser). Each is small, testable, and "in flight". But that's
  exactly the pattern the user just called out.
- **B** — Pivot to **Epic 42 (Connections refined UI)**. Next
  fresh canvas-driven epic in chronological order; substantial,
  user-visible; unblocks rescoped popover Epics 23 + 24 (per
  audit-012). Closes a real piece of the canvas spec §5.
- **C** — Pivot to **Epic 48 (Git panel UI)** instead. Closes
  Epic 20's UI gap (which has been "partial done" since
  fba2a80). Possibly the most-visible single feature.
- **D** — Pause the loop entirely and wait for a human pick.
  Violates the autonomous-mode rule "Do NOT ask".

## Decision

Chose **B** — pivot to Epic 42. Rationale:

1. The canvas-driven epics (39-52) have a deliberate
   chronological order (per `backlog/README.md`'s Phase
   table). 39 + 40 + 41 are at component level; 42 is next.
   Following the order closes the user's "implementa na ordem
   bonitinha" critique directly.
2. Epic 42 is substantive — Connection management UI gets a
   refresh. Multi-Story epic with visible payoff. Unblocks
   downstream Epics 23 (connection quick-edit popover) and 28
   (sidebar Schema tab).
3. Bigger than a slice but smaller than a multi-week
   greenfield. Right size for an autonomous iteration.
4. Saved memory entry `feedback_follow_roadmap_order` ensures
   future loops apply the same discipline without waiting for
   another pushback.

Trade-off accepted: Epic 41's two remaining carries (Templates
picker registry, Importar parser modules) get pushed further
right. The visual cards are already shipped; the wiring carries
land opportunistically when an epic touches the area, or in
the 30a sweep epic. The user's pushback specifically frames
those carries as the kind of "always touching the same things"
churn to break out of.

## Reversibility

- Cost to undo: trivial.
- How: pick a different epic for the next iteration via the
  ScheduleWakeup `prompt` rationale.
- When it would make sense to revert: never directly — the
  pivot itself isn't reversible, but the next epic choice
  always is. If Epic 42 turns out blocked on something, fall
  back to Epic 48 (option C).

## Follow-ups

- [x] Saved `feedback_follow_roadmap_order` memory entry
      capturing the rule for future loops.
- [ ] Next iteration: open Epic 42 backlog file, internalize
      Stories + canvas §5 spec, ship Story 01.
- [ ] tech-debt.md and backlog/README.md unchanged — Epic 41
      Story 07 is closed (commit `a142ff2`); the carry pointers
      for Templates + Importar already exist there.
