# Command Center Drawer Layout Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the FlanCommand chat composer visible at all window sizes while moving side content into usable drawers and hiding long sections behind disclosure controls.

**Architecture:** Keep the existing single-page shell and state model. Change the workspace from a permanently visible three-column layout to a full-height chat with two responsive side drawers. Use bounded scrolling for messages and long drawer sections. Extend existing drawer and mobile navigation patterns instead of adding a new UI framework.

**Tech Stack:** Static HTML, CSS, browser JavaScript modules, Playwright E2E tests, Vitest/unit checks, npm/pnpm scripts.

---

## File map

- Modify `apps/web/public/index.html`: add drawer triggers and drawer semantics, reorganize existing sidebar/detail content into drawer containers, add disclosure controls, and update composer help text.
- Modify `apps/web/public/styles.css`: define the full-height shell, chat-only scrolling, pinned composer, desktop/mobile drawer geometry, backdrop, transitions, and disclosure states.
- Modify `apps/web/public/app.js`: manage drawer state and focus, disclosure state, Escape/backdrop behavior, and Enter/Shift+Enter composer handling.
- Modify `tests/e2e/chat.spec.ts`: cover send-key behavior and composer visibility.
- Modify `tests/e2e/navigation.spec.ts`: cover desktop/mobile drawer behavior, focus, and collapsible sections.
- Modify `docs/superpowers/specs/2026-07-27-command-center-drawer-layout-design.md` only if implementation discovers an approved design decision that must be clarified. Do not broaden scope.

## Chunk 1: Add failing browser coverage for the approved behavior

### Task 1: Define composer keyboard regression tests

**Files:**
- Modify: `tests/e2e/chat.spec.ts`

- [ ] Add a test that fills the composer and presses `Enter`, then expects one additional user message and one request/send result.
- [ ] Add a test that fills the composer with text, presses `Shift+Enter`, and expects a newline while the assistant message count stays unchanged.
- [ ] Assert the visible helper text contains `Enter to send` and `Shift+Enter`.
- [ ] Keep an existing send-button test so pointer sending remains covered.
- [ ] Run `pnpm exec playwright test tests/e2e/chat.spec.ts --project=chromium` and confirm the new keyboard expectations fail against the current Command/Control-only behavior.

### Task 2: Define layout and drawer regression tests

**Files:**
- Modify: `tests/e2e/navigation.spec.ts`

- [ ] Add a desktop viewport test at a short height, such as `1280x520`, and assert the composer form and send button are within the viewport.
- [ ] Add a test that opens Conversations and Run Details and verifies only one side drawer is open at a time.
- [ ] Add Escape and backdrop-close assertions for the active drawer.
- [ ] Add a mobile test that opens the drawer, checks the drawer trigger state, selects a conversation, and verifies the drawer closes.
- [ ] Add a test for Recent Chats disclosure using `aria-expanded` and visibility.
- [ ] Add a test for Audit Log or another long technical section that keeps its header/action visible while collapsed.
- [ ] Run the focused Chromium tests and record the expected failures before implementation.

## Chunk 2: Rebuild the shell around a pinned chat composer

### Task 3: Update the HTML structure and accessible controls

**Files:**
- Modify: `apps/web/public/index.html`

- [ ] Keep the chat column as the primary sibling in `.workspace`.
- [ ] Add a left drawer trigger with an accessible label such as `Open conversations`.
- [ ] Add a right drawer trigger with an accessible label such as `Open run details` near the chat header/top actions.
- [ ] Give each drawer an explicit label, close control, and `aria-hidden`/`aria-expanded` relationship to its trigger.
- [ ] Add a backdrop element for side drawers without reusing the existing updates/settings backdrop IDs.
- [ ] Preserve all current sidebar and detail-panel controls and IDs so existing app behavior keeps working.
- [ ] Wrap Recent Chats, Audit Log, Activity, Artifacts, Workspace Browser, and other lengthy content in disclosure sections.
- [ ] Keep refresh, close, count, and status controls in disclosure headers.
- [ ] Change the composer hint from `⌘ ↵ to send` to `Enter to send · Shift+Enter for new line.`
- [ ] Make disclosure headers keyboard-operable buttons or native `details/summary` controls with correct accessible names.

### Task 4: Add the full-height and drawer CSS

**Files:**
- Modify: `apps/web/public/styles.css`

- [ ] Make `.app-shell`, `.workspace`, and `.chat-column` resolve to the available viewport height without introducing page-level scrolling.
- [ ] Set `.message-scroll` to flex and overflow independently so the composer stays in the bottom layout slot.
- [ ] Keep `.composer-wrap` in the chat column’s bottom slot and ensure run status/attachment/command-menu content cannot push the send button outside the viewport.
- [ ] Preserve the existing textarea maximum height and make its overflow internal.
- [ ] Replace permanent desktop sidebar/detail columns with drawer positioning that leaves the chat full width when closed.
- [ ] Define left and right drawer open states with transform/visibility and a bounded internal scroll area.
- [ ] Add a shared side-drawer backdrop and ensure it sits below the drawer but above the chat.
- [ ] Keep touch targets at least 44px on small screens.
- [ ] Add responsive rules so drawers overlay the chat on tablet/mobile and do not reduce chat width below usable limits.
- [ ] Add disclosure styles that retain visible headers and actions while hiding only body content.
- [ ] Use transform/opacity for drawer motion and retain the existing reduced-motion override.
- [ ] Run `pnpm exec prettier --check apps/web/public/index.html apps/web/public/styles.css` after the structural/CSS edit.

## Chunk 3: Add state and interaction behavior

### Task 5: Implement composer keyboard behavior

**Files:**
- Modify: `apps/web/public/app.js`

- [ ] Change the composer keydown handler so plain `Enter` prevents the textarea default and requests form submission.
- [ ] Return early for `Shift+Enter` so the browser inserts a newline.
- [ ] Keep `Meta+Enter` and `Control+Enter` as optional compatibility send shortcuts unless the implementation finds they conflict with the new behavior.
- [ ] Preserve submit validation, draft storage, command-menu behavior, attachments, and recovery state.
- [ ] Run the focused chat E2E tests and confirm both keyboard paths pass.

### Task 6: Implement drawer state, focus, and disclosure state

**Files:**
- Modify: `apps/web/public/app.js`

- [ ] Add state for the active side drawer and the previously focused trigger.
- [ ] Implement one `openSideDrawer(kind, trigger)` path that closes the other drawer, updates classes/ARIA, stores the trigger, and focuses the drawer close button or first useful control.
- [ ] Implement one `closeSideDrawer()` path that removes the open state, hides the backdrop, restores ARIA attributes, and returns focus to the trigger when still connected.
- [ ] Close the active side drawer on Escape.
- [ ] Close the side drawer when the side-drawer backdrop is clicked.
- [ ] Close Conversations after selecting a session on overlay layouts while preserving desktop behavior if the drawer remains open by default.
- [ ] Replace or coordinate the current `#mobile-sidebar` and `#brand` toggles with the new drawer state so there is one source of truth.
- [ ] Add disclosure state handlers for Recent Chats and technical sections. Keep the header controls usable when the body is hidden.
- [ ] Decide whether disclosure state belongs in session memory only or local storage; use session memory unless the current app state pattern makes persistence trivial.
- [ ] Run the focused navigation E2E tests in Chromium and Firefox.

## Chunk 4: Verify edge cases and finish

### Task 7: Expand browser coverage

**Files:**
- Modify: `tests/e2e/chat.spec.ts`
- Modify: `tests/e2e/navigation.spec.ts`

- [ ] Verify composer visibility at short and tall desktop sizes.
- [ ] Verify a long draft scrolls inside the textarea and keeps the send button visible.
- [ ] Verify a streamed response, run strip, attachment chips, and command suggestions do not make the composer unreachable.
- [ ] Verify drawer open/close, focus return, Escape, backdrop, and one-drawer-at-a-time behavior.
- [ ] Verify collapsed/expanded sections expose correct `aria-expanded` values.
- [ ] Verify reduced motion removes meaningful drawer transition duration.
- [ ] Run `pnpm exec playwright test --project=chromium`.
- [ ] Run `pnpm exec playwright test --project=firefox`.

### Task 8: Run repository checks and inspect the diff

**Files:**
- No new files expected.

- [ ] Run `npm run check`.
- [ ] Run `git diff --check`.
- [ ] Review the diff for preserved element IDs, no API changes, no unrelated styling changes, and no regressions to the existing generic updates drawer.
- [ ] Confirm the final UI has one primary scroll region for chat, a visible composer, accessible drawer controls, and usable collapsed headers.
- [ ] Commit the implementation in focused commits if working incrementally, using messages such as `test: cover command center drawer behavior`, `feat: add command center side drawers`, and `test: verify responsive composer layout`.

