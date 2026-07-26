# Phase 2: Live Hermes runtime configuration

Status: server-side configuration slice complete; authenticated live gateway verified.

## Completed

- API runtime configuration now uses the shared `HERMES_ENDPOINT` and `HERMES_ORIGIN` names.
- Legacy `HERMES_WS_ENDPOINT` and `HERMES_WEB_ORIGIN` names remain accepted during migration.
- WebSocket mode passes a server-injected `HERMES_AUTH_TOKEN` to the Hermes adapter.
- The live probe uses the same server-side token without adding it to probe
  output or reports.
- Large Hermes history frames use a bounded `HERMES_MAX_FRAME_BYTES` limit:
  8 MiB by default, configurable from 1 MiB through 32 MiB.
- The browser never receives the token.
- Mock mode remains the default when transport is not explicitly set to `websocket`.
- API requests re-check adapter connectivity so a failed initial connect or later gateway disconnect can recover on the next request.

## Evidence

- Focused runtime configuration tests cover shared names, safe defaults, legacy names, and blank auth.
- The authenticated live probe listed 62 sessions and resumed one bounded
  Hermes session successfully.
- `npm run check`: 436 tests passed; lint, typecheck, and build passed.
- Full repository checks pass after reconnect coverage.
- The rebuilt Compose container starts and serves `/api/health` in mock mode.

## Known limitation

The gateway and API must share one secret: inject it as
`HERMES_DASHBOARD_SESSION_TOKEN` for `hermes serve` and as `HERMES_AUTH_TOKEN`
for the API. `HERMES_AUTH_REF` remains only a catalog reference for deployment
secret resolution.
