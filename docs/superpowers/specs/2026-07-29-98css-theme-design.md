# FlanCommand 98.css Theme Design

## Goal

Add a new `Windows 98 (98.css)` theme based on the visual language of
[98.css](https://github.com/jdan/98.css), while keeping the existing System 6
and BOOTSTRA.386 themes unchanged.

98.css is a CSS-only design system for faithful old-UI recreations. FlanCommand
will reproduce its visual rules locally instead of importing a runtime CDN
stylesheet or changing the app's semantic markup.

## Theme contract

Add `win98css` to the existing theme union, settings normalization, localStorage
validation, picker, names, and cycle order. The ordered theme list becomes:

- `xp`: System 6
- `win98`: System 6 Compact
- `cga`: BOOTSTRA.386 CGA
- `amber`: BOOTSTRA.386 Amber
- `green`: BOOTSTRA.386 Green
- `win98css`: Windows 98 (98.css)

Unknown theme values still fall back to the default `xp` theme. Existing values
remain valid and keep their current appearance.

## Visual direction

Use a local 98.css-style layer keyed by `html[data-theme="win98css"]`:

- gray desktop and window surfaces
- navy title bars with white title text
- beveled outset buttons and inset fields
- square windows and panels
- MS Sans Serif / Tahoma-style font stack
- classic checkboxes, selects, menus, disclosure headings, and status badges
- clear hover, pressed, focus, disabled, loading, warning, and error states
- readable dark text on light panes and white text on navy title bars

The theme must cover the top bar, side drawers, chat, composer, settings,
notifications, approvals, files, activity, markdown, code, terminal, empty
states, and toasts. Long paths, code, tables, and messages must remain
scrollable. Mobile drawers and touch-safe controls keep their current behavior.

## Verification

- Add settings unit coverage for `win98css` and invalid-value fallback.
- Update navigation E2E coverage to select, persist, reload, and cycle into the
  new theme.
- Inspect desktop and phone screenshots for title-bar contrast, controls,
  dialogs, drawers, empty/error states, and overflow.
- Bump the service-worker cache because the shell CSS and picker changed.
- Run build, unit tests, typecheck, formatting, and browser checks.

