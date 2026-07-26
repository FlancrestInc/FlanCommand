# Browser End-to-End Coverage Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the Hermes browser frontend works through a real browser for the core chat, navigation, file, and recovery journeys.

**Architecture:** Keep the existing static browser app and API BFF. Add Playwright as a separate end-to-end test layer that starts the already-built API in deterministic mock mode, then drives the served app through HTTP and browser events. Product changes are allowed only when an end-to-end test demonstrates a user-facing defect.

**Tech Stack:** TypeScript, Node HTTP API, static HTML/CSS/JavaScript, Playwright Test, deterministic Hermes mock transport.

---

## Chunk 1: Test harness

### Task 1: Add the browser test runner

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `playwright.config.ts`
- Create: `tests/e2e/fixtures.ts`
- Modify: `.gitignore` if Playwright output needs ignoring

- [x] Add `@playwright/test` as a workspace dev dependency and a `test:e2e` script.
- [x] Configure the runner to use the built API, mock Hermes transport, an isolated storage root, and a fixed loopback port.
- [x] Configure trace, screenshot, and video retention only on failure.
- [x] Run the empty runner and confirm it starts the API and can reach `/api/health`.

## Chunk 2: Core browser journeys

### Task 2: Cover the chat journey

**Files:**

- Create: `tests/e2e/chat.spec.ts`

- [x] Assert the shell loads with a visible conversation and composer.
- [x] Create a new conversation, submit a prompt, and assert the streamed assistant response appears once.
- [x] Assert the working state clears after completion.
- [x] Assert the model selector changes the session through the visible UI.

### Task 3: Cover navigation and persistence

**Files:**

- Create: `tests/e2e/navigation.spec.ts`

- [x] Exercise mobile navigation at a narrow viewport.
- [x] Open and close the notifications, jobs, and diagnostics surfaces.
- [x] Refresh after creating or renaming a conversation and assert the session remains visible.

### Task 4: Cover files, approvals, and recovery

**Files:**

- Create: `tests/e2e/files-and-recovery.spec.ts`

- [x] Upload a text file through the file picker and assert it appears in the library.
- [x] Open the in-page preview and assert the file content is visible.
- [x] Trigger a project policy approval and assert the approval drawer exposes the decision controls.
- [x] Exercise the failed-send recovery state without resending the prompt automatically.

## Chunk 3: Fixes and evidence

### Task 5: Fix only failures found by the browser tests

**Files:**

- Modify: exact product files identified by failing tests
- Test: the failing `tests/e2e/*.spec.ts`

- [x] For each failure, write or keep the failing assertion first.
- [x] Make the smallest user-facing fix.
- [x] Re-run the focused browser test, then the complete browser suite.

### Task 6: Document the browser gate

**Files:**

- Modify: `docs/phase-reports/phase-3-chat-vertical-slice.md`
- Modify: `README.md`

- [x] Record the exact `npm run test:e2e` command and browser coverage.
- [x] Record known limits when a Hermes feature cannot be exercised by the mock.
- [x] Run format, lint, typecheck, unit tests, build, and browser tests.
