# 032 — Story 05 "Rotate" task stays in credentials section

**Date:** 2026-04-30 00:30
**Epic:** 42 — Connections refined UI
**Story:** 05 — Footer actions

## Context

Canvas §5 lists Story 05's footer actions as Test / Rotate /
Duplicate / Delete (4 buttons). Story 02 already shipped a
"🔑 Rotate password" button inside `<ConnectionDetailCredentials>`
(commit `3f70006`) with the same flow: prompt for new password,
write to keychain, surface error inline.

Adding a second Rotate button in the footer would either:
- Duplicate the inline rotate-password input UX in two places, or
- Trigger a "rotate" event that scrolls / focuses the credentials
  rotate row, which is the same as just clicking the existing
  button.

## Options considered

- **A** — Mirror the canvas literally: 4 buttons in the footer,
  Rotate triggers the credentials section's rotate flow via a
  ref / scroll-to + focus.
- **B** — Keep the 3 actually-distinct footer actions (Test,
  Duplicate, Delete), leave Rotate where it lives in the
  credentials section.
- **C** — Move Rotate from credentials to footer entirely.
  Requires unwinding part of Story 02.

## Decision

Chose **B**. Rationale:

1. The Story 02 placement is contextually correct — the Rotate
   button sits next to the password mask field, which is what
   the user sees when they decide to rotate.
2. Adding a second entry point in the footer is UX clutter that
   doesn't add capability.
3. Option C would split a working feature for cosmetic alignment
   with the canvas mock, churn that the
   `feedback_follow_roadmap_order` memory specifically warns
   against.

Trade-off accepted: the footer renders 3 buttons (Test, Duplicate,
Delete) instead of 4. Documented in
`<ConnectionDetailFooter>`'s top-of-file comment.

## Reversibility

- Cost to undo: trivial — add a 4th button calling a
  `onRotateRequested` prop wired to expose the credentials
  rotate flow.
- How: the credentials component would need to accept an
  external "open rotate" trigger; a `useImperativeHandle`-style
  ref, or a parent-managed state.
- When it would make sense to revert: if user testing surfaces
  that footer-Rotate is materially more discoverable than the
  inline button.

## Follow-ups

- [ ] None. The 3-button footer plus credentials-Rotate covers
      the canvas semantics; no carry.
