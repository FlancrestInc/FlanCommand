# Scrollable Slash Command Picker

## Goal

Let users browse the complete slash-command catalog from the composer button without making the composer grow beyond the available screen space.

## Behavior

- Clicking the slash-command button opens every command in the active session catalog.
- Typing a slash token filters the complete catalog by command name.
- The six-command display cap is removed.
- The command list has a bounded height and scrolls vertically when needed.
- Selecting a command still replaces only the active slash token and preserves surrounding text.
- Tab completion keeps its current behavior and uses the full filtered catalog.

## Data flow

`loadCommands()` continues to populate `state.commands`. `renderCommandMenu()` renders all matching entries. CSS constrains the menu and provides vertical scrolling. No API changes are needed.

## Error handling

An empty catalog continues to show the existing empty-state message. A catalog larger than the viewport remains usable through the menu scrollbar.

## Testing

- Add enough mock commands to exercise a catalog larger than six entries.
- Verify the picker renders the full catalog and exposes a scrollable menu.
- Verify command insertion, filtering, and Tab completion still work.
- Run type checks, unit tests, build, and browser coverage.
