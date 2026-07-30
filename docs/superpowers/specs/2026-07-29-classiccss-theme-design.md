# Classic.css Mac OS 8 Theme Design

## Goal

Add a new local `Classic Mac (classic.css)` theme to FlanCommand. Keep all
existing themes and app behavior. The visual target is the Mac OS 8 Platinum
interface shown in the [classic.css project](https://github.com/npjg/classic.css)
and the [Mac OS 8 reference screenshots](https://winworldpc.com/screenshot/66230ac2-a724-6611-c3a4-e284a2c3a570).

## Scope

- Add `classiccss` to API settings validation.
- Add `Classic Mac (classic.css)` to the command center theme picker.
- Add `classiccss` to the top-right theme cycle.
- Add a local CSS theme layer. Do not load a runtime CDN stylesheet.
- Update static browser metadata and the service-worker cache version.
- Preserve System 6, BOOTSTRA.386, Windows 98, Windows XP, Windows 7, and
  existing themes.

## Visual system

- Use a pale blue-gray patterned desktop.
- Use a thin white menu bar with compact black Mac menu text.
- Use gray Platinum window interiors with crisp white and dark bevel edges.
- Use gray title bars that match the window interior.
- Add repeated light-gray, mid-gray, dark-gray, and rebound-gray horizontal
  bands to title bars for the shaded ersatz-3D texture.
- Center window titles. Keep reserved `Close` and `Zoom` side slots visually
  labeled but inactive.
- Use compact Chicago/Geneva/Charcoal-style system typography.
- Use square, compact, black-and-white controls with inset/outset shading.
- Keep content areas white for reliable text contrast.

## Component behavior

- Chat remains the main workspace and keeps its current scroll and composer
  behavior.
- Sidebar, details, settings, command palette, approvals, code, terminal, and
  file views receive matching Platinum chrome without behavior changes.
- Hover, focus-visible, active, disabled, selected, and error states remain
  visibly distinct.
- Mobile layouts keep title texture, side slots, labels, and usable controls
  while reducing spacing.
- Loading and API error states must remain readable.

## Data and cache

The theme key is `classiccss`. It is accepted by settings normalization,
persisted with existing settings, and included in the client theme order. The
service-worker cache name is bumped because the shell CSS, JavaScript,
metadata, and picker markup change.

## Verification

- API settings tests accept and preserve `classiccss`.
- Browser coverage selects and persists `classiccss`.
- Browser coverage cycles through `classiccss` from the top-right theme button.
- TypeScript checks, unit tests, production build, and browser checks pass.
- Desktop and mobile screenshots are checked for title texture, contrast,
  clipping, drawer states, and loading errors.
