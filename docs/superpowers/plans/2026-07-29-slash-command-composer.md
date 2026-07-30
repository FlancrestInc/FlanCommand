# Slash Command Composer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a discoverable slash-command button and token-aware Tab completion to the chat composer without changing send behavior.

**Architecture:** Reuse `state.commands` and the existing `#command-menu`. Add a small parser that finds the slash token around the textarea selection, then use one insertion helper for button selection, typed menu selection, and Tab completion. Keep the textarea focused for all command interactions and insert a literal tab when no command completion applies.

**Tech Stack:** Static HTML/CSS/JavaScript shell, Playwright browser tests, service worker cache.

---

## Chunk 1: Composer command control and shared insertion logic

### Task 1: Add the command button and token helpers

**Files:**
- Modify: `apps/web/public/index.html`
- Modify: `apps/web/public/app.js`
- Modify: `apps/web/public/styles.css`

- [ ] Add a `Commands` button beside `#attach-file-composer` with an accessible label and title.
- [ ] Add a helper that returns the active slash token, its start/end offsets, and query from the textarea selection.
- [ ] Add a helper that replaces only the active token, adds one trailing space, restores the caret after the inserted command, saves the draft, and keeps focus in the textarea.
- [ ] Update command-menu rendering to support button-opened list mode with an empty query.
- [ ] Reuse the insertion helper when an existing filtered command-menu item is clicked.
- [ ] Wire the new button to open the command menu without changing the textarea value.
- [ ] Add a clear empty state when the active session has no available commands.
- [ ] Style the button and command menu so they remain visible in the current themes and do not cover the composer controls.
- [ ] Run `git diff --check` and a focused browser smoke check.
- [ ] Commit as `feat: add composer command picker`.

## Chunk 2: Tab completion and focus behavior

### Task 2: Keep Tab inside the composer

**Files:**
- Modify: `apps/web/public/app.js`
- Test: `tests/e2e/chat.spec.ts`

- [ ] Extend the composer keydown handler for Tab before the Enter logic.
- [ ] When the active slash token has matches, cycle to the next match and replace only that token.
- [ ] Complete an exact or single match with a trailing space.
- [ ] When there are no slash matches, prevent browser focus movement and insert a literal `\t` at the caret.
- [ ] Keep Escape closing the command menu without changing the text.
- [ ] Add browser coverage for the new button, surrounding-text insertion, Tab completion, literal Tab insertion, and textarea focus retention.
- [ ] Keep existing Enter and Shift+Enter coverage passing.
- [ ] Commit as `feat: add slash command tab completion`.

## Chunk 3: Shell freshness and full verification

### Task 3: Refresh the cached shell

**Files:**
- Modify: `apps/web/public/sw.js`
- Test: `apps/api/src/app.test.ts`
- Test: `tests/e2e/navigation.spec.ts`

- [ ] Bump the service-worker cache name because composer markup, JavaScript, and CSS changed.
- [ ] Update the API service-worker assertion and browser cache assertion.
- [ ] Confirm the service worker still caches shell assets but no API responses.
- [ ] Commit as `chore: refresh composer shell cache`.

### Task 4: Verify the complete feature

**Files:**
- Test: `tests/e2e/chat.spec.ts`
- Test: `apps/api/src/app.test.ts`

- [ ] Run `npm run typecheck`.
- [ ] Run `npm run typecheck:e2e`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run focused Chromium chat tests, then the full browser suite if the local server is available.
- [ ] Inspect the composer in a normal theme and Classic Mac theme for button visibility, menu placement, focus, and mobile clipping.
- [ ] Run `git diff --check` and report unrelated pre-existing lint or format failures separately.
- [ ] Commit any final scoped fixes and prepare the branch for integration.
