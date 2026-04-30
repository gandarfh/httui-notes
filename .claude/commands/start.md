---
description: Resume v1 work — read planning docs, find current epic, propose plan
allowed-tools: Read, Bash, Grep, Glob, ExitPlanMode
---

You're resuming work on the httui v1 refactor. The full planning lives in
`docs-llm/v1/` (gitignored on line 40, **never committed** — read freely,
edit freely, but never `git add -f` it). Your job:

1. **Orient yourself** by reading the planning state:
   - `docs-llm/v1/README.md` (overview of the 6 planning docs)
   - `docs-llm/v1/backlog/README.md` (full epic index with status table)
   - `docs-llm/v1/refactor-roadmap.md` (phased plan)
   - `docs-llm/v1/out-of-scope.md` (do NOT propose anything here)

2. **Find where we stopped** — pick the current epic:
   - Scan the backlog README index for first `pending` or `in_progress` epic
   - Cross-check against recent git log: `git log --oneline -20`
   - Cross-check uncommitted state: `git status --short`
   - If anything was committed but the backlog isn't marked done, that
     epic is the most likely "in flight" one

3. **Read the epic file** for the current target. Internalize:
   - The Stories and their Tasks (`- [ ]` checkboxes)
   - **Depende de** / **Desbloqueia** / **Effort**
   - Acceptance criteria

4. **Validate prerequisites:**
   - The dependency epic must be done. If not, surface that and stop.
   - Verify any artifacts the epic assumes exist (e.g., file paths,
     types, modules) actually exist in the codebase.

5. **Enter plan mode** and propose the implementation:
   - Concrete file edits / additions, by path
   - Order of operations (what to do first, what depends on what)
   - Tests to add
   - Risks / things you're unsure about
   - Approximate effort vs. the epic's estimate

Use **ExitPlanMode** to present the plan and wait for user approval before
making any code changes. Don't auto-execute. Don't propose work outside
the current epic's scope. If the user wants to skip ahead to a different
epic, ask them to confirm explicitly.

If the backlog index is missing or empty, fall back to:
`docs-llm/v1/refactor-roadmap.md` for a higher-level pick.

If `docs-llm/v1/` itself doesn't exist, tell the user the planning docs
are missing locally and offer to recreate them from the conversation history.
