# FlanCommand BOOTSTRA.386 Themes Design

## Goal

Add three colored DOS-inspired themes based on BOOTSTRA.386 while preserving
the existing System 6 themes, theme persistence, settings behavior, and the
top-right theme cycle button.

BOOTSTRA.386 describes itself as a vintage 1980s DOS-inspired Bootstrap theme.
FlanCommand will reproduce the visual direction locally instead of importing
Bootstrap or a runtime stylesheet.

## Themes

The theme list becomes:

- `xp`: existing System 6 styling
- `win98`: existing System 6 compact variation
- `cga`: navy, cyan, white, and black CGA palette
- `amber`: black/dark brown background with amber phosphor text
- `green`: black/dark green background with green phosphor text

The three DOS themes share a component system but have separate palette
variables. They use monospace typography, dense terminal-like spacing, square
controls, bright borders, and colored focus/status states. The existing System
6 visuals remain intact.

## Theme selection behavior

- The settings picker gets three new options with clear names.
- The top-right theme button cycles through the complete ordered list.
- Existing localStorage values remain valid.
- Invalid or missing values fall back to `xp`.
- The API settings normalization accepts all five theme values and rejects
  unknown values back to the default.
- Saving a theme updates the document data attribute, localStorage, button
  label, and server settings through the existing paths.

## Visual implementation

Use the current static shell and existing selectors. Add a shared DOS override
layer after the System 6 layer in `apps/web/public/styles.css`:

- `html[data-theme="cga"]`, `amber`, and `green` define palette variables.
- DOS themes set body, shell, top bar, windows, panes, buttons, fields,
  messages, composer, drawers, settings, notifications, approvals, files,
  markdown, code, terminal, empty, loading, and error states.
- Focus and disabled controls remain visible against each DOS background.
- Status dots, badges, meters, warnings, and errors use the theme's readable
  bright colors rather than defaulting to the old System 6 monochrome rules.
- Long content remains scrollable. No remote CSS or font request is added.
- The existing mobile drawer behavior and viewport breakpoints remain unchanged.

## Testing

- Add settings normalization coverage for `cga`, `amber`, and `green`.
- Update navigation E2E coverage to confirm the three options exist, each theme
  changes `html[data-theme]`, the value persists after reload, and the cycle
  button visits every theme.
- Inspect desktop and phone screenshots for all three DOS themes.
- Check focus, disabled, error, loading, code, markdown, drawer, settings, and
  composer states for contrast and overflow.
- Run the existing build, unit tests, formatting, and browser checks.

