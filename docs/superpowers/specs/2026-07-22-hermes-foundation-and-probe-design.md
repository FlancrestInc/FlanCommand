# Hermes Command Center: Foundation and Integration Probe

## Scope

This slice covers roadmap Phase 0 and Phase 1 only. It creates a testable
TypeScript monorepo foundation and a small command-line probe for the installed
Hermes Agent gateway. It does not build the production chat UI, expose Hermes
to browsers, or claim support for capabilities that have not been observed.

The current local Hermes installation is v0.19.0, upstream `a41d280f`. Its
`hermes serve` command exposes a WebSocket gateway at `/api/ws` by default on
port 9119. The probe will verify the wire behavior from the running service and
use the installed source only as a discovery aid.

## Goals

- Start from a cloneable, documented monorepo.
- Share strict event and capability types between future API and adapter code.
- Keep native Hermes protocol details inside `packages/hermes-adapter`.
- Provide a deterministic mock gateway for unit and contract tests.
- Provide an opt-in live probe that records sanitized protocol observations.
- Answer the Phase 1 research questions or mark each one unknown.
- Produce `docs/protocol/hermes-integration-report.md` and a phase completion
  report.

## Non-goals

- No browser-facing connection to Gospel or to `hermes serve`.
- No production chat screens.
- No production credential, permission, file, job, or notification services.
- No guessed RPC methods or synthetic claims about Telegram session sharing.
- No real secret values in source, fixtures, logs, or reports.

## Repository shape

```text
apps/
  api/                 # placeholder boundary for the future Barnabas BFF
  web/                 # placeholder boundary for the future browser app
packages/
  event-schema/        # normalized events and capability types
  hermes-adapter/      # native JSON-RPC/WebSocket boundary and probe core
  config/              # environment parsing
probe/
  cli/                 # live and mock probe entry points
docs/
  architecture/
  decisions/
  protocol/
tests/
  fixtures/hermes/
```

The first implementation may keep package boundaries lightweight, but imports
must point in one direction: the adapter may depend on event schemas and
configuration; future UI/API code may depend on the adapter interface, never
on raw Hermes messages.

## Tooling decision

Use TypeScript, pnpm workspaces, Vitest, ESLint, Prettier, and `tsc`. Use a
small workspace configuration rather than a framework. The probe uses a
WebSocket client compatible with Hermes' JSON-RPC transport. Dependencies are
kept minimal and each non-obvious dependency is recorded in the README.

If pnpm is unavailable in the environment, the repository still records pnpm
as the intended workflow and the implementation may use npm only for local
verification. This limitation must be documented rather than silently changing
the project decision.

## Adapter boundary

The adapter exposes operations needed by the later vertical slices:

```ts
interface HermesAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getCapabilities(): Promise<HermesCapabilities>;
  listSessions(input?: ListSessionsInput): Promise<HermesSession[]>;
  getSession(sessionId: string): Promise<HermesSession>;
  createSession(input?: CreateSessionInput): Promise<HermesSession>;
  resumeSession(sessionId: string): Promise<HermesSession>;
  renameSession(sessionId: string, title: string): Promise<void>;
  sendMessage(sessionId: string, input: SendMessageInput): AsyncIterable<AgentEvent>;
  stopRun(runId: string): Promise<void>;
  retryTurn(sessionId: string, turnId: string): Promise<void>;
  dispatchCommand(sessionId: string, command: string): AsyncIterable<AgentEvent>;
  listCommands(sessionId?: string): Promise<SlashCommand[]>;
  listModels(): Promise<ModelInfo[]>;
  setSessionModel(sessionId: string, modelId: string): Promise<void>;
  approveAction(actionId: string): Promise<void>;
  denyAction(actionId: string, reason?: string): Promise<void>;
}
```

The exact native method names are configuration or adapter implementation
details until the probe verifies them. Unsupported operations are represented
in capabilities and return a typed, actionable error.

## Normalized events

The first event vocabulary includes run start/status/end/error/stopped,
message deltas and completion, tool start/output/completion/failure, approval
requests, clarification requests, context updates, and unknown-event
diagnostics. Every event carries the stable session correlation available from
Hermes. Unknown native frames are retained in sanitized fixture form but do not
crash normalization.

The normalizer must:

- validate JSON shape before reading fields;
- redact secret-like values before logs or fixture writes;
- preserve event order and request correlation;
- identify duplicate frames during replay tests;
- distinguish unsupported from failed operations.

## Probe behavior and live safety

The CLI accepts an explicit endpoint, an optional auth mechanism that never
prints its value, an output directory, and a mock/live mode. Live mode is never
run implicitly by tests. It defaults to read-only discovery. Mutating checks
require both `--allow-test-mutations` and a named test profile.

The probe enforces these controls:

- refuse non-loopback endpoints unless `--allow-private-endpoint` is set;
- require an explicit WebSocket origin and verify the server auth response;
- use connect, request, idle, and total-run timeouts;
- cap frame size, transcript bytes, event count, and concurrent test sessions;
- write only below a freshly created output directory with restrictive mode;
- never print auth headers, cookies, tokens, or endpoint credentials;
- reject mutating methods unless the named test profile and mutation flag are
  both present;
- exit non-zero when a required check fails unexpectedly.

The test profile creates at most one new session with the exact title prefix
`Hermes Command Center Probe <run-id>`. It sends only a fixed prompt that asks
for a short text response and forbids tools, file access, network access,
credentials, notifications, or external side effects. If the gateway cannot
enforce those limits, the probe does not send the prompt. The profile never
mutates an existing or Telegram-created session. Cleanup closes the created
session when supported, records cleanup status, and retains only sanitized
fixtures; it does not delete historical sessions by default.

Approval, clarification, model-change, file, artifact, and command tests are
read-only capability checks unless a future named fixture explicitly proves a
side-effect-free path. The probe never approves, denies, writes, uploads,
executes, sends an external message, uses a credential, or changes a real
session merely because an RPC method exists.

It should:

1. Connect and capture the gateway-ready/handshake exchange.
2. Discover supported methods through observed responses or source-backed
   inspection, without inventing requests. Source findings are labeled
   `source-inferred`; only successful runtime exchanges are `observed`.
3. List, inspect, create, and resume sessions where supported.
4. With the explicit mutation flag and isolated test profile, send the fixed
   side-effect-free prompt and capture streamed text and structured activity.
5. Exercise stop, slash-command discovery, model/config discovery, approvals or
   clarifications, reconnect, and separate-session concurrency only when each
   check has a safe, non-mutating test path. Otherwise record `not tested`.
6. Record context, token, memory, file, artifact, and Telegram mapping data
   only when the gateway exposes it.
7. Write sanitized raw transcripts and a capability matrix.

The probe must use the exact isolated test-session rules above. A failed or
unavailable check is recorded as `observed`, `source-inferred`, `unsupported`,
`not observed`, `not tested`, or `blocked`, with evidence and recovery notes.
The report must not collapse these statuses into a yes/no claim.

The report contains one row for each roadmap Phase 1 question: protocol
stability/version negotiation, authentication and origin controls, session
listing/resume, Telegram mapping and shared-thread behavior, active-run
disconnect/recovery, approvals and clarifications, tool events, model and
reasoning controls, context/token/memory data, files/artifacts, concurrent
sessions, gateway restart behavior, and Cloudflare/WebSocket topology concerns.
Each row names the transcript or source path that supports its status.

## Security and redaction

The browser is not part of this slice. The future browser will speak only to
Barnabas. The probe and adapter still redact before persistence or display:

- bearer and API authorization values;
- cookies, tokens, passwords, and secret-looking environment values;
- private-key blocks;
- configured test-secret values.

Fixture filenames and report output must not contain endpoint credentials. Live
probe output uses safe errors with component, operation, likely cause, and
next action.

## Testing

- Unit tests cover redaction, native-frame validation, event normalization,
  unknown frames, capabilities, and duplicate detection.
- Contract tests replay sanitized Hermes frames into normalized events. A
  duplicate is identified by `(transport, request id, event type, session id,
  run id, sequence or content hash)`; identical replayed frames are diagnostics
  and are not emitted twice, while distinct repeated user-visible events remain
  valid.
- Mock transport tests cover handshake, stream, stop, reconnect, and concurrent
  session correlation.
- Redaction tests cover nested JSON, headers, URLs, filenames, error objects,
  environment values, and secret values split across streamed chunks.
- Reconnect tests preserve session/run correlation, report a gap when no replay
  cursor exists, replay only unseen events when a cursor exists, and never
  duplicate already normalized content.
- A live integration command is documented separately and is not required for
  a clean checkout because Gospel may be unavailable.
- Formatting, linting, type checking, tests, and build run from one documented
  command.

## Phase 0 acceptance

The foundation must provide:

- `pnpm install` instructions and a documented one-command development start;
- formatting, linting, type checking, tests, and build scripts;
- environment-variable validation with a sanitized `.env.example`;
- local Compose services or an explicit documented reason a service is not yet
  needed;
- CI configuration for a clean checkout;
- ignore rules for secrets, local state, generated reports, and probe output;
- ADRs 001 through 012 from the roadmap.

## Deliverables

- Project skeleton and README.
- Environment example and ignore rules.
- ADRs 001 through 012 from the roadmap, kept concise and marked as provisional
  where live evidence is still pending.
- Adapter and normalized event package.
- Mock transport and sanitized fixtures.
- Live probe CLI.
- `docs/protocol/hermes-integration-report.md`.
- `docs/phase-reports/phase-0-1-completion.md`.

## Deployment discovery

Phase 1 documents, but does not silently deploy, the host checks needed for the
roadmap: supported `hermes serve` flags, private binding, authentication,
systemd shape, firewall boundary, and Barnabas-to-Gospel connectivity. If the
current machine is not Gospel or Barnabas, those checks are explicitly marked
`blocked by environment` rather than inferred from local success.

## Acceptance gate

This slice is complete only when the repository checks pass, the mock probe
passes deterministically, the live probe has been run against the local Hermes
installation or the exact environmental blocker is documented, and every Phase
1 research question has an evidence-backed status or an explicit unknown. The
probe exit code, transcript manifest, fixture schema, and report matrix make
that evidence mechanically checkable.

The next slice is Phase 2 adapter hardening only after this report exists.
