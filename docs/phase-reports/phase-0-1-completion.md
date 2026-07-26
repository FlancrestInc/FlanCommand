# Phase 0-1 completion report

Date: 2026-07-22

## Result

Phase 0 foundation and the safe Phase 1 adapter/probe slice are implemented.
This report records the original Phase 0-1 probe result. The first live probe
was blocked by the local gateway's HTTP 403 auth/peer gate; that environment
block was later cleared with an explicit temporary gateway token.

## Verification

`npm run check` passed after the final changes:

- Prettier check passed.
- ESLint passed.
- TypeScript typecheck passed.
- 14 test files passed, 316 tests passed.
- Build passed, including package-level event-schema and adapter output.

The deterministic mock probe passed and wrote bounded sanitized files:

```sh
node dist/probe/cli/src/main.js --mode mock --output probe-output-check-20260722
```

Exit code: `0`.

The live probe was attempted with safe defaults:

```sh
hermes serve --host 127.0.0.1 --port 9119 --skip-build
node dist/probe/cli/src/main.js --mode live --output probe-output-live-20260722
```

The server reported ready. The probe received HTTP 403 during WebSocket
handshake and exited `5` (environment-blocked). No test session or message was
created.

## Acceptance map

| Roadmap item                       | State                      | Evidence                                              |
| ---------------------------------- | -------------------------- | ----------------------------------------------------- |
| Workspace, tooling, env validation | Complete                   | Root files, config tests, check                       |
| CI and local docs                  | Complete                   | `.github/workflows/check.yml`, README, operations doc |
| Safe Compose baseline              | Complete                   | `compose.yaml`, compose config check                  |
| Stream text                        | Mock proven                | Adapter tests and fixture                             |
| Tool parsing                       | Source shape + mock proven | Normalizer tests                                      |
| Stop                               | Implemented, live unknown  | Adapter contract; live blocked                        |
| Sessions and reconnect             | Mock proven, live partial  | Mock transport and gap events                         |
| Approvals and clarifications       | Normalized from source     | Adapter schema and normalizer                         |
| Telegram sharing                   | Unknown                    | No safe authenticated live evidence                   |
| Security/redaction                 | Complete for boundary      | Schema, stream, and report tests                      |

## Follow-up live verification

On 2026-07-23, a loopback Hermes gateway was started with a temporary process
token. The real websocket adapter then listed sessions, created a fresh
session, resumed it, streamed a `prompt.submit` response through the API SSE
route, and persisted the completed assistant message. The response text was
`live adapter check passed`.

The repeatable authenticated live probe also passed after the receive limit was
raised from 1 MiB to the bounded 8 MiB default. It listed 62 live sessions and
resumed one bounded Hermes session without loading every history concurrently.

## Deviations and next step

pnpm was not installed in this environment, so local verification used the
existing dependency tree with npm. CI still uses the pinned pnpm lockfile.

Next: keep the authenticated live smoke check available for deployment and
verify the same flow against the Gospel/Barnabas network boundary.
