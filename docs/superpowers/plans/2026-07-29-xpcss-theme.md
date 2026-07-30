# XP.css Theme Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local Windows XP/XP.css-inspired theme that works in the settings picker and top-right theme cycle without changing app behavior.

**Architecture:** Extend the existing string-based theme registry and settings normalization. Add one scoped CSS layer under `html[data-theme="xpcss"]`, using local Luna colors and control states so it wins over earlier theme layers without affecting them. Update browser metadata and service-worker cache freshness with the existing shell pattern.

**Tech Stack:** TypeScript API settings, static HTML/CSS/JavaScript shell, Vitest, Playwright, service worker.

---

## Chunk 1: Theme registry and tests

### Task 1: Add the XP.css theme key

**Files:**
- Modify: `apps/api/src/settings.ts`
- Test: `apps/api/src/settings.test.ts`
- Modify: `apps/web/public/app.js`
- Modify: `apps/web/public/index.html`
- Test: `tests/e2e/navigation.spec.ts`

- [ ] Add `xpcss` to the `SettingsTheme` union and settings normalization allowlist.
- [ ] Add `xpcss` to the client local-storage allowlist, display-name map, and ordered cycle list.
- [ ] Add `Windows XP (XP.css)` to `#settings-theme`.
- [ ] Extend the existing theme persistence test to select and reload `xpcss`.
- [ ] Extend the existing theme cycle assertions so the cycle reaches `xpcss` and wraps correctly.
- [ ] Run `npm test` and the focused browser test after implementation.
- [ ] Commit as `feat: register XP.css theme`.

## Chunk 2: XP.css visual layer

### Task 2: Add scoped XP.css-inspired styles

**Files:**
- Modify: `apps/web/public/styles.css`

- [ ] Define local XP palette variables: Luna blue, active/inactive title gradients, silver shell, warm-gray panels, white content, dark text, and status colors.
- [ ] Style body, shell, top bar, brand, session summary, workspace, side panels, chat, composer, drawers, settings, palette, and run strip.
- [ ] Style buttons and fields with rounded XP bevels plus clear hover, focus-visible, pressed, selected, disabled, and error states.
- [ ] Keep code, terminal, and diff surfaces dark with readable monospace text.
- [ ] Ensure badges, meters, links, tables, approval controls, and loading/error content remain visible on light surfaces.
- [ ] Add mobile overrides that preserve touch targets and avoid clipped dialogs or controls.
- [ ] Run `git diff --check` and inspect desktop/mobile screenshots.
- [ ] Commit as `feat: style XP.css theme`.

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
- [ ] Set static browser/manifest colors to the XP blue shell color.
- [ ] Confirm the service worker still caches only shell assets and not API data.
- [ ] Commit as `chore: refresh XP.css shell cache`.

## Chunk 4: Full verification and handoff

### Task 4: Verify the merged feature

**Files:**
- Test: `apps/api/src/settings.test.ts`
- Test: `apps/api/src/app.test.ts`
- Test: `tests/e2e/navigation.spec.ts`

- [ ] Run `npm run typecheck`.
- [ ] Run `npm run typecheck:e2e`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run the focused Chromium browser test for theme persistence/cycling, then the full browser suite if the local server is available.
- [ ] Inspect the XP theme at desktop and mobile sizes for contrast, clipping, and loaded/error states.
- [ ] Run `git diff --check` and report any unrelated pre-existing lint or format failures separately.
- [ ] Commit any final scoped fixes and prepare the branch for integration.
