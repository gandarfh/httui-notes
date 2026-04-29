# Architecture Decision Records

Locked-in foundational decisions for httui v1. Each ADR is a snapshot of
the decision *at the time it was accepted*, not a living document. If a
decision later changes, write a new ADR that supersedes it.

## Index

| # | Title | Status |
|---|---|---|
| 0001 | [TOML schemas](./0001-toml-schemas.md) | Accepted |
| 0002 | [Secret reference syntax](./0002-secret-references.md) | Accepted |
| 0003 | [File watcher contract](./0003-file-watcher.md) | Accepted |
| 0004 | [Local override semantics](./0004-local-overrides.md) | Accepted |

## Template

```markdown
# ADR NNNN — Short title

**Status:** Proposed | Accepted | Superseded by NNNN
**Date:** YYYY-MM-DD
**Deciders:** (optional — solo project for now)

## Context

What is the problem and why is it worth deciding now?

## Decision

The actual choice, in plain language. Specific enough that an
implementer doesn't have to guess.

## Consequences

- Positive: what gets easier
- Negative: what gets harder, what we accept as cost
- Neutral: what changes behavior without being obviously good or bad
```

## Conventions

- File names: `NNNN-short-slug.md`, four-digit zero-padded
- One decision per ADR — split if a doc tries to cover multiple unrelated
  choices
- Reference other ADRs by number (`see ADR 0001`) so renames don't break
  links
- Don't edit accepted ADRs except for typo fixes; supersede instead
