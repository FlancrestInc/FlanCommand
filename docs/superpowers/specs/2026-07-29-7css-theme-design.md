# 7.css Theme Design

## Goal

Add a new local `Windows 7 (7.css)` theme to FlanCommand. Keep all existing
themes and all application behavior. The theme follows [7.css](https://github.com/khang-nd/7.css): Windows 7 Aero glass, blue gradients, soft shadows, rounded controls, and light content panels.

## Scope

- Add `win7css` to API settings validation.
- Add `Windows 7 (7.css)` to the command center theme picker.
- Add `win7css` to the top-right theme cycle.
- Add a local CSS theme layer. Do not load a runtime CDN stylesheet.
- Update static browser metadata and the service-worker cache version.
- Preserve System 6, BOOTSTRA.386, Windows 98, Windows XP, and existing themes.

## Visual system

The theme uses a light Aero palette:

- Blue translucent gradients for the top bar, window headers, active drawers,
  and primary actions.
- Pale blue-gray shell surfaces with soft shadows for depth.
- White content cards and dark text for reliable reading contrast.
- Rounded corners, subtle borders, and light inner highlights for controls.
- Segoe UI/Tahoma-style system typography with compact labels.
- Green, amber, and red status colors remain distinct on light backgrounds.

## Component behavior

- Chat remains the main workspace and keeps its current scroll and composer
  behavior.
- Sidebar, details, settings, command palette, approvals, code, terminal, and
  file views receive matching Aero chrome without changing behavior.
- Hover, focus-visible, active, disabled, selected, and error states stay
  visibly distinct.
- Mobile layouts reduce decorative shadows and preserve action labels and touch
  targets.
- Loading and API error states must show readable text and controls.

## Data and cache

The theme key is `win7css`. It is accepted by settings normalization, persisted
with existing settings, and included in the client theme order. The service
worker cache name is bumped because the shell CSS, JavaScript, metadata, and
picker markup change.

## Verification

- API settings tests accept and preserve `win7css`.
- Browser coverage selects and persists `win7css`.
- Browser coverage cycles through `win7css` from the top-right theme button.
- TypeScript checks, unit tests, production build, and browser checks pass.
- Desktop and mobile screenshots are checked for contrast, clipping, loading
  errors, and drawer visibility.
