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

## Run locally with Docker

Requirements: Docker Engine with Compose v2. This runs the app on one machine
and uses the deterministic Hermes mock by default.

Start it in the background:

```sh
cp .env.example .env
docker compose up -d --build
```

The app listens on `127.0.0.1:3000` and stores data in the named
`flancommand-storage` volume. Check the container:

```sh
docker compose ps
curl -fsS http://127.0.0.1:3000/health
```

Stop the container without removing its stored data:

```sh
docker compose down
```

## Hermes authentication

FlanCommand does not issue or fetch a Hermes token. The Hermes gateway and the
FlanCommand API use one shared secret that you create and store.

Generate a strong value with a password or secret manager, for example:

```sh
openssl rand -hex 32
```

Set that exact value in both places:

1. On Gospel, give it to the Hermes gateway as
   `HERMES_DASHBOARD_SESSION_TOKEN`.
2. On Barnabas, give it to the container as `HERMES_AUTH_TOKEN`.

For a temporary local setup, the gateway can use:

```sh
HERMES_DASHBOARD_SESSION_TOKEN='<shared-secret>' \
  hermes serve --host 127.0.0.1 --port 9119
```

Then put the same value in the local `.env` file:

```dotenv
HERMES_TRANSPORT=websocket
HERMES_AUTH_TOKEN=<shared-secret>
```

`HERMES_AUTH_REF` is only a label for the secret's location in a secret
manager. FlanCommand does not resolve it. The deployment system must resolve
that reference and inject the resulting value as `HERMES_AUTH_TOKEN`.

`HERMES_ENDPOINT` is the gateway WebSocket address and `HERMES_ORIGIN` is the
allowed web origin. Neither is a secret. Never commit `.env`, print the shared
secret, or send it to browser code.

## Deploy to Barnabas and Gospel

This is the intended deployment for a live Hermes connection.

### What gets deployed

There are three parts:

```text
your browser
    |
    v
Cloudflare Access and HTTPS hostname
    |
    v
Barnabas: FlanCommand Docker container
    |
    v
Gospel: Hermes WebSocket gateway
```

FlanCommand runs on Barnabas. Hermes runs on Gospel. The browser talks only to
the HTTPS FlanCommand address. The browser never gets the Hermes token and
never connects to Gospel directly.

### Before you start

You need:

- A Gospel machine with Hermes installed and a user who can run `hermes`.
- A Barnabas machine with Docker Engine and Compose v2 installed.
- SSH access to both machines.
- A private network route from Barnabas to Gospel.
- A DNS name for FlanCommand, such as `hermes.example.com`.
- A Cloudflare zone for that DNS name and permission to create a Cloudflare
  Access application and policy.

The examples below use these placeholder values. Replace them with your real
values:

```text
Public FlanCommand address: https://hermes.example.com
Gospel private name:        gospel.lan
Gospel Hermes port:         9119
Barnabas app port:          3000
```

Do not copy the placeholder values into a live deployment.

### 1. Create one shared Hermes secret

Run this on a trusted machine. It creates a random value; it is not an account
token from FlanCommand or Cloudflare:

```sh
openssl rand -hex 32
```

Save the output in a password manager or secret manager. Call it
`FLANCOMMAND_HERMES_TOKEN` in your notes. You will use the exact same value on
Gospel and Barnabas.

Create a second random value for approval links:

```sh
openssl rand -hex 32
```

Keep both values private. Do not put either value in GitHub, the README, a
browser setting, or a public issue.

### 2. Start and protect Hermes on Gospel

Log in to Gospel and confirm that Hermes is installed:

```sh
hermes --version
hermes serve --help
```

Start the Hermes gateway with the shared secret. Use a private bind address,
not a public Internet address. For example, if Gospel's private address is
`192.168.1.50`:

```sh
HERMES_DASHBOARD_SESSION_TOKEN='<FLANCOMMAND_HERMES_TOKEN>' \
  hermes serve --host 192.168.1.50 --port 9119
```

Use the exact host and flags supported by the Hermes version installed on
Gospel. If your Hermes service is managed by systemd or another service
manager, put `HERMES_DASHBOARD_SESSION_TOKEN` in that service's protected
environment instead of typing the secret into a shared service file.

Allow connections to TCP port `9119` from Barnabas only. Do not forward this
port from the Internet. From Barnabas, test the private route:

```sh
nc -vz gospel.lan 9119
```

If this fails, fix the private DNS, firewall, or Hermes bind address before
continuing.

### 3. Download FlanCommand on Barnabas

Log in to Barnabas and clone the public repository:

```sh
git clone https://github.com/FlancrestInc/FlanCommand.git
cd FlanCommand
```

For an existing checkout, update it instead:

```sh
cd /path/to/FlanCommand
git pull --ff-only
```

### 4. Create the Barnabas environment file

Copy the example file. This file stays on Barnabas and must not be committed:

```sh
cp .env.example .env
chmod 600 .env
```

Edit `.env` and set these values. Keep the angle brackets out of the file:

```dotenv
NODE_ENV=production
HERMES_TRANSPORT=websocket
HERMES_ENDPOINT=ws://gospel.lan:9119/api/ws
HERMES_ORIGIN=https://hermes.example.com
HERMES_AUTH_TOKEN=the-exact-secret-created-in-step-1
FLANC_PUBLIC_ORIGIN=https://hermes.example.com
FLANC_ALLOWED_ORIGINS=https://hermes.example.com
FLANC_REQUIRE_AUTH=true
FLANC_APPROVAL_SIGNING_SECRET=the-second-secret-created-in-step-1
FLANC_MAX_CONCURRENT_JOBS=2
```

What these settings mean:

- `HERMES_ENDPOINT` tells the Barnabas container where Gospel listens. Do not
  use `127.0.0.1` here; inside Docker, that means the Barnabas container.
- `HERMES_ORIGIN` tells Hermes which browser origin the API presents during
  the WebSocket handshake. It must match the public HTTPS address.
- `HERMES_AUTH_TOKEN` must exactly match Gospel's
  `HERMES_DASHBOARD_SESSION_TOKEN`.
- `FLANC_PUBLIC_ORIGIN` is used when FlanCommand creates links back to itself.
- `FLANC_ALLOWED_ORIGINS` must contain the exact public origin, including
  `https://` and no trailing path.
- `FLANC_REQUIRE_AUTH=true` makes the app require the identity header supplied
  by Cloudflare Access for normal pages and API requests.
- `FLANC_APPROVAL_SIGNING_SECRET` signs approval-review links. It is separate
  from the Hermes secret.

Leave the other `.env` values at their defaults unless your deployment needs
them. Do not set `HERMES_AUTH_REF` unless your own secret manager uses it as a
label; FlanCommand does not resolve that label automatically.

### 5. Build and start the container

Still on Barnabas, build the image and start the API:

```sh
docker compose up -d --build
```

Compose does the following:

- Builds the image from the checked-out source.
- Starts the API on Barnabas only at `127.0.0.1:3000`.
- Keeps the container filesystem read-only.
- Stores app data in the named Docker volume `flancommand-storage`.
- Runs a health check every 10 seconds.

Check the container and its logs:

```sh
docker compose ps
docker compose logs --tail=100 api
```

The container should show a healthy state. Check the local health endpoint:

```sh
curl -fsS http://127.0.0.1:3000/health
```

A working live connection returns JSON containing `"ok":true` and
`"transport":"websocket"`. A response with `"ok":false` means the API is
running but cannot reach or authenticate to Gospel. Check the endpoint, the
shared secret, the firewall, and the Hermes logs.

### 6. Put HTTPS and Cloudflare Access in front

The Compose file binds the app to loopback on purpose. A browser cannot reach
it yet. Configure your Barnabas reverse proxy or Cloudflare Tunnel to forward:

```text
https://hermes.example.com  ->  http://127.0.0.1:3000
```

The proxy or tunnel must support WebSocket connections and forward the
Cloudflare Access identity header to the container.

With Cloudflare Tunnel, the public hostname's service target is
`http://127.0.0.1:3000`. With another reverse proxy, use the equivalent local
upstream setting.

Then create a Cloudflare Access application for the exact hostname and add a
policy that allows the people who may use FlanCommand. Cloudflare Access must
send the authenticated user's identity in the
`Cf-Access-Authenticated-User-Email` header.

Do not expose port `3000` directly to the network and do not expose Gospel's
port `9119` publicly. The only public entry point should be the HTTPS hostname
protected by Cloudflare Access.

After the proxy is ready, test the public health endpoint:

```sh
curl -fsS https://hermes.example.com/health
```

The health endpoint is intentionally public for monitoring. Normal pages and
API routes still require Cloudflare Access when `FLANC_REQUIRE_AUTH=true`.

### 7. Sign in and test the live connection

Open `https://hermes.example.com` in a browser and sign in through Cloudflare
Access. Then check these basic flows:

1. The chat page loads.
2. Existing Hermes sessions appear.
3. A harmless prompt returns a response.
4. Stop or cancel a running prompt.
5. An approval request can be reviewed and answered.
6. A file or artifact link uses the Barnabas hostname.

If the page loads but sessions do not appear, check the browser's network
requests and then inspect the API logs on Barnabas:

```sh
docker compose logs --tail=200 -f api
```

### Updating or stopping the deployment

To update an existing deployment:

```sh
cd /path/to/FlanCommand
git pull --ff-only
docker compose up -d --build
```

To stop the app while keeping its stored data:

```sh
docker compose down
```

Do not run `docker compose down -v` unless you intentionally want to delete
the `flancommand-storage` volume. See
[`docs/operations/deployment.md`](docs/operations/deployment.md) for backup,
restore, SSH host-key, and upgrade procedures.

## Run without Docker

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
