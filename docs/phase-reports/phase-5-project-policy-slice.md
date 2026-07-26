# Phase 5 project and policy slice

Status: Functional vertical slice with persisted project metadata.

## Delivered

- Default local project with declared paths and hosts.
- Project list/create/detail routes.
- Conversation-to-project assignment.
- Global, project, and conversation policy resolution.
- Explainable decisions for reads, writes, commands, and network actions.
- Approval records with immutable action hashes.
- Approval list, approve, and deny routes.
- Browser project selector and approval inbox count.
- Browser project creation action with declared workspace paths and hosts.
- Browser project permission control with Ask every time, Safe actions, and Full
  autonomy modes.
- Project permission mode route that writes explicit policy decisions and an
  audit record.
- Conversation-level permission override control with an inherit option.
- Bounded project instructions applied server-side to normal Hermes messages.
- Browser project editing and archiving with preserved paths, hosts, and creation time.
- In-app project form for create/edit, with declared paths, hosts, and instructions.
- Approval drawer can explicitly add an approved path or host to the project boundary;
  the original action remains a separate approval decision.

## Evidence

- `apps/api/src/policy.test.ts`: inheritance, path boundaries, write approval,
  denial, host boundary, and permission mode mapping tests pass.
- `apps/api/src/app.test.ts`: project creation/listing, policy evaluation, and
  conversation linking, project edit/archive, project mode updates, and
  conversation overrides pass.
- `tests/e2e/navigation.spec.ts`: project creation, editing, and archiving pass
  in Chromium and Firefox.
- `tests/e2e/approval-review.spec.ts`: boundary expansion from the approval drawer
  passes in Chromium and Firefox.
- Manual runtime evaluation of a write outside the default boundary returned
  `decision: approval` and a pending hashed approval record.
- Full workspace check passes with 411 tests.

## Known limits

- The mock Hermes transport supports Command Center policy approval decisions for
  browser tests. Native Hermes approval execution still needs a focused live
  runtime check; the WebSocket adapter maps approve/deny to Hermes
  `approval.respond`.
- The policy classifier is intentionally narrow. Safe mode currently allows
  command actions as one coarse category; it does not inspect shell commands or
  file operations from Hermes tool payloads.
