# Slash Command Composer Design

## Goal

Make slash commands easier to discover and use from the chat composer. Add a
button beside the file attachment button, support token-aware insertion, and
make Tab complete commands without moving focus out of the textarea.

## Scope

- Add a `Commands` button beside `Attach files` in the composer tools.
- Reuse the existing command menu and command data loaded for the active
  conversation.
- Keep typed `/` filtering and add button-opened list mode.
- Replace only the active slash token when selecting or completing a command.
- Keep the rest of the message unchanged and add one trailing space.
- Keep Enter-to-send and Shift+Enter newline behavior unchanged.

## Command picker behavior

- Clicking the button opens the command menu with all available commands.
- Typing `/` opens the same menu filtered by the active slash token.
- Selecting a command replaces only that token and keeps surrounding text.
- If no commands are available, the menu shows a clear empty state.
- Escape closes the menu without changing the textarea value.

## Keyboard behavior

- Tab is handled inside the composer textarea and never moves focus away.
- When the active slash token has matches, Tab selects the next matching
  command. A single or exact match completes immediately and adds a space.
- When there are no slash matches, Tab inserts a literal tab character.
- Enter still submits. Shift+Enter still inserts a newline.

## Data and boundaries

The existing `state.commands` list remains the source of truth. The command
menu gets a small shared token parser and insertion helper. Button mode passes
an empty query; typed mode passes the active slash token query. No API changes
are needed.

## Verification

- Browser coverage opens the picker from the new button.
- Browser coverage selects a command inside surrounding text.
- Browser coverage verifies Tab completion, literal Tab insertion, and focus
  retention.
- Existing Enter and Shift+Enter browser coverage remains passing.
- The picker remains visible in both the current Classic Mac theme and a normal
  theme.
