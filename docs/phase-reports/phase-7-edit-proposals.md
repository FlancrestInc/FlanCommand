# Phase 7: Edit proposals and exact diffs

Status: initial review-first editing slice complete.

## Shipped

- Bounded text edit proposals for declared workspace files.
- Before and after SHA-256 hashes.
- Before and after content review in the browser.
- Unified line-aware diff with context, additions, removals, and old/new line
  numbers.
- Explicit approve and reject actions.
- Stale-file detection before write.
- Visible stale-proposal state that disables write actions after a conflict.
- Audit records with path and hashes, without file content.
- Safe project-boundary and policy checks before proposal creation.
- Exact approved creation of new text files when the target is absent.

## Evidence

- Unit tests cover exact hashes, approved writes, and stale proposals.
- API tests cover proposal creation, approval, resulting file content, and stale approval rejection.
- `apps/web/src/unified-diff.test.ts` covers context, additions, removals, and
  line numbering.
- Full repository checks pass with 411 tests.

## Boundaries

This slice handles existing text files and exact approved creation of new text
files. It does not yet support binary diffs, side-by-side syntax highlighting,
conflict merge, or Hermes-structured edit events.
