# Local development

Install Node.js 22+ and pnpm 10. Then run:

```sh
pnpm install
pnpm dev
```

pnpm is required to install the workspace. It is unavailable in this
environment, so local checks used npm against the existing `node_modules`:

```sh
npm run check
```

CI remains the authoritative pnpm check. It runs
`pnpm install --frozen-lockfile` followed by `pnpm check`.

Compose starts two locked-down smoke containers. Healthy output is:

```text
flancommand api placeholder healthy
flancommand web placeholder healthy
```

For the functional local chat, build and start the API BFF:

```sh
npm run build
FLANC_COMMAND_START=1 node dist/apps/api/src/index.js
```

Then open `http://127.0.0.1:3000`. The API serves the web app and uses the
deterministic Hermes mock by default. Set `HERMES_TRANSPORT=websocket` only
after live Hermes auth and origin controls are configured.

Compose pins both containers to the Node 22.14.0 Alpine 3.21 multi-platform
image digest. Update the version and digest together after checking the image
manifest with Docker; do not replace it with a floating `node:22-alpine` tag.

PostgreSQL is deliberately deferred until the first persistence slice. Adding
it now would create a production dependency before there is a schema, a query
boundary, or data that needs durable storage.

Run Hermes separately on the local host with its WebSocket gateway bound to
loopback:

```sh
hermes serve --host 127.0.0.1 --port 9119
```

The API and live probe allow Hermes history frames up to 8 MiB by default. Set
`HERMES_MAX_FRAME_BYTES` between 1 MiB and 32 MiB when a deployment needs a
different bounded limit.

Loopback binding prevents remote network access, but auth still applies when
the Hermes gateway requires it. Keep the auth value in the configured secret
store and set only its reference in `HERMES_AUTH_REF`; never commit or print
the secret.

For a non-loopback bind, require gateway authentication, an explicit allowed
origin, and a private network or firewall boundary. Do not expose Hermes on a
public interface. The probe must use its explicit private-endpoint opt-in for
such a target.

The functional API connects to Hermes server-side. A browser must never connect
to Hermes directly: Barnabas must own authentication, origin checks,
redaction, and the normalized event boundary.

## Storage backup and restore

Stop the API before restoring. After a build, create a snapshot with:

```sh
npm run storage:backup -- backup storage backups/flancommand-2026-07-23
```

Restore it into the live storage root with:

```sh
npm run storage:backup -- restore backups/flancommand-2026-07-23 storage
```

The snapshot contains metadata and uploaded files plus SHA-256 checksums. Restore
validates every file before swapping the root. The replaced root is kept beside
the live root with a `.previous-*` name for rollback.
