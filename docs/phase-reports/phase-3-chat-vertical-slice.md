# Phase 3 chat vertical slice

Status: Functional slice with authenticated live Hermes verification.

## Delivered

- API BFF serves the browser and keeps Hermes server-side.
- Session list, create, detail, health, capability, model, command, stop,
  retry, and model-selection routes exist.
- Message sends stream normalized adapter events over SSE.
- The browser renders conversations, Markdown-like text, code blocks, working
  state, stop, activity, context/token hints, developer events, model controls,
  slash-command discovery, a command palette, draft persistence, theme choice,
  responsive mobile navigation, capability-gated retry controls, and in-page
  drawers for approvals, jobs, and notifications.
- Tool activity rows now show safe tool inputs, streamed output, results, and
  approval details instead of reducing every event to a label.
- Completed runs now collapse to a compact duration/tool/approval summary;
  Expand reveals the event timeline and Developer Mode shows the sanitized
  normalized event stream.
- A dropped chat stream preserves the submitted prompt, refreshes session state
  on demand, and blocks accidental duplicate sends until the user chooses to
  retry.
- API and Hermes failures keep the safe cause and next action in the browser
  error message, so transport outages explain how to recover.
- Browser end-to-end coverage drives the real shell through Chromium and Firefox for chat,
  model selection, mobile navigation, drawers, rename persistence, file
  preview, approval review, and dropped-stream recovery.

## Evidence

- `apps/api/src/app.test.ts`: four API contract tests pass.
- `npm run check`: format, lint, both typechecks, 411 unit tests, and build pass.
- `npm run test:e2e`: Chromium tests pass against the built API and mock.
- `npm run test:e2e:firefox`: Firefox tests pass against the built API and mock.
  Hermes transport.
- Authenticated live runtime check: session list, history restore, model options,
  model switching through Hermes `config.set`, and a real `prompt.submit` turn
  returned successfully through API SSE. A fresh-session check also resumed a
  newly created session and streamed `live adapter check passed` through the
  browser-facing API.

## Known limits

- An authenticated Hermes runtime check now proves slash-command execution,
  retry, an in-flight stop, and a native Hermes approval denial that resumed
  the waiting run. The approval API also created, approved, and denied policy
  approvals against the live gateway.
- Safari-specific visual checks and Add to Home Screen behavior still need a real Safari device pass.
