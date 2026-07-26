# Phase 12: Installable web shell

Status: installable shell and theme slice complete.

## Completed

- Added a web app manifest with standalone display metadata.
- Added a lightweight FlanCommand SVG app icon and favicon.
- Added Safari home-screen metadata.
- Added a restrictive static-content security policy and browser hardening headers.
- Added API coverage for the shell, manifest, icon, and response headers.
- Added token-based `Night Ops`, `Paper`, and `Command Blue` themes.
- Kept theme selection durable through the settings API and added a three-theme
  cycle to the top-bar control.
- Added browser coverage for Command Blue selection and persistence after reload.
- Added visible `:focus-visible` treatment and keyboard focus placement when
  opening settings, drawers, and the command palette.
- Added screen-reader labels and polite live regions for connection, run, chat,
  terminal, and toast status updates.
- Added a versioned service worker for the static app shell. It falls back to
  the cached shell during offline navigation and never caches `/api/` data,
  chat streams, files, or terminal output.
- Raised key mobile controls to 44px touch targets for safer phone use.
- Added a session-list loading skeleton so delayed API responses do not leave
  the sidebar blank.
- Added browser coverage for reduced-motion behavior.

## Tests run

- Full `npm run check`.
- Static asset assertions in `apps/api/src/app.test.ts`.
- Chromium navigation coverage for theme selection and persistence.
- Chromium navigation coverage for session loading state and reduced motion.
- `npm run test:e2e`: 24 Chromium tests passed, including keyboard focus,
  live-status, offline-shell, and touch-target coverage.

## Known limitations

- Offline mode covers shell startup only. Live sessions, files, terminal data,
  and API mutations still require a connection.
- Authentication and Cloudflare Access remain deployment responsibilities.
- The icon is SVG-only; platform-specific raster variants can follow if Safari testing shows a need.
- Firefox runs the same 24 browser tests through `npm run test:e2e:firefox`.
- Theme tokens are local to FlanCommand; reusable tokens from `~/projects/style` are
  still a later integration step.

## Recommended next phase

- Continue production hardening and browser/device verification, then integrate
  the shared style package after its tokens are confirmed against the live app.
