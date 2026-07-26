# Phase 9: Credential references

Status: v1 credential slice complete.

## Shipped

- Project-scoped credential reference records.
- Provider interface with Bitwarden Secrets Manager CLI support through `bws secret get`.
- Secret values never enter browser state, JSON metadata, audit records, or event payloads.
- Host scope checks before a credential lease opens.
- Restrictive temporary-file injection leases with cleanup.
- Credential-reference list, create, and provider validation API routes.
- Browser project panel for associating and checking references.
- Browser-native association form replaces prompt-based entry and keeps the secret-reference fields explicit.
- Browser-native credential chooser replaces prompt-based job responses.
- Normalized `credential.requested` events.
- `waiting_for_credential` job state and notification.
- Native Hermes `secret.request` events map to server-only `secret.respond` calls.
- Job drawer control sends a credential reference ID without accepting a secret value.
- Resolved credential values are registered for active stream redaction before Hermes receives them.
- Provider health reports return status without secret values or provider error details.
- Local terminal sessions can use temporary-file credential leases through `FLANCOMMAND_CREDENTIAL_FILE`.
- Credential use is recorded for native Hermes requests and local terminal injection.

## Evidence

- Credential broker tests verify scope checks, `0600` file permissions, cleanup, and no access token in `bws` arguments.
- API tests verify reference persistence shape and credential-request job pausing.
- API tests verify server-side provider resolution and safe credential response handling.
- Adapter tests verify credential requests carry a reference only and redact a supplied value from later message and tool output.
- Full repository checks pass: 455 tests, both typechecks, lint, formatting, and build.
- Browser coverage passes in Chromium and Firefox: 22 tests in each browser.

## Boundaries

Native Hermes secret prompts and local terminal temporary-file injection are supported for v1. Environment, stdin, SSH-agent, and remote-terminal injection remain outside this slice. Active secrets are bounded in memory and never sent to the browser or persisted. Hermes does not expose active-run reattachment after a gateway process loses the client, so reconnect remains session resume plus bounded API replay.
