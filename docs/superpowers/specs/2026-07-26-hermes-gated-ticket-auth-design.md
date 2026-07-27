# Hermes gated WebSocket authentication

## Goal

Let FlanCommand connect to Hermes v0.19 and later when Hermes binds to a
private network address and requires dashboard authentication.

## Design

FlanCommand keeps the existing `HERMES_AUTH_TOKEN` query-token path for older
or loopback Hermes servers. For gated Hermes, the server-side adapter uses
dedicated username/password settings to log in to `/auth/password-login`,
stores the returned cookies in memory, requests a fresh ticket from
`/api/auth/ws-ticket`, and opens `/api/ws?ticket=...`. It requests a new
single-use ticket for every initial connection and reconnect.

The username and password remain server-only. They never enter browser code,
logs, safe state, or WebSocket URLs. The ticket and cookie jar remain in
memory only.

## Configuration

Add optional `HERMES_DASHBOARD_USERNAME` and
`HERMES_DASHBOARD_PASSWORD` values. When both are present, ticket mode is used.
When either is absent, existing token behavior remains unchanged.

The Hermes handshake origin must match Hermes's private bind host. Deployment
configuration will use the exact private origin, for example
`http://192.168.22.22:9119`; `FLANC_PUBLIC_ORIGIN` remains the public
FlanCommand origin.

## Failure behavior

Login failures, missing cookies, ticket failures, and rejected WebSocket
upgrades use the existing safe Hermes adapter error surface. Password values,
cookies, and tickets are redacted. A failed ticket connection may retry login
and ticket acquisition once, then follows existing reconnect behavior.

## Tests

Unit tests cover cookie extraction, password login, ticket acquisition, ticket
mode WebSocket URLs, reconnect ticket refresh, secret redaction, and legacy
token mode. Existing mock and loopback tests remain unchanged.
