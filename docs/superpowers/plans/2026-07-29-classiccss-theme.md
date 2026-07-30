# Classic.css Mac OS 8 Theme Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local Mac OS 8 Platinum/classic.css-inspired theme that works in the settings picker and top-right theme cycle without changing app behavior.

**Architecture:** Extend the existing string-based theme registry and settings normalization. Add one scoped CSS layer under `html[data-theme="classiccss"]`, using local Platinum colors, shaded title ridges, and classic control states so it wins over earlier theme layers without affecting them. Update browser metadata and service-worker cache freshness with the existing shell pattern.

**Tech Stack:** TypeScript API settings, static HTML/CSS/JavaScript shell, Vitest, Playwright, service worker.

---

## Chunk 1: Theme registry and tests

### Task 1: Add the classic.css theme key

**Files:**
- Modify: `apps/api/src/settings.ts`
- Test: `apps/api/src/settings.test.ts`
- Modify: `apps/web/public/app.js`
- Modify: `apps/web/public/index.html`
- Test: `tests/e2e/navigation.spec.ts`

- [ ] Add `classiccss` to the `SettingsTheme` union and settings normalization allowlist.
- [ ] Add `classiccss` to the client local-storage allowlist, display-name map, and ordered cycle list.
- [ ] Add `Classic Mac (classic.css)` to `#settings-theme`.
- [ ] Extend the existing settings test to accept `classiccss`.
- [ ] Extend the existing theme persistence test to select and reload `classiccss`.
- [ ] Extend the existing theme cycle assertions so the cycle reaches `classiccss` and wraps correctly.
- [ ] Run the focused settings test and both TypeScript checks.
- [ ] Commit as `feat: register classic Mac theme`.

## Chunk 2: Mac OS 8 Platinum visual layer

### Task 2: Add scoped classic.css styles

**Files:**
- Modify: `apps/web/public/styles.css`

- [ ] Define local Platinum variables: pale blue-gray patterned desktop, gray window surfaces, white highlights, dark bevel edges, black text, and compact system fonts.
- [ ] Style the menu bar as a thin white Mac menu strip with compact black text.
- [ ] Style body, shell, top bar, brand, session summary, workspace, side panels, chat, composer, drawers, settings, palette, and run strip.
- [ ] Give title bars a gray base matching the window interior with repeated light-gray, mid-gray, dark-gray, and rebound-gray horizontal bands.
- [ ] Keep centered titles and reserved `Close`/`Zoom` side labels visually present but inactive.
- [ ] Style buttons and fields with square classic Mac inset/outset shading plus clear hover, focus-visible, pressed, selected, disabled, and error states.
- [ ] Keep code, terminal, and diff surfaces dark with readable monospace text.
- [ ] Ensure badges, meters, links, tables, approval controls, and loading/error content remain visible.
- [ ] Add mobile overrides that preserve title texture, slots, labels, and touch targets.
- [ ] Run `git diff --check` and inspect desktop/mobile screenshots against the Mac OS 8 reference.
- [ ] Commit as `feat: style classic Mac theme`.

## Chunk 3: Cache and metadata freshness

### Task 3: Refresh static shell metadata

**Files:**
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/public/manifest.webmanifest`
- Modify: `apps/web/public/index.html`
- Modify: `apps/web/public/approval-review.html`
- Test: `apps/api/src/app.test.ts`
- Test: `tests/e2e/navigation.spec.ts`

- [ ] Bump the service-worker cache name and update its API test and browser cache assertion.
- [ ] Set static browser and manifest colors to the Mac OS 8 gray/blue desktop palette.
- [ ] Confirm the service worker still caches only shell assets and not API data.
- [ ] Commit as `chore: refresh classic Mac shell cache`.

## Chunk 4: Full verification and handoff

### Task 4: Verify the feature

**Files:**
- Test: `apps/api/src/settings.test.ts`
- Test: `apps/api/src/app.test.ts`
- Test: `tests/e2e/navigation.spec.ts`

- [ ] Run `npm run typecheck`.
- [ ] Run `npm run typecheck:e2e`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run the focused Chromium browser flow for theme persistence/cycling, then the full browser suite if the local server is available.
- [ ] Inspect the theme at desktop and mobile sizes for title texture, contrast, clipping, drawer states, and loading errors.
- [ ] Run `git diff --check` and report unrelated pre-existing lint or format failures separately.
- [ ] Commit any final scoped fixes and prepare the branch for integration.
