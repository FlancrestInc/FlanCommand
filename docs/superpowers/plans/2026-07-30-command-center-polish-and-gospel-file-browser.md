# Command Center Polish and Gospel File Browser Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the command-center UI and add a keyboard/mouse filesystem picker backed by the active remote Hermes host, normally Gospel.

**Architecture:** Keep the static browser shell. Add a host-aware remote listing service in the API using the existing SSH execution boundary. Add focused browser helpers for theme metadata, drawer transitions, composer layout, streaming placeholders, wallpaper state, and slash file completion. Preserve the browser-to-Barnabas boundary.

**Tech Stack:** TypeScript API, static HTML/CSS/JavaScript web shell, SSH, Vitest, Playwright, service worker.

---

## Chunk 1: Remote filesystem listing on Gospel

### Task 1: Add a testable remote listing service

**Files:**
- Create: `apps/api/src/remote-filesystem.ts`
- Test: `apps/api/src/remote-filesystem.test.ts`
- Modify: `apps/api/src/terminal.ts` only if a small shared SSH command runner is needed

- [ ] Define `RemoteFilesystemEntry`, `RemoteFilesystemListing`, and a runner interface that accepts host, absolute path, and bounded output.
- [ ] Add a shell-safe path encoder. Reject empty non-root paths, non-absolute paths, and control characters.
- [ ] Parse deterministic NUL-delimited remote output into directories, files, and symlinks without reading file contents.
- [ ] Sort directories before files, then sort names naturally.
- [ ] Bound entry count and bytes. Return typed errors for invalid paths, permission failure, SSH failure, and malformed output.
- [ ] Add tests for root, nested paths, spaces, sorting, malformed output, output limits, and remote failures.
- [ ] Run `pnpm exec vitest run apps/api/src/remote-filesystem.test.ts` and confirm it passes.
- [ ] Commit: `feat: add remote filesystem listing service`.

### Task 2: Expose the host-aware API endpoint

**Files:**
- Modify: `apps/api/src/server.ts` near the existing workspace endpoints
- Test: `apps/api/src/app.test.ts`
- Modify: `apps/api/src/policy.ts` only if a host-boundary helper is needed

- [ ] Add `GET /api/filesystem/list?projectId=...&host=...&path=...`.
- [ ] Default `host` to the project’s declared Hermes host, using `gospel` when it is declared and otherwise the first declared host.
- [ ] Reject undeclared hosts with the existing project-boundary error shape.
- [ ] Invoke the remote listing service with the requested path, defaulting to `/`.
- [ ] Return `{ host, path, entries }` and no file contents.
- [ ] Map remote errors to stable API error codes and readable messages.
- [ ] Add API tests proving Gospel-host selection, undeclared-host rejection, path forwarding, and failure responses.
- [ ] Run focused API tests and `pnpm run typecheck`.
- [ ] Commit: `feat: expose Gospel filesystem browsing`.

## Chunk 2: Theme registry, migration, and wallpaper settings

### Task 3: Make theme and wallpaper metadata authoritative

**Files:**
- Modify: `apps/web/public/app.js`
- Modify: `apps/api/src/settings.ts`
- Test: `apps/api/src/settings.test.ts`

- [ ] Replace duplicated theme arrays and labels with metadata containing label, send icon, title-bar behavior, wallpaper family, and default wallpaper.
- [ ] Remove `win98` from supported theme values because it is the legacy System 6 Compact value.
- [ ] Migrate persisted `win98` values to `xp`; keep other Windows 98 CSS theme values unchanged.
- [ ] Add wallpaper keys for each platform family, plus `none` and browser-local custom wallpaper state.
- [ ] Keep API settings free of image data; store custom wallpaper data only in bounded browser storage.
- [ ] Add tests for defaults, legacy migration, invalid values, and all supported themes/wallpapers.
- [ ] Update settings markup to remove System 6 Compact and add custom upload/remove controls and live preview.
- [ ] Commit: `feat: normalize themes and wallpaper settings`.

### Task 4: Repair contrast and theme-specific controls

**Files:**
- Modify: `apps/web/public/styles.css`
- Modify: `apps/web/public/index.html`
- Test: `tests/e2e/navigation.spec.ts`

- [ ] Define explicit foreground, muted, faint, input, border, accent, and accent-ink variables for every theme.
- [ ] Style selects, text inputs, textareas, checkboxes, placeholders, focus rings, settings panels, drawer cards, and notification controls per theme.
- [ ] Remove Classic Mac Close and Zoom title labels from the title-bar markup or hide only those labels in that theme.
- [ ] Increase the notification button width and use an envelope icon with a readable count badge.
- [ ] Remove compact theme controls and cycle entries from all UI paths.
- [ ] Add browser assertions for theme option removal, contrast-critical control colors, notification layout, and settings interaction in multiple themes.
- [ ] Commit: `fix: align controls and contrast across themes`.

## Chunk 3: Drawer and composer layout repairs

### Task 5: Stabilize drawer state and layering

**Files:**
- Modify: `apps/web/public/app.js`
- Modify: `apps/web/public/styles.css`
- Test: `tests/e2e/navigation.spec.ts`

- [ ] Keep one canonical side-drawer state and one transition helper for both handles, backdrop, close buttons, logo focus, and opposite-drawer switching.
- [ ] Remove vertical handle transforms and bounce animations from active/pressed/focus states.
- [ ] Set stacking order so chat remains visible beneath a translucent dimmer, drawers remain above it, and handles remain clickable.
- [ ] Restore focus to the correct handle after close without stale state.
- [ ] Add browser tests opening each handle repeatedly, switching sides, clicking logo between attempts, closing with backdrop/Escape, and checking readable dimmed content.
- [ ] Commit: `fix: stabilize side drawer interactions`.

### Task 6: Float the composer and move Stop beside Send

**Files:**
- Modify: `apps/web/public/index.html`
- Modify: `apps/web/public/app.js`
- Modify: `apps/web/public/styles.css`
- Test: `tests/e2e/chat.spec.ts`

- [ ] Remove the redundant `Hermes is working` run strip from the visible composer area while keeping run state for accessibility and recovery.
- [ ] Move Stop into the composer controls immediately left of Send.
- [ ] Make the composer part of the chat surface with a transparent page background and a floating panel shadow.
- [ ] Add per-theme Send symbols and accessible labels.
- [ ] Preserve Enter-to-send, Shift+Enter newline, attachments, model controls, and responsive mobile sizing.
- [ ] Add browser tests for composer placement, Stop/Send order, theme symbols, and keyboard behavior.
- [ ] Commit: `fix: refine floating chat composer`.

## Chunk 4: Streaming placeholder correctness

### Task 7: Do not render empty assistant bubbles

**Files:**
- Modify: `apps/web/public/app.js`
- Test: `apps/web/src/chat-recovery.test.ts` or a new focused browser-render test
- Test: `tests/e2e/chat.spec.ts`

- [ ] Insert the user message immediately, but create the assistant live message only when the first non-empty `message.delta` arrives.
- [ ] Keep Hermes working status as a non-bubble status node until response text exists.
- [ ] Remove temporary live nodes on completion, failure, stop, reconnect, and session refresh when no assistant text exists.
- [ ] Ensure durable session rendering cannot leave a zero-content assistant bubble.
- [ ] Add tests for delayed first delta, empty completion, failed stream, stopped stream, and normal streamed text.
- [ ] Run focused chat tests and commit: `fix: remove empty assistant response bubbles`.

## Chunk 5: Slash filesystem picker

### Task 8: Add picker markup and browser state

**Files:**
- Modify: `apps/web/public/index.html`
- Modify: `apps/web/public/app.js`
- Modify: `apps/web/public/styles.css`

- [ ] Add a picker container below the textarea with path breadcrumb, loading/error state, entry list, selected-row state, and a Use folder action.
- [ ] Track active slash token start/end, current directory, prefix, selected entry, host, and request sequence to ignore stale responses.
- [ ] Open when typing `/` at the active caret token and close on Escape, submit, or focus loss when appropriate.
- [ ] Query `/api/filesystem/list` for the active project host, defaulting to `/` and the project’s declared `gospel` host.
- [ ] Filter entries by the typed basename prefix while preserving directories first.
- [ ] Make rows buttons with mouse click, pointer selection, and visible keyboard focus.
- [ ] Reserve layout space below the input so opening the picker pushes the chat viewport upward.
- [ ] Commit: `feat: add remote filesystem picker shell`.

### Task 9: Implement keyboard and mouse completion

**Files:**
- Modify: `apps/web/public/app.js`
- Test: `tests/e2e/chat.spec.ts`

- [ ] Arrow keys move selection with wraparound.
- [ ] Tab inserts the selected directory/file path prefix and requests the next directory listing when needed.
- [ ] Enter enters directories, inserts files, and preserves surrounding message text.
- [ ] Add a separate Use folder action that inserts a directory path without entering it.
- [ ] Keep literal Tab behavior when no file picker completion applies and preserve slash-command completion.
- [ ] Add browser tests for typed slash opening, narrowing, mouse directory navigation, mouse file insertion, Use folder, arrows, Tab, Enter, Escape, and surrounding text.
- [ ] Commit: `feat: complete remote filesystem picker behavior`.

## Chunk 6: Cache freshness and verification

### Task 10: Refresh shell cache and update regression coverage

**Files:**
- Modify: `apps/web/public/sw.js`
- Test: `apps/api/src/app.test.ts`
- Test: `tests/e2e/navigation.spec.ts`

- [ ] Bump the service-worker cache name for all shell changes.
- [ ] Keep API responses out of the cache.
- [ ] Update cache assertions and add a browser reload check for the new shell.
- [ ] Run `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run typecheck:e2e`, `pnpm test`, `pnpm run build`.
- [ ] Run Chromium and Firefox E2E suites.
- [ ] Run `git diff --check` and inspect screenshots at desktop and phone widths across normal, DOS, and Classic Mac themes.
- [ ] Commit: `chore: refresh command center shell cache`.

### Task 11: Final live verification

**Files:**
- Modify only files needed for verified defects.

- [ ] Start the local API/browser stack using the repository’s existing test path.
- [ ] Verify the active project resolves host `gospel` and the picker lists Gospel directories, not Barnabas directories.
- [ ] Verify one directory navigation, one file insertion, one folder insertion, and one permission/error state.
- [ ] Verify no empty assistant bubble after a delayed first response delta.
- [ ] Verify both drawer handles remain stationary and reliable after repeated open/close cycles.
- [ ] Verify service-worker freshness after a reload.
- [ ] Report any live Gospel check that cannot run because the host or SSH route is unavailable.

