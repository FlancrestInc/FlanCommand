# Scrollable Slash Command Picker Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan.

**Goal:** Let users browse every available slash command in a bounded, scrollable picker while preserving filtering, insertion, and Tab completion.

**Architecture:** Keep the existing session command catalog in `state.commands`. Remove the render limit so the picker receives the full catalog, and constrain the existing menu with CSS scrolling. Extend the mock catalog and browser tests so the full-list behavior is observable.

**Tech Stack:** Vanilla browser JavaScript, CSS, Playwright, Vitest, TypeScript, service-worker cache versioning.

---

## Files

- Modify `apps/web/public/app.js`: render all matching commands.
- Modify `apps/web/public/styles.css`: give the command menu a bounded scroll region.
- Modify `packages/hermes-adapter/src/mock-transport.ts`: expose more mock commands for browser coverage.
- Modify `tests/e2e/chat.spec.ts`: verify the complete list is rendered and scrollable.
- Modify `apps/web/public/sw.js`, `apps/api/src/app.test.ts`, and `tests/e2e/navigation.spec.ts`: advance the static asset cache version.

## Task 1: Add failing browser coverage

- [ ] Add a test that opens the command picker button and expects more than six command entries, including the final mock command.
- [ ] Assert the menu has a bounded scroll style or scrollable overflow and can scroll down to the final command.
- [ ] Run the focused browser test and confirm it fails because the current renderer only returns six commands and the menu is not scroll constrained.

## Task 2: Expand the mock command catalog

- [ ] Add seven or more stable mock commands with distinct names and descriptions in `packages/hermes-adapter/src/mock-transport.ts`.
- [ ] Run the mock transport tests and confirm the existing command response contract still passes.

## Task 3: Implement the full scrollable picker

- [ ] Remove `.slice(0, 6)` from `commandMatches()` so filtering searches the full catalog.
- [ ] Add a maximum height and `overflow-y: auto` to `.command-menu`.
- [ ] Keep the empty state and current token insertion behavior unchanged.
- [ ] Bump the service-worker cache from `v16` to `v17` and update its API and navigation expectations.

## Task 4: Verify and commit

- [ ] Run `npm run typecheck`.
- [ ] Run `npm run typecheck:e2e`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check` and the focused browser test against the mock server.
- [ ] Commit with `feat: make slash command picker browsable`.
