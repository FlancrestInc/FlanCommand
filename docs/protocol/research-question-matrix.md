# Hermes research question matrix

Status: Phase 1 evidence is being collected.

| #   | Question                                     | Current evidence                                                                                                                                   | Status          |
| --- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1   | Can Telegram sessions be listed?             | Not tested safely.                                                                                                                                 | Unknown         |
| 2   | Can Telegram sessions be resumed?            | `session.resume` is modeled; Telegram mapping is not proven.                                                                                       | Partial         |
| 3   | Does web text appear in the Telegram thread? | Not tested.                                                                                                                                        | Unknown         |
| 4   | What IDs survive gateway restart?            | Session IDs are observed in frames; restart stability is not tested.                                                                               | Partial         |
| 5   | Are active runs resumable after disconnect?  | Session history reconnects through `session.resume`; the API replays its bounded durable event ledger, but gateway run reattachment is not proven. | Partial         |
| 6   | How are approvals represented?               | `approval.request` maps to normalized events; a live native approval denial resumed the waiting run, and policy approvals support approve/deny.    | Live runtime    |
| 7   | How are native secret prompts handled?       | `secret.request` maps to a safe credential request; the server resolves a stored reference and sends `secret.respond`.                             | Source + tests  |
| 7   | How are tools represented?                   | `tool.start` and `tool.complete` map to normalized tool events.                                                                                    | Source-observed |
| 8   | Is reasoning effort configurable?            | Not proven by the safe probe.                                                                                                                      | Unknown         |
| 9   | What context/token data exists?              | Completion usage has input, output, total, and reasoning fields.                                                                                   | Source-observed |
| 10  | Can models change through structured RPC?    | Hermes `config.set` changes the session model through the API.                                                                                     | Passed          |
| 11  | Are files/artifacts structural?              | Normalized artifact events exist; live support is not proven.                                                                                      | Partial         |
| 12  | What auth and origin controls exist?         | Hermes uses query auth; the transport sends a validated HTTP(S) Origin.                                                                            | Source-observed |
| 13  | Are Cloudflare WebSocket concerns relevant?  | Deployment path is not tested from Barnabas to Gospel.                                                                                             | Unknown         |

Evidence labels mean runtime-observed, source-inferred, unsupported, not tested, or environment-blocked. Unknown rows must not become product assumptions.
