# FlanCommand System.css Theme Design

## Goal

Retheme the FlanCommand web app to closely match the monochrome Apple System 6
look represented by [System.css](https://github.com/sakofchit/system.css), while
preserving all existing behavior and responsive layout.

## Direction

Use the pure monochrome System 6 direction:

- Palette is limited to black, white, and grays.
- Connection, success, warning, and error states use text, symbols, borders,
  and control states. No colored status accents.
- Use a Chicago/Geneva-style system font stack with local safe fallbacks.
- Use square controls, 1–2px borders, inset fields, outset buttons, striped
  title bars, and hard-edged window chrome.
- Remove rounded cards, glow, soft shadows, gradients, and decorative modern
  dashboard treatments.

## Scope

The change is limited to the web presentation layer and theme-facing metadata:

- Retheme the main app shell, top bar, sidebars, chat, composer, dialogs,
  settings, notifications, approvals, files, activity, code/markdown output,
  and empty/error/loading states.
- Preserve existing HTML ids, JavaScript event wiring, API calls, storage,
  uploads, approvals, command center, and session behavior.
- Update theme-color metadata and service-worker cache version if needed.
- Do not add a runtime CSS dependency. The System.css look will be reproduced
  locally so the app remains usable without a network request.

## Layout and interaction

The current three-column workspace remains. The visual hierarchy becomes:

1. A compact menu-bar-like top strip with FlanCommand identity, session title,
   connection text, and utility controls.
2. Sidebars styled as classic document windows with title bars and grouped
   controls.
3. Chat as the main window pane, with messages as plain bordered blocks and
   the composer as a modeless dialog-like control row.
4. Existing mobile drawer tabs remain available. At phone width, drawers keep
   their current open/close behavior and controls remain reachable without
   horizontal scrolling.

Interactive states must be visible in monochrome:

- Buttons use outset borders and a pressed inset state.
- Fields use inset borders and a strong focus outline.
- Disabled controls use gray text and a visibly flattened border.
- Errors use a labeled, bordered block with an error symbol.
- Connection state includes its current text label, not only a dot.

## Implementation plan

- Keep semantic markup and ids stable.
- Replace the current visual tokens and component rules in
  `apps/web/public/styles.css` with System 6 tokens and component treatments.
- Add targeted selectors for elements that need explicit loaded, empty, error,
  disabled, or focus styling.
- Avoid changing application JavaScript unless a visual state cannot be
  represented by existing classes or attributes.

## Verification

Run the existing quality checks and browser suite. Inspect the rendered app at
desktop and phone widths. Verify:

- Initial loading and empty states are readable.
- Chat text, code blocks, markdown tables, attachments, and long paths do not
  overflow.
- Settings, notifications, approvals, project controls, and file controls stay
  usable.
- Focus, hover, pressed, disabled, error, reconnecting, and connected states
  are distinct without color.
- Mobile drawers open, close, and do not hide critical actions.
- No existing behavior tests regress.

