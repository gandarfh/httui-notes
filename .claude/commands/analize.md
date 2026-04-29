---
description: Wrap up the current session — verify epic done, mark tasks, update docs
allowed-tools: Read, Edit, Bash, Grep, Glob
---

You're wrapping up a working session on the httui v1 refactor. Walk
through the closing checklist below in order. Don't skip steps; don't
batch them silently.

## 1. Identify what was worked on

- `git log --oneline -10` — recent commits this session
- `git status --short` — uncommitted state
- Match the work against `docs-llm/v1/backlog/` epic files. The current
  epic is the one whose Stories / Tasks line up with the commits + diff.
- If you can't tell, ask the user before proceeding.

## 2. Verify completion against the epic

For the identified epic, read its file and check each Task:

- Compare each `- [ ]` task to the work done
- Mark `- [x]` only for tasks that are clearly complete in code (not
  just "started")
- For every Acceptance criteria, verify it's actually met (run tests,
  inspect behavior, read the code). Don't trust commit messages alone.

If the epic is not actually done, list what's missing and stop. Don't
mark partial completion as done.

## 3. Update the backlog file

When the epic genuinely is done:

- Edit the epic markdown: change every relevant `- [ ]` to `- [x]`
- At the top, change `**Status:** pending` to `**Status:** done`
- Add a `**Completed:** YYYY-MM-DD` line just below Status
- Update `docs-llm/v1/backlog/README.md` index — change the row's
  status column from `pending` to `done`
- If the epic touched the Definition of Done checklist at the bottom of
  the README, tick the matching items

## 4. Update project documentation

Only update what the epic actually changed. Don't speculate.

- **`README.md`** (root, public): update if the epic changed install,
  install commands, install paths, or top-level architecture
- **`CLAUDE.md`** (root, project context for me): update sections that
  describe modules / data models / file paths / commands that this epic
  changed. Be terse — this file is for orienting future Claude sessions.
- **`docs/ARCHITECTURE.md`** (committed): only update if the epic
  modified the public architecture story. If it's still under MVP and
  not yet rewritten, leave it.
- **`CHANGELOG.md`**: add an entry under `## [Unreleased]` grouped by
  `Added / Changed / Removed / Fixed / Security`. One bullet per
  user-visible change from this epic.

## 5. Sanity build

- Run `cargo check --workspace` (or `cargo build` if check isn't enough)
- Run `npm run build` in `httui-desktop/` and `httui-web/` if frontend
  changed
- Run any test commands the epic specifies in Acceptance criteria
- If any fail, surface that and stop before declaring done

## 6. Commit the doc updates

If documentation was updated:

- Stage only the doc + backlog files
- Commit with message format: `docs(v1): close epic NN — <epic title>`
- Don't bundle implementation changes into this commit (they should
  already be committed earlier in the session)

## 7. Surface what's next

Read the epic that follows in the backlog (`Desbloqueia: Epic NN+1`).
Print a one-paragraph summary so the user knows what `/start` will
pick up next time.

## Notes

- Don't update epic statuses, Definition of Done, or CHANGELOG on
  partial work. Only when an epic is genuinely complete.
- If the user worked across multiple epics, repeat steps 2-4 for each.
- If the work was experimental and shouldn't be marked done, just print
  a summary of what was attempted and let the user decide.
