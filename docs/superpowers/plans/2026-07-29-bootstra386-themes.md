# FlanCommand BOOTSTRA.386 Themes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add colored CGA, amber phosphor, and green phosphor DOS themes to the settings picker and top-right theme cycle while preserving the existing System 6 themes and app behavior.

**Architecture:** Extend the existing five-value theme contract and shared `themeOrder` list. Add a local DOS CSS layer after the System 6 layer, using shared DOS component rules plus three palette blocks keyed by `html[data-theme]`. Keep the current static shell, storage, API, responsive layout, and event wiring.

**Tech Stack:** TypeScript settings normalization, vanilla browser JavaScript, static HTML, CSS, Vitest, Playwright.

---

## Chunk 1: Extend theme contract and cycle list

**Files:**
- Modify: `apps/api/src/settings.ts`
- Test: `apps/api/src/settings.test.ts`
- Modify: `apps/web/public/app.js`
- Modify: `apps/web/public/index.html`
- Test: `tests/e2e/navigation.spec.ts`

- [ ] Add `cga`, `amber`, and `green` to `SettingsTheme` and settings normalization.
- [ ] Add unit tests for all three values and invalid-value fallback.
- [ ] Add names and ordering for all five themes in `app.js`.
- [ ] Update initial localStorage validation to accept all five values.
- [ ] Add the three options to `#settings-theme` with readable labels.
- [ ] Confirm the top-right button and settings save path use the shared order and names.
- [ ] Update the navigation E2E test to select each new theme, assert `html[data-theme]`, reload, and confirm persistence.
- [ ] Add an assertion that repeated top-right clicks cycle through the complete list.

## Chunk 2: Add DOS/CGA visual layer

**Files:**
- Modify: `apps/web/public/styles.css`
- Modify: `apps/web/public/index.html:6`
- Modify: `apps/web/public/manifest.webmanifest:8`

- [ ] Add DOS palette variables for CGA, amber, and green themes.
- [ ] Add shared DOS rules for body, shell, title bar, drawers, panes, cards, controls, inputs, menus, settings, notifications, approvals, files, messages, composer, markdown, code, terminal, and toasts.
- [ ] Use monospace type, dense spacing, square controls, bright borders, terminal-style fields, and readable colored focus rings.
- [ ] Override System 6 monochrome status, meter, badge, error, loading, and disabled styles for DOS themes.
- [ ] Keep long text, code, paths, tables, and mobile drawers scrollable.
- [ ] Ensure no remote runtime CSS/font dependency is added.
- [ ] Update browser and manifest theme colors to remain valid for the selected colored family.

## Chunk 3: Browser visual verification

**Files:**
- Modify: `tests/e2e/navigation.spec.ts` only if assertions need a stable selector
- Modify: `apps/web/public/styles.css` for discovered fixes

- [ ] Run focused settings and navigation E2E tests.
- [ ] Inspect desktop screenshots for CGA, amber, and green.
- [ ] Inspect phone screenshots for all three themes.
- [ ] Verify focus, disabled, error, loading, code, markdown, settings, composer, and drawer visibility.
- [ ] Fix contrast, overflow, or z-index issues found during inspection.

## Chunk 4: Final verification and handoff

- [ ] Run `npm run check` or the individual format, lint, typecheck, test, and build commands if the repository baseline blocks the aggregate script.
- [ ] Run the Chromium E2E suite.
- [ ] Run `git diff --check`.
- [ ] Review `git status --short` and keep only the approved spec, plan, and theme implementation changes.
- [ ] Commit the feature and report exact verification results.

