# Hermes Foundation and Integration Probe Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 0 monorepo foundation and a safe, evidence-backed Phase 1 probe for the installed Hermes Agent gateway.

**Architecture:** Keep a TypeScript workspace with shared schemas, a native Hermes WebSocket adapter, a mock transport, and a CLI probe. Raw Hermes frames stay inside the adapter/probe boundary; future Barnabas API and browser packages consume normalized types only. Live probing defaults to read-only and requires explicit flags for an isolated test session.

**Tech Stack:** TypeScript, pnpm workspaces, Node.js, Vitest, ESLint, Prettier, Zod, WebSocket client, Docker Compose, GitHub Actions.

---

## Chunk 1: Repository foundation

Bootstrap order: create the root workspace and package manifests first, then
add source and tests in later chunks. Run the full check only after Chunk 4;
early tasks use targeted checks for files that already exist.

### Task 1: Create workspace metadata and scripts

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `README.md`

- [ ] Add workspace scripts for `format`, `format:check`, `lint`, `typecheck`, `test`, `build`, and `check`.
- [ ] Add a `dev` script that starts the local development stack in one command;
  document its exact command and expected healthy output in `README.md`.
- [ ] Define `apps/*`, `packages/*`, and `probe/*` workspace globs.
- [ ] Configure strict TypeScript with no implicit any and no unchecked project imports.
- [ ] Document `pnpm install`, the check command, mock probe command, and live probe command.
- [ ] Ignore dependencies, build output, local env files, probe output, transcripts, and local state.
- [ ] Add `CONTRIBUTING.md` with branch names, small commit conventions, and the
  rule that live probe output is never committed.

### Task 2: Add linting, formatting, and CI

**Files:**
- Create: `eslint.config.mjs`
- Create: `.prettierrc.json`
- Create: `.github/workflows/check.yml`

- [ ] Configure ESLint for TypeScript source and tests.
- [ ] Configure Prettier with a stable line width and repository defaults.
- [ ] Run install, formatting check, lint, typecheck, tests, and build in CI.
- [ ] Keep CI independent of a live Hermes instance.

### Task 3: Add environment validation and placeholders

**Files:**
- Create: `packages/config/package.json`
- Create: `packages/config/src/env.ts`
- Create: `packages/config/src/index.ts`
- Create: `packages/config/src/env.test.ts`
- Create: `apps/api/package.json`
- Create: `apps/api/src/index.ts`
- Create: `apps/web/package.json`
- Create: `apps/web/src/index.ts`

- [ ] Validate endpoint, output directory, auth reference, and probe limits with Zod.
- [ ] Make secrets input-only and never include secret values in parsed error output.
- [ ] Keep API and web placeholders non-functional but compilable.
- [ ] Write failing environment tests first, then implement the parser.

### Task 4: Add local development service documentation

**Files:**
- Create: `compose.yaml`
- Create: `docs/operations/local-development.md`

- [ ] Add only services needed by the current foundation; do not invent production dependencies.
- [ ] Document why PostgreSQL is deferred until the first persistence slice.
- [ ] Document how to run Hermes locally and why the browser must not connect to it directly.

## Chunk 2: Shared event schema and adapter contract

### Task 5: Define normalized types and validation

**Files:**
- Create: `packages/event-schema/package.json`
- Create: `packages/event-schema/src/types.ts`
- Create: `packages/event-schema/src/schemas.ts`
- Create: `packages/event-schema/src/index.ts`
- Create: `packages/event-schema/src/schemas.test.ts`

- [ ] Define session, model, command, safe error, capability, usage, approval, and artifact reference types.
- [ ] Define normalized `AgentEvent` variants for run, message, tool, approval, clarification, memory, artifact, context, unknown, and reconnect gaps.
- [ ] Validate external-shaped data with Zod before it reaches callers.
- [ ] Test valid frames, malformed frames, unknown events, and redacted safe errors.

### Task 6: Define the adapter interface and capability statuses

**Files:**
- Create: `packages/hermes-adapter/package.json`
- Create: `packages/hermes-adapter/src/adapter.ts`
- Create: `packages/hermes-adapter/src/capabilities.ts`
- Create: `packages/hermes-adapter/src/errors.ts`
- Create: `packages/hermes-adapter/src/index.ts`
- Test: `packages/hermes-adapter/src/adapter.test.ts`

- [ ] Match the adapter boundary in the approved design, including session, retry, command, model, and approval operations.
- [ ] Represent each capability as observed, source-inferred, unsupported, not observed, not tested, or blocked.
- [ ] Return typed actionable errors for unsupported operations and invalid state.
- [ ] Test that the public package exports no raw Hermes transport types.

### Task 6a: Wire adapter implementations behind a factory

**Files:**
- Create: `packages/hermes-adapter/src/hermes-adapter.ts`
- Create: `packages/hermes-adapter/src/create-adapter.ts`
- Create: `packages/hermes-adapter/src/create-adapter.test.ts`

- [ ] Implement the public adapter by composing transport, normalizer, and
  capability registry.
- [ ] Provide factory options for `mock` and `websocket` transport.
- [ ] Keep transport selection out of callers that consume `HermesAdapter`.
- [ ] Test that both factories expose the same adapter contract.

## Chunk 3: Redaction, native frames, and mock transport

### Task 7: Implement centralized redaction

**Files:**
- Create: `packages/hermes-adapter/src/redaction.ts`
- Create: `packages/hermes-adapter/src/redaction.test.ts`

- [ ] Redact auth headers, cookies, tokens, passwords, private-key blocks, secret-like environment values, endpoint credentials, and configured test secrets.
- [ ] Handle nested objects, arrays, error messages, filenames, URLs, and secrets split across streamed chunks.
- [ ] Preserve useful structure and return safe copies without mutating caller input.
- [ ] Test exact values and pattern-based values.

### Task 8: Implement native frame parsing and normalization

**Files:**
- Create: `packages/hermes-adapter/src/native.ts`
- Create: `packages/hermes-adapter/src/normalize.ts`
- Create: `packages/hermes-adapter/src/normalize.test.ts`

- [ ] Parse JSON-RPC responses and Hermes event frames with strict shape checks.
- [ ] Normalize known turn, delta, tool, approval, clarification, context, and completion frames.
- [ ] Preserve sanitized unknown frames as diagnostics.
- [ ] Detect duplicates using transport, request id, event type, session id, run id, sequence, or content hash.
- [ ] Test malformed JSON, missing correlation, repeated frames, and unknown fields.

### Task 9: Build a deterministic mock gateway

**Files:**
- Create: `packages/hermes-adapter/src/mock-transport.ts`
- Create: `packages/hermes-adapter/src/mock-transport.test.ts`
- Create: `tests/fixtures/hermes/mock-stream.jsonl`

- [ ] Support handshake, session list/create/resume, streamed response, stop, reconnect, and two-session concurrency.
- [ ] Emit the same sanitized fixture sequence on every run.
- [ ] Simulate a reconnect gap and duplicate frame for regression tests.
- [ ] Ensure mock output cannot be mistaken for live capability evidence.

## Chunk 4: Live WebSocket transport and probe CLI

### Task 10: Implement bounded WebSocket RPC transport

**Files:**
- Create: `packages/hermes-adapter/src/ws-transport.ts`
- Create: `packages/hermes-adapter/src/ws-transport.test.ts`

- [ ] Implement request IDs, response matching, event delivery, connect/request/idle/total timeouts, frame-size caps, and close handling.
- [ ] Verify origin and auth configuration without logging sensitive values.
- [ ] Preserve reconnect cursors where Hermes exposes them and emit an explicit gap event otherwise.
- [ ] Test timeout, auth failure, malformed response, disconnect, reconnect, and duplicate response behavior against a local fake server.

### Task 11: Add probe CLI and safe test profile

**Files:**
- Create: `probe/cli/package.json`
- Create: `probe/cli/src/main.ts`
- Create: `probe/cli/src/options.ts`
- Create: `probe/cli/src/runner.ts`
- Create: `probe/cli/src/report.ts`
- Create: `probe/cli/src/test-profile.ts`
- Create: `probe/cli/src/evidence.ts`
- Create: `probe/cli/src/main.test.ts`

- [ ] Add exact flags: `--mode mock|live`, `--endpoint`, `--origin`,
  `--output`, `--allow-private-endpoint`, `--allow-test-mutations`, and
  `--profile hermes-command-center-safe`.
- [ ] Use defaults of 5s connect, 10s request, 30s idle, 120s total runtime,
  1 MiB frame size, 10 MiB transcript size, 500 events, and one test session.
- [ ] Define exit codes: `0` complete, `2` invalid options, `3` safety refusal,
  `4` unexpected live/probe failure, and `5` environment-blocked with a report.
- [ ] Enforce loopback/private endpoint flags, mutation flag, exact test-session title prefix, output-directory safety, resource limits, and non-zero failure exits.
- [ ] Make `test-profile.ts` own the exact prompt:
  `Reply with exactly: HERMES_PROBE_OK. Do not call tools, read or write files,
  access the network, use credentials, send messages, or cause external side
  effects.` Refuse to send if the gateway cannot represent or enforce the
  required no-tool constraint.
- [ ] Make `evidence.ts` own provenance values, transcript paths, and the
  thirteen-row research-question matrix.
- [ ] Refuse existing or Telegram sessions: list first, create the exact
  prefixed session, verify the returned ID is new, and abort before sending if
  verification is unavailable.
- [ ] Create a new output directory only when absent; reject symlinks, existing
  directories, paths outside the current working directory unless explicitly
  allowed, and permissions that are not owner-only. Sanitize filenames.
- [ ] Test refusal when prompt safety cannot be verified, session identity is
  ambiguous, cleanup fails, output is a symlink, or a limit is exceeded.
- [ ] Run read-only discovery first: handshake, source/runtime method inventory, session inspection, capabilities, auth/origin observations, and health.
- [ ] Inspect each existing session read-only, attempt resume only when the
  gateway exposes a read-only resume/inspect path, and record whether the
  session is Telegram-created without sending a message or changing metadata.
- [ ] Explicitly record Telegram mapping and shared-thread behavior as
  observed, unsupported, not observed, not tested, or unknown; never infer it
  from a session title.
- [ ] Run the fixed test prompt only under the explicit isolated profile and record cleanup status.
- [ ] Exercise active-run disconnect and post-reconnect inspection only through
  a mock scenario or a live capability that proves no side effect; otherwise
  record active-run resume as `not tested` with the reason.
- [ ] Keep live tool-event checks read-only: use a mock fixture with a tool
  start/output/completion sequence, and mark real Hermes tool execution as
  `not tested` unless a safe server-provided dry-run exists.
- [ ] Skip unsafe approval, command, file, credential, and external-side-effect checks with `not tested` status.
- [ ] Write a transcript manifest, sanitized JSONL transcript, capability matrix, and safe error summary.
- [ ] Test CLI parsing, default safety, mock determinism, failure exit codes, and secret-free output.

## Chunk 5: Protocol report, ADRs, and completion evidence

### Task 12: Add ADRs and protocol documentation

**Files:**
- Create: `docs/decisions/ADR-001-hermes-tui-gateway.md` through `docs/decisions/ADR-012-delay-theme-integration.md`
- Create: `docs/protocol/hermes-integration-report.md`
- Create: `docs/protocol/fixtures/README.md`
- Create: `docs/protocol/research-question-matrix.md`

- [ ] Map each ADR to the exact roadmap decision: 001 gateway protocol, 002 adapter, 003 source of truth, 004 host split, 005 browser boundary, 006 PostgreSQL, 007 policy inheritance, 008 credential references, 009 redaction, 010 responsive web app, 011 local storage adapter, and 012 delayed theme integration.
- [ ] Keep each ADR concise and state whether it is confirmed or provisional.
- [ ] Run the live probe against local Hermes v0.19.0 when safe and reachable; otherwise record the exact command, blocker, and exit code.
- [ ] Distinguish runtime-observed, source-inferred, unsupported, not tested, and environment-blocked claims.
- [ ] Answer every Phase 1 research question with a transcript or source reference, or record an explicit unknown.
- [ ] Include `/model` discovery/dispatch evidence or explicitly record it as
  not tested with the safety reason.
- [ ] Document Hermes version/flags, private bind, auth, temporary systemd
  shape, firewall boundary, and Barnabas connectivity as observed or blocked.
- [ ] Run host checks when the current host identity and permissions prove they
  are safe: `hermes --version`, `hermes serve --help`, listener/bind inspection,
  systemd unit inspection, firewall rule inspection, and a Barnabas-to-Gospel
  connectivity check. Otherwise record the exact unavailable command and why it
  was not run.
- [ ] Include launch command, handshake, methods, events, session findings, reconnection, security, Telegram mapping, and recommended adapter behavior.

### Task 13: Write the phase completion report

**Files:**
- Create: `docs/phase-reports/phase-0-1-completion.md`

- [ ] Record completed work, exact commands and outputs, manual verification, discoveries, deviations, limitations, and recommended next phase.
- [ ] Include the final check command and live probe command results.
- [ ] Link every roadmap acceptance criterion to a command result, fixture,
  report row, or explicit blocker in a checklist table.
- [ ] Do not claim production UI readiness; the next phase is adapter hardening only if the report supports it.

## Final verification

- [ ] Run `pnpm install` or document the environment limitation.
- [ ] Run `pnpm check` and confirm format, lint, typecheck, tests, and build pass.
- [ ] Run the mock probe twice and compare sanitized manifests for deterministic output.
- [ ] Run the live probe with safe defaults against the installed Hermes
  instance, or record its exact environment blocker and non-zero exit code in
  the completion report.
- [ ] Inspect all generated output for secrets before reporting completion.
- [ ] Re-read the roadmap acceptance criteria and mark each one completed, unknown, or blocked with evidence.
