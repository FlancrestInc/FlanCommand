# FlanCommand

FlanCommand provides a Barnabas-hosted web boundary for Hermes Agent. The
current vertical slice includes a responsive web chat, a server-side API BFF,
the normalized Hermes adapter, and a safe protocol probe.

## Local setup

Requirements: Node.js 22 or newer and pnpm 10. Install and check the workspace:

```sh
pnpm install
pnpm check
```

Run the browser gate separately after the normal checks. It builds the app,
starts the deterministic mock API, and drives Chromium through the main chat,
mobile navigation, file, approval, and reconnect flows:

```sh
npm run test:e2e
```

pnpm is required to install the workspace. It is not available in this local
environment, so local checks used npm against the existing `node_modules`:

```sh
npm run check
```

CI still runs `pnpm install --frozen-lockfile` and `pnpm check`. Run that pnpm
check in CI or another environment with pnpm before merging.

Start the local foundation stack with:

```sh
pnpm dev
```

Compose builds and starts the functional API/web container with persistent local
storage:

```sh
cp .env.example .env
pnpm dev
```

For a direct local process instead, build and start the API BFF:

```sh
npm run build
FLANC_COMMAND_START=1 node dist/apps/api/src/index.js
```

Then open `http://127.0.0.1:3000`. It uses the deterministic Hermes mock by
default. Set `HERMES_TRANSPORT=websocket` only after live Hermes auth and origin
controls are configured.

Run the local Hermes gateway separately on loopback with:

```sh
HERMES_DASHBOARD_SESSION_TOKEN="$HERMES_SHARED_TOKEN" \
  hermes serve --host 127.0.0.1 --port 9119
```

Loopback binding keeps the gateway off the network, but it does not replace
authentication. Set `HERMES_DASHBOARD_SESSION_TOKEN` on the gateway and inject
the same secret as `HERMES_AUTH_TOKEN` into the API process. The API passes that
value only to the server-side Hermes adapter. Do not put the token in `.env`,
the browser, logs, or command history.

If Hermes must bind to a non-loopback address, require authentication, an
explicit allowed origin, and a private network or firewall rule that blocks
public access. Use the probe's explicit private-endpoint opt-in only after
those controls are in place. A browser must not connect to Hermes directly.

For the Barnabas/Gospel deployment path, see
[`docs/operations/deployment.md`](docs/operations/deployment.md). In a
container, `127.0.0.1` means the API container, not Gospel.

Copy `.env.example` to `.env` when running future local services. `HERMES_AUTH_REF`
is only a reference to a secret source; `HERMES_AUTH_TOKEN` must be injected at
runtime by that source.

For a deployed browser boundary, set `FLANC_ALLOWED_ORIGINS` to the exact
comma-separated HTTPS origins protected by Cloudflare Access. Leave it blank
only for local same-origin development.

For a deployed boundary, also set `FLANC_REQUIRE_AUTH=true`. The API then
requires the non-empty `Cf-Access-Authenticated-User-Email` header from the
trusted Cloudflare Access proxy for the browser and API routes. Health checks
remain public. If another trusted proxy supplies identity, set
`FLANC_AUTH_IDENTITY_HEADER` to its header name. Do not expose the application
directly to the network while trusting a forwarded identity header.

High-risk mutation routes have an in-memory per-client limiter. The default is
60 requests per minute per route category. Set `FLANC_RATE_LIMIT_WINDOW_MS`
and `FLANC_RATE_LIMIT_MAX` to tune it. Multi-worker deployments also need a
shared edge or datastore-backed limit.

Background Hermes runs use a process-local queue. Set
`FLANC_MAX_CONCURRENT_JOBS` to cap active runs; queued jobs remain visible in
the Jobs panel and can be canceled before they start. PostgreSQL and a
multi-worker queue are still deployment work.

Run the deterministic mock probe or the opt-in live probe:

```sh
pnpm --filter @flancommand/probe-cli probe -- --mode mock
pnpm --filter @flancommand/probe-cli probe -- --mode live
```

Live mode defaults to loopback and read-only discovery. Test-session mutation
needs both `--allow-test-mutations` and `--profile hermes-command-center-safe`.

## Package choices

- pnpm workspaces keep API, web, packages, and the probe separate.
- TypeScript and Vitest provide strict compilation and fast tests.
- Zod validates environment input at the boundary.
- ESLint and Prettier keep source and tests consistent.
