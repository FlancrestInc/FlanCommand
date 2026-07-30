# XP.css Theme Design

## Goal

Add a new local `Windows XP (XP.css)` theme to FlanCommand. Keep all existing
themes and all application behavior. The theme should follow the visual
language of [XP.css](https://github.com/botoxparty/XP.css): Luna blue window
chrome, silver panels, rounded beveled controls, white content surfaces, and
Windows system typography.

## Scope

- Add `xpcss` to API settings validation.
- Add `Windows XP (XP.css)` to the command center theme picker.
- Add `xpcss` to the top-right theme cycle.
- Add a local CSS theme layer. Do not load a runtime CDN stylesheet.
- Update static browser metadata and the service-worker cache version.
- Preserve System 6, BOOTSTRA.386, Windows 98, and existing themes.

## Visual system

The theme uses a light XP desktop palette:

- Luna blue gradients for the top bar, window title bars, active drawer heads,
  and primary actions.
- Silver and warm-gray surfaces for the shell, panels, settings, and drawers.
- White content areas and dark text for reliable reading contrast.
- Rounded corners and beveled borders for buttons, fields, cards, and window
  frames.
- Tahoma/Arial-style system typography with compact labels and readable body
  text.
- Green, amber, and red status colors remain distinct and readable on light
  surfaces.

## Component behavior

- Chat remains the main workspace and keeps its current scroll and composer
  behavior.
- Sidebar, details, settings, command palette, approvals, code, terminal, and
  file views receive matching XP chrome without changing their behavior.
- Hover, focus-visible, active, disabled, selected, and error states stay
  visibly distinct.
- Mobile layouts reduce decorative chrome and preserve action labels and touch
  targets.
- A missing API or loading state must still show readable text and controls.

## Data and cache

The theme key is `xpcss`. It is accepted by settings normalization, persisted
with existing settings, and included in the client theme order. The service
worker cache name is bumped because the shell CSS, JavaScript, metadata, and
picker markup change.

## Verification

- API settings tests accept and preserve `xpcss`.
- Browser coverage selects and persists `xpcss`.
- Browser coverage cycles through `xpcss` from the top-right theme button.
- TypeScript checks, unit tests, production build, and browser tests pass.
- Desktop and mobile screenshots are checked for contrast, clipping, and
  incorrect loaded/error states.
