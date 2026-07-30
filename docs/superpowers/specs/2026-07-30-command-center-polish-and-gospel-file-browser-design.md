# Command Center Polish and Gospel File Browser Design

## Goal

Fix the command-center drawer, theme, composer, wallpaper, and streaming UI bugs. Add a mouse- and keyboard-friendly slash file browser that lists the filesystem on the active project host, normally Gospel.

## Scope

- Fix side-drawer layering, handle motion, focus, and open-state reliability.
- Make settings controls, text inputs, checkboxes, and drawer controls follow every theme with readable contrast.
- Resize and relabel the notification control with an envelope icon.
- Remove System 6 Compact.
- Remove the duplicate Hermes working strip and move Stop into the composer beside Send.
- Prevent empty assistant bubbles while a response is still pending.
- Use theme-specific Send symbols.
- Remove Classic Mac Close and Zoom title labels.
- Make the composer float over the chat background and reserve space when its file picker opens.
- Add theme-appropriate wallpapers, dynamic wallpaper previews, and a browser-uploaded custom wallpaper.
- Add slash-triggered filesystem browsing against the active project host.

## Architecture

The current static browser shell remains in `apps/web/public`. Browser state will stay in `app.js`, with small helpers for drawer state, composer state, theme metadata, and file-picker navigation. CSS changes will use shared variables first and scoped theme overrides only where a platform theme needs different control styling.

The browser must never read the Barnabas filesystem for this feature. The API will add a server-side remote filesystem listing path that uses the active project’s declared host, normally `gospel`, through the existing SSH host execution boundary. The browser calls Barnabas only. The remote command returns directory and file names, types, and paths; it does not read file contents. Paths and shell arguments must be safely encoded. Missing, denied, or unreadable paths return clear errors.

Flow:

```text
Browser composer
  -> Barnabas /api/filesystem/list
  -> active project host, default gospel
  -> remote directory listing
  -> picker rows and completion state
```

The picker starts when the active composer token begins with `/`. It tracks the directory, typed prefix, selected row, and loading/error state. Directories open on click or Enter. Files insert their full path. A directory also has a separate use-folder action. Arrow keys move selection, Tab completes the selected path, Enter activates it, Escape closes the picker, and mouse clicks work for every action. The picker renders below the textarea and increases composer height so it never covers chat or the draft.

## Drawer behavior

Only one side drawer is open at a time. Opening a drawer updates one canonical state value, sets `aria-expanded`, focuses the drawer close control, and exposes one translucent backdrop. The backdrop dims the main content but stays below the drawer. Handles have no pressed-state translation or animation that changes vertical position. Clicking a handle always calls the same open/close transition, including after focus moves to the logo or the opposite drawer.

## Composer and streaming behavior

The assistant working indicator appears only inside the live assistant message. The live assistant message is not inserted until a non-empty assistant delta arrives, or it contains an explicit non-bubble activity state with no empty response bubble. Completion and failure paths remove any temporary live node and render the durable result once.

The composer remains visually part of the chat area, with no full-width opaque bottom band. Stop appears immediately left of Send. Send uses a per-theme symbol, with a return symbol for Mac themes and a platform-appropriate arrow or key symbol for other themes. The existing Enter-send and Shift+Enter-newline behavior remains unchanged.

## Themes and wallpapers

Theme metadata will define the display label, send icon, title-bar labels, default wallpaper, and wallpaper choices. System 6 Compact is removed from state validation, theme cycling, settings, and persisted normalization. Existing stored `win98` values migrate to `xp`.

Wallpaper choices are grouped by platform family and update when the theme changes. The settings preview changes immediately with the selected wallpaper. A custom upload is stored in browser storage as a bounded data URL, with a clear size/type limit and a remove-custom action. The API settings record stores only the selected wallpaper key; custom image data stays browser-local.

All text and controls must meet a practical readable contrast target against their actual themed background. Theme overrides will explicitly set `color`, `background`, `border-color`, placeholder color, checkbox accent, select appearance, and focus styles instead of relying on browser defaults.

## Error handling and safety

- Remote path listing rejects an empty or non-absolute path except for the initial `/` request.
- The requested host must be declared by the active project; otherwise the API returns a host-boundary error.
- SSH failures, permission failures, invalid paths, and malformed remote output become user-readable picker errors.
- Remote listing is bounded by entry count and output bytes.
- Directory listing never follows symlinks for traversal unless the remote command reports a safe directory target.
- No file contents are returned by the picker endpoint.
- Existing workspace browsing and local file uploads keep their current behavior.

## Testing

- Unit tests for theme migration, wallpaper metadata, live-message rendering, drawer transition helpers, and remote listing parsing.
- API tests for declared-host enforcement, Gospel-host listing, malformed output, SSH errors, bounds, and no-content behavior.
- Browser tests for both drawer handles, dimmed-but-readable content, settings controls across themes, notification sizing/icon, composer layout, Stop/Send, no empty assistant bubble, wallpaper switching/upload, and the full picker keyboard/mouse flow.
- Run format check, lint, typecheck, unit tests, build, Chromium E2E, and Firefox E2E when the local browser environment is available.
- Bump the service-worker cache version for all shell changes.

## Out of scope

- Adding a new Hermes gateway RPC.
- Reading or editing remote file contents from the slash picker.
- Changing Hermes prompt semantics or the existing workspace policy model beyond the host-aware listing endpoint.
