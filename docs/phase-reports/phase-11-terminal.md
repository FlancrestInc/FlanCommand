# Phase 11: Embedded terminal

Status: local and declared-host SSH terminal slice complete.

## Shipped

- Isolated local shell sessions.
- Explicit project working directory.
- SSE output stream that survives browser stream disconnects.
- Input, close, and session audit routes.
- Environment filtering for common secret variables.
- Linux sessions use a real PTY through the system `script` utility, with a pipe fallback on other hosts.
- Browser terminal panel with command input and output.
- Declared project hosts appear in the browser host selector.
- Remote sessions use the server-side SSH adapter with a PTY and explicit
  remote working-directory boundary checks.
- Terminal status always shows the active host and working directory.
- Terminal dimensions are tracked and updated through a bounded resize route.
- Stream reconnects receive a bounded in-memory snapshot before new output, so
  reconnects do not duplicate visible terminal history.
- Remote launch failures show a safe SSH status message with host-key and
  authentication recovery hints.
- Copy output and paste into the command field are available from the browser
  terminal panel.
- Hiding the terminal panel detaches the view without closing the session;
  closing the session remains an explicit action.

## Evidence

- Terminal unit tests cover isolated sessions, streamed output, TTY allocation,
  resize validation, closed-session input rejection, and remote launch errors.
- API tests cover local session creation, input, undeclared-host rejection,
  declared SSH host creation, resize, and close.
- Browser tests cover opening a terminal, sending input, and receiving output.
- Browser tests cover clipboard round-tripping in Chromium and detach/restore
  behavior in Chromium and Firefox.
- Full repository checks pass after this slice: 455 tests, both typechecks,
  lint, formatting, and build.
- Full browser coverage passes: 22 Chromium tests and 22 Firefox tests.

## Boundaries

Remote sessions require the Barnabas host to have a usable `ssh` client and
configured authentication, such as an SSH agent or deployment key. Terminal
replay is bounded to the current process lifetime; terminal output is kept in
memory and is not persisted by default. Richer PTY controls remain pending.
