# Phase 0: Functional Compose runtime

Status: local Compose startup slice complete.

## Completed

- Replaced placeholder Compose processes with a built API/web container.
- Added persistent storage for metadata and uploaded files.
- Added a container-safe bind address while keeping direct local startup on loopback by default.
- Added a real `/api/health` container health check.
- Added frozen pnpm installation and workspace runtime links for compiled ESM output.
- Corrected the stale pnpm lockfile so clean CI and container installs agree with workspace manifests.

## Evidence

- `docker compose config --quiet` passes without requiring `.env`.
- `docker compose build api` passes.
- Compose smoke test reached `/api/health`, served the browser shell, and reported the container healthy.
- `npm run check` passes: 25 test files and 356 tests.
- `pnpm install --frozen-lockfile --offline --ignore-scripts` passes with pnpm 10.12.1.

## Boundaries

The container defaults to the deterministic Hermes mock. Live Hermes now reads
the shared `HERMES_ENDPOINT` and `HERMES_ORIGIN` names and accepts a
server-injected `HERMES_AUTH_TOKEN`; the documented private/authenticated
gateway setup is still required. PostgreSQL, Cloudflare Access, and production
backup services remain deployment work.
