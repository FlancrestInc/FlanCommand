# FlanCommand command center drawer layout design

Date: 2026-07-27
Status: Approved design; implementation not started

## 1. Feature summary

FlanCommand is a desktop-first command center used by one power user. The chat is the primary work area. Conversations and technical run data should remain available, but should not crowd the chat or force the user to scroll past the conversation to reach the composer.

The web shell will keep the chat central, make both side panels slide-out drawers, keep the composer visible, and progressively disclose long technical lists through collapsible sections.

## 2. Primary user action

The user should always be able to read the current conversation and send the next message without scrolling to find the composer.

## 3. Design direction

The interface should feel calm and spacious. Technical data remains available on demand, but is not shown up-front. Preserve the current FlanCommand visual language, themes, controls, and existing chat features. Add structure and progressive disclosure instead of adding new visual decoration.

## 4. Layout strategy

- Keep one primary area: the chat.
- Make the chat column fill the available window height.
- Make the message list the main scrolling region.
- Pin the composer to the bottom of the chat column.
- Give the composer a maximum height. Long drafts scroll inside the textarea.
- Turn the left Conversations panel into a slide-out drawer.
- Turn the right Run Details panel into a slide-out drawer.
- On wide desktop, Conversations may open by default. Run Details starts closed or compact.
- On smaller screens, drawers overlay the chat instead of shrinking the chat column.
- Only one side drawer is open at a time.
- Preserve access to current left-panel controls: new conversation, search, project, permissions, credentials, and files.
- Preserve access to current right-panel controls: run status, activity, developer mode, audit, artifacts, workspace browser, terminal, and session details.

## 5. Key states

- Normal desktop: chat fills the center; Conversations can be open; Run Details is available as a drawer.
- Short desktop window: message list scrolls; composer and send button remain visible.
- Long conversation: only the message area scrolls; composer stays pinned.
- Long draft: textarea scrolls internally after its maximum height.
- Streaming run: run strip remains above the composer without pushing the composer out of view.
- Attachment or command menu open: the composer still remains inside its reserved bottom area.
- Small screen: either drawer slides over the chat with a backdrop.
- Drawer open: focus moves into the drawer; Escape and backdrop close it.
- Drawer closed: focus returns to the button that opened it.
- Collapsed section: header, count/status, and key actions remain visible; long content is hidden.
- Expanded section: content can scroll inside its own bounded area where needed.
- Loading/error/empty sections: preserve the section header and show the existing state content when expanded.
- Reduced motion: drawer and disclosure transitions become minimal or instant.

## 6. Interaction model

### Composer

- Enter sends a non-empty message.
- Shift+Enter inserts a newline.
- Command+Enter and Control+Enter may remain send shortcuts for compatibility.
- Empty or whitespace-only messages do not send.
- Change the helper text to `Enter to send · Shift+Enter for new line.`
- Preserve draft recovery, attachments, slash-command suggestions, streaming, stop, reconnect, and error recovery.

### Drawers

- Add clear controls for opening Conversations and Run Details.
- Opening one drawer closes the other.
- Escape closes the active drawer.
- Clicking the backdrop closes the drawer on overlay layouts.
- Selecting a conversation closes Conversations on small screens.
- Respect `prefers-reduced-motion`.
- Use semantic dialog/navigation state and correct `aria-expanded`/`aria-controls` relationships.

### Collapsible sections

- Recent Chats starts expanded.
- Audit Log, Activity, Workspace Browser, Artifacts, and other lengthy sections start collapsed or compact when their content is not immediately needed.
- Use real disclosure controls with `aria-expanded`.
- Keep section counts, status, refresh, close, and other essential actions visible in collapsed headers.
- Store open/closed state for the session. Persist across reload only if it fits the existing client state pattern without adding unnecessary storage complexity.

## 7. Content and labels

- Composer helper: `Enter to send · Shift+Enter for new line.`
- Conversation drawer trigger: `Open conversations`.
- Details drawer trigger: `Open run details`.
- Drawer close buttons should identify the panel, such as `Close conversations` and `Close run details`.
- Collapsible headers should expose their state to assistive technology.
- Do not duplicate explanatory text that is already clear from the visible section label.

## 8. Implementation boundaries

Expected files:

- `apps/web/public/index.html`: drawer triggers, semantic drawer structure, disclosure controls, and composer helper text.
- `apps/web/public/styles.css`: shell height, independent scrolling, pinned composer, drawer positioning/transitions/backdrop, and responsive breakpoints.
- `apps/web/public/app.js`: drawer state, Escape/backdrop handling, focus return, disclosure state, and composer keyboard behavior.
- `tests/e2e/`: desktop/mobile layout and keyboard interaction coverage.

No API or data-model changes are expected.

## 9. Verification plan

- Test Enter sends one message.
- Test Shift+Enter inserts a newline without sending.
- Test Command+Enter and Control+Enter if retained.
- Test the composer remains visible at short and tall desktop viewport sizes.
- Test long messages and long drafts do not push the send button out of view.
- Test both drawers open and close correctly, including Escape, backdrop, focus return, and one-drawer-at-a-time behavior.
- Test drawer behavior at desktop, tablet, and phone-sized viewports.
- Test Recent Chats and technical sections collapse and expand with correct accessibility state.
- Test active runs, streaming responses, attachments, command suggestions, audit loading, and error states inside the new layout.
- Test reduced-motion behavior.
- Run the repository check suite and Chromium and Firefox browser suites.

## 10. Alternatives considered

### Keep three columns and make only the composer sticky

Smallest code change, but the chat remains narrow and the sidebars stay visually heavy. It does not meet the progressive-disclosure goal as well.

### Use one drawer that switches between Conversations and Run Details

Calmest visual result, but it adds a mode switch and makes comparing chat context with run data slower.

### Use two responsive side drawers

Recommended. It preserves the current product structure, gives chat the space it needs, works from desktop through mobile, and keeps technical data one action away.

## 11. Open questions for implementation

- Whether the right drawer should be opened by a new top-level button, a compact status chip, or both.
- Whether Conversations should remain open by default at every desktop width or only above a wide breakpoint.
- Which section-state choices should persist across reloads.
- Whether the existing generic drawer/backdrop styles can be reused for side drawers or need a separate layout primitive.

