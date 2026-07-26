# Barnabas and Gospel deployment

This is the deployment shape for the personal Hermes Command Center.

```text
Browser -> Cloudflare Access -> Barnabas API container -> Gospel hermes serve
                                                   \-> declared SSH hosts
```

The browser talks only to Barnabas. It never receives the Hermes token and
never connects to Gospel directly.

## Gospel

Run `hermes serve` on Gospel with a private bind address and authentication.
Use the exact command and flags supported by the installed Hermes version.
The gateway must accept the same secret that Barnabas receives as
`HERMES_AUTH_TOKEN`.

Check from Barnabas before enabling live mode:

```sh
nc -vz gospel.lan 9119
```

Keep the gateway behind a firewall rule that allows Barnabas only. Do not put
the gateway on a public interface.

## Barnabas

Set the Hermes endpoint to Gospel's private address. Do not use
`127.0.0.1` in the container unless the gateway runs in the same container.

```dotenv
NODE_ENV=production
HERMES_TRANSPORT=websocket
HERMES_ENDPOINT=ws://gospel.lan:9119/api/ws
HERMES_ORIGIN=https://hermes.example.com
HERMES_AUTH_TOKEN=<inject at runtime>
FLANC_PUBLIC_ORIGIN=https://hermes.example.com
FLANC_ALLOWED_ORIGINS=https://hermes.example.com
FLANC_REQUIRE_AUTH=true
FLANC_APPROVAL_SIGNING_SECRET=<long random value>
FLANC_MAX_CONCURRENT_JOBS=2
```

Inject secret values from the host or a secret provider. Do not put them in
the repository, browser code, logs, or ordinary shell history.

Start and check the container:

```sh
docker compose up -d --build
curl -fsS https://hermes.example.com/health
curl -fsS https://hermes.example.com/api/health
```

The first endpoint is a public monitor endpoint. The API health response is
`200` with `ok: true` when the runtime is ready, and `503` with `ok: false`
when the runtime is unavailable.

## Cloudflare Access

Protect the Barnabas origin with Cloudflare Access. Configure the exact HTTPS
origin in `FLANC_ALLOWED_ORIGINS` and keep `FLANC_REQUIRE_AUTH=true`.
The API trusts the Access identity header only when this setting is enabled.
Do not expose Barnabas directly while trusting a forwarded identity header.

Validate both normal HTTPS requests and the browser's event streams after
Access is enabled. Keep the browser-to-Barnabas path same-origin so no CORS
exception is needed.

## Backups

Stop the API before restoring. Create a snapshot while the API is stopped or
when the storage root is otherwise quiescent:

```sh
npm run storage:backup -- backup storage backups/flancommand-$(date +%F)
```

Restore only after checking the snapshot manifest:

```sh
npm run storage:backup -- restore backups/flancommand-YYYY-MM-DD storage
```

The restore validates SHA-256 checksums and keeps the replaced storage root
beside the live root for rollback.

## SSH host keys

Before using a declared remote terminal, verify the host fingerprint through a
trusted channel. Only then add the key to the Barnabas service user's
`known_hosts`. Never disable host-key verification to make a terminal connect.

After setup, test the exact configured alias with batch mode and a short
timeout:

```sh
ssh -o BatchMode=yes -o ConnectTimeout=5 gospel 'printf remote-terminal-check'
```

## Upgrade check

1. Run `npm run check`.
2. Run both browser suites.
3. Create a storage backup.
4. Check `/api/health`.
5. Send a harmless live Hermes prompt.
6. Verify an approval and an artifact path if the release changes those areas.

If Hermes changes its gateway protocol, replay the sanitized protocol fixtures
and rerun the live probe before deploying.
