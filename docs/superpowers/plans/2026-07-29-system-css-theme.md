# FlanCommand System.css Theme Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan.

**Goal:** Restyle FlanCommand as a monochrome Apple System 6 command center while preserving all current behavior.

**Architecture:** Keep the existing static HTML shell, ids, vanilla JavaScript, and three-column responsive layout. Replace the visual token layer and component rules in the public stylesheet, then verify real states in the existing Playwright suite and local browser screenshots.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, TypeScript build, Vitest, Playwright.

---

## Chunk 1: Map the current presentation surface

**Files:**
- Inspect: `apps/web/public/index.html`
- Inspect: `apps/web/public/styles.css`
- Inspect: `apps/web/public/app.js`
- Inspect: `tests/e2e/navigation.spec.ts`, `tests/e2e/chat.spec.ts`, `tests/e2e/files-and-recovery.spec.ts`, `tests/e2e/approval-review.spec.ts`

- [ ] List all visual state classes and attribute selectors used by the shell, drawers, settings, chat, approvals, files, dialogs, markdown, and errors.
- [ ] Confirm which selectors are behavior-sensitive and must not be renamed.
- [ ] Run the focused browser tests once to capture the baseline.

Run: `npm run test:e2e -- --project=chromium tests/e2e/navigation.spec.ts tests/e2e/chat.spec.ts`

Expected: baseline tests pass before style changes.

## Chunk 2: Replace the visual token and primitive layer

**Files:**
- Modify: `apps/web/public/styles.css`
- Modify: `apps/web/public/index.html:5-10`
- Modify: `apps/web/public/approval-review.html:1-10`
- Modify: `apps/web/public/sw.js:1-20` if the cache version is stale

- [ ] Replace dark modern tokens with monochrome System 6 tokens: paper, white, black, gray, border, shadow, and system font stacks.
- [ ] Style body and app shell with a light gray desktop and paper window panes.
- [ ] Create reusable button, input, select, textarea, focus, disabled, pressed, separator, and title-bar rules.
- [ ] Use striped title bars, square corners, 1–2px borders, and hard offset shadows.
- [ ] Update browser theme metadata to a light monochrome value.
- [ ] Keep `prefers-reduced-motion` behavior and existing responsive breakpoints intact.
- [ ] Run `git diff --check` and the CSS formatter/check if applicable.

## Chunk 3: Restyle app regions and loaded states

**Files:**
- Modify: `apps/web/public/styles.css`
- Modify: `apps/web/public/index.html` only if an existing semantic hook is insufficient

- [ ] Restyle the top bar as a compact menu-bar-like strip with readable session and connection labels.
- [ ] Restyle sidebar and detail panels as windows with clear section rules and no nested rounded cards.
- [ ] Restyle conversation rows, project controls, credential/file libraries, and tool links.
- [ ] Restyle welcome content, messages, tool/activity blocks, markdown, tables, code blocks, attachments, and composer.
- [ ] Restyle settings, notifications, approval, command-center, diagnostic, retry, loading, empty, and error states.
- [ ] Make every state legible in monochrome using labels, symbols, borders, and control shape.
- [ ] Check long text, paths, code, tables, and attachment names for overflow.

## Chunk 4: Verify responsive behavior and accessibility

**Files:**
- Modify: `tests/e2e/navigation.spec.ts` or another existing E2E file only for missing visual-state assertions
- Modify: `apps/web/public/styles.css` for discovered fixes

- [ ] Run the desktop Chromium browser suite.
- [ ] Run the mobile navigation and settings flows at the existing phone viewport.
- [ ] Inspect screenshots or live browser state at desktop and phone widths.
- [ ] Verify keyboard focus, disabled controls, pressed buttons, dialogs, drawers, and error/reconnect states.
- [ ] Fix any contrast, overflow, z-index, or visibility issue found.
- [ ] Run `npm run check`.

## Chunk 5: Final review

- [ ] Run `git diff --check`.
- [ ] Run `npm run check` and the Chromium E2E suite again after final fixes.
- [ ] Review `git status --short` and keep only requested theme work plus the approved spec/plan docs.
- [ ] Summarize changed files and verification results.

