---
description: Autonomous version of /start — picks the next epic, decides solo, audits each call.
allowed-tools: Read, Bash, Grep, Glob, Edit, Write, ScheduleWakeup
---

You're running in **autonomous mode** for the httui v1 refactor. There is
no human in the loop right now — you decide, execute, commit, log, and
schedule the next iteration. **Do NOT ask "should I continue?" or use
ExitPlanMode**. Your output is read after the fact via the audit folder.

# 1. Orient

Same as `/start`:

- Read `docs-llm/v1/backlog/README.md` (epic index)
- Read `docs-llm/v1/tech-debt.md` and `docs-llm/v1/definition-of-done.md`
- Read recent git log: `git log --oneline -10`
- Check uncommitted state: `git status --short`
- Read `docs-llm/jaum-audit/README.md` for the audit format

# 2. Pick the next epic

- First **pending** epic in the backlog index (top-down).
- Skip epics whose `Depende de` is not yet `done`.
- If no pending epic remains: write a final `audit/exit-{timestamp}.md`
  noting "all epics done", do NOT call ScheduleWakeup, exit normally.

# 3. Read the epic file

Internalize Stories, Tasks (`- [ ]`), `Depende de`, `Desbloqueia`,
acceptance criteria.

# 4. Validate prerequisites

- The dependency epic must be done.
- Verify referenced artifacts (file paths, modules) exist.
- If broken: write an audit entry classifying the breakage, mark the
  epic as `blocked` in the backlog README, move on to the **next**
  pending epic. Do not stop the loop unless every remaining epic is
  blocked.

# 5. Decide unilaterally — but log

For every non-trivial decision (architecture call, library choice, scope
trade-off, work moved between epics, opt-out from a quality gate):

1. Pick the option you'd recommend after thinking it through.
2. **Write an audit entry** at `docs-llm/jaum-audit/{NNN}-{slug}.md`
   following the template in `docs-llm/jaum-audit/README.md`. Use the
   next available 3-digit number.
3. Continue executing. Don't wait for review.

Bias: **smaller, reversible, well-tested over big-bang**. When in doubt,
the option that's easiest to undo wins.

# 6. Execute

For each Story in the chosen epic, in order:

- Make the edits (Edit / Write / Bash).
- Run targeted tests (`cargo test -p <crate>` or `npm run test --
  <pattern>`) — not the whole workspace unless the epic requires it.
- Run `make quality-check` (size + coverage gates) before committing
  anything substantial.
- If a gate fails: pick the cheapest fix (add tests / split the file /
  document an opt-out with audit entry). **Do NOT bypass gates by
  editing the script.**
- Commit atomically per Story with the same message style we've been
  using (`feat(crate): summary (epic NN / story NN)`).

# 7. Update tracking

After each epic finishes:

- Mark every Task in the epic file `[x]` with the closing commit hash.
- Update the epic's status header to `done` (or `done (foundation only
  — cutover moved to Epic 12)` when applicable).
- Update `docs-llm/v1/backlog/README.md` index status column.
- If you closed any item in `tech-debt.md`, move it to "Closed items"
  with the commit hash.
- Append to `docs-llm/jaum-audit/SESSION-LOG.md` a one-line summary:
  `2026-04-29 14:32 — Epic 09 done (commits a1b2c3, d4e5f6); 3 audit
  entries (audit-007 .. 009)`.

# 8. Iterate

When the epic is committed and tracking is updated:

- If more epics are pending: call `ScheduleWakeup` with delay 60s and
  the **same `/auto-start` prompt** so the loop continues.
- If contextual size feels heavy (lots of files read this turn,
  many commits made): write a `state-{timestamp}.md` snapshot in the
  audit folder summarizing where you are, then ScheduleWakeup. The
  next wake-up reads `state-*.md` first to retake context cheaply.
- If something genuinely catastrophic happened (workspace broken, can't
  recover): write `audit/CRITICAL-{timestamp}.md` describing the state,
  do NOT ScheduleWakeup. The user reviews before re-launching.

# Things you do NOT do in this mode

- Do NOT ask the user a question. Decide and audit.
- Do NOT use ExitPlanMode (no human plan review).
- Do NOT add a `// coverage:exclude file` or `// size:exclude file`
  without an audit entry justifying it AND a Sweep epic owning the
  removal.
- Do NOT skip gates by editing the gate scripts.
- Do NOT push to remote (only the user pushes; commits stay local).
- Do NOT touch areas listed in `out-of-scope.md`.
- Do NOT scope-creep — if you find a problem outside the current
  epic, write an audit entry and add it to `tech-debt.md`, don't fix
  it now.

# Honesty notes

You will make calls the user might disagree with. That's the point of
the audit folder — they read it after, push back, you correct in a
later epic. Your job is to keep the loop moving, not to optimize every
decision to perfection.
