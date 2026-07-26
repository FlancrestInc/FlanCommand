# Hermes integration report

Date: 2026-07-23

## Scope and runtime

- Hermes Agent v0.19.0, upstream `a41d280f`.
- Installed command: `/home/ryan/.local/bin/hermes`.
- Supported server command: `hermes serve --host HOST --port PORT [--skip-build]`.
- Default probe endpoint: `ws://127.0.0.1:9119/api/ws`.
- Native transport uses JSON-RPC frames and waits for `gateway.ready`.

The installed gateway was started with:

```sh
hermes serve --host 127.0.0.1 --port 9119 --skip-build
```

It printed `HERMES_BACKEND_READY port=9119`. The gateway requires the value of
`HERMES_DASHBOARD_SESSION_TOKEN` as the WebSocket `token` query parameter and
checks the Origin header. With that value injected as `HERMES_AUTH_TOKEN` into
the API, the adapter completed the `gateway.ready` handshake and `/api/health`
returned HTTP 200.

The live gateway returned session rows from `session.list`. The adapter now
normalizes its `{sessions: [...]}` response, Unix-second timestamps, and
`telegram`/`cli` source values into the FlanCommand session schema. A temporary
live session also completed a real prompt and returned `OK` through the API's
SSE stream.

## Adapter findings

Source-observed event types include `gateway.ready`, `message.start`,
`message.delta`, `message.complete`, `message.interim`, `tool.start`,
`tool.complete`, `tool.output_risk`, `approval.request`, `clarify.request`,
`status.update`, `reasoning.delta`, `thinking.delta`, and
`notification.show`.

The adapter normalizes these into run, message, tool, approval, clarification,
context, usage, artifact, reconnect, and diagnostic events. Tool arguments may
arrive as `payload.args_text`; tool results may arrive as `result` or
`result_text`. Completion usage uses `input`, `output`, `total`, and
`reasoning` fields when present. Error completions become failed runs.

The gateway command catalog includes `/memory`. A live API check against a
fresh session returned `memory.write_approval = off` and `No pending memory
writes.` The TUI Gateway does not expose a direct memory-list or memory-edit
RPC; Hermes' separate web server has those dashboard endpoints. FlanCommand
therefore exposes native memory status only and does not present a duplicate or
invented memory store.

## Capability matrix

| Capability               | Result                                                                                                                                                    | Evidence           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| WebSocket handshake      | Passed with shared gateway/API token and Origin                                                                                                           | Live runtime       |
| Session list             | Passed through live `session.list`                                                                                                                        | Live runtime       |
| Session create/resume    | Passed; live history restored into the web view                                                                                                           | Live runtime       |
| Streamed text            | Passed; `prompt.submit` stayed open to completion                                                                                                         | Live runtime       |
| Tool activity            | Source shape normalized; mock fixture supported                                                                                                           | Source + tests     |
| Stop                     | `session.interrupt` mapped and stopped an in-flight live run                                                                                              | Live runtime       |
| Retry                    | `session.undo` mapped and removed a live slash-command turn                                                                                               | Live runtime       |
| Approvals/clarifications | Native `approval.request` was denied through the live API and the waiting run resumed; policy approvals also support approve/deny                         | Live runtime       |
| Secret requests          | Native `secret.request` normalizes safely; server-side provider resolution maps to `secret.respond`; active secrets are redacted from later stream output | Source + tests     |
| File and image input     | Native `file.attach` and `image.attach_bytes` are mapped; browser-selected files are staged before a chat turn                                            | Source + tests     |
| Model and slash commands | Model options, `config.set` model changes, and command catalog are mapped; `/status` streamed live                                                        | Source + runtime   |
| Usage/context/artifacts  | Normalized fields exist; live values not tested                                                                                                           | Partial            |
| Memory status            | `/memory` returned native status through API                                                                                                              | Live runtime       |
| Telegram session mapping | Not tested                                                                                                                                                | Unknown            |
| Reconnect/replay         | Browser reconnect calls `session.resume` and replays the durable API-side bounded event ledger; gateway run reattachment is not supported                 | Partial            |
| Concurrent sessions      | Mock session isolation tested                                                                                                                             | Mock fixture/tests |

## Security findings

The probe defaults to loopback, read-only discovery, one test session, bounded
frames/transcripts/events, and a relative output directory. Non-loopback live
endpoints need an explicit flag. Test mutation needs the safe profile and an
explicit mutation flag. Credentials use Hermes-supported query fields and are
redacted before reports. The browser boundary remains Barnabas-only.

## Recommended behavior

Keep raw Hermes frames inside the adapter. Treat session IDs and event replay
as runtime facts, not assumptions. Surface reconnect gaps to the UI. Native
approval denial, stop, retry, session history reconnect, and durable API-side
event replay now have evidence; gateway run reattachment remains unproven.

Sanitized deterministic fixture: `tests/fixtures/hermes/mock-stream.jsonl`.
