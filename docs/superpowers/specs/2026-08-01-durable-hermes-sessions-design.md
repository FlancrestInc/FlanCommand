# Durable Hermes Sessions Design

## Goal

Keep Hermes work running when a browser reloads, closes, changes computer, or
the API must reconnect to Hermes. Let the browser reconnect as a viewer and
allow TUI-style input such as `/steer` during an active run.

## Current problem

The API starts a job from `POST /api/sessions/:id/messages`, but the same HTTP
request is also the only live event stream. The server usually keeps the job
running after the browser disconnects, but a new browser has no independent
live stream. The browser also disables the composer while `state.running` is
true, so it cannot send steering input.

## Design

### Background run ownership

The API and `JobQueue` own the run. The message POST creates and persists the
job, starts it in the background, and returns the created job and user message.
The run does not depend on a `ServerResponse` and never treats a closed browser
response as a cancel request.

All run events update session state, the durable event log, and a per-session
event hub. The event hub broadcasts to every connected browser and keeps the
last bounded set of events for reconnect replay.

### Reconnectable session stream

Add `GET /api/sessions/:id/events?after=N` as an SSE endpoint. It sends:

1. the current session snapshot;
2. events after the caller's replay cursor;
3. all future events for the session.

The browser opens this stream whenever it opens a session. Reloads and other
computers therefore receive the current state and future Hermes events without
starting or interrupting another run.

### Concurrent input

The composer stays enabled while Hermes works. FlanCommand sends input to the
same Hermes session immediately. Slash commands, including `/steer`, run as
independent control requests and publish their events through the same session
hub. Normal prompts are also submitted without a client-side lock; if Hermes
rejects one because of its own concurrency rules, FlanCommand reports that
error while leaving the existing run untouched.

### API restart recovery

On startup, persisted active jobs are rehydrated. The API reconnects to the
Hermes session and resumes observation. If Hermes is still running, the API
polls its durable history and publishes only text not already saved. If Hermes
is terminal, the API saves the final session state and terminal event. No
prompt is submitted again.

### Error handling

- A browser stream closing removes only that subscriber.
- A recoverable Hermes transport error triggers reconnect and history recovery.
- A non-recoverable run error marks only that job failed and publishes the
  failure to all current and future viewers.
- Explicit stop and cancel actions remain the only user actions that stop work.

## Testing

Add API tests for background completion after the POST client disconnects,
event replay and live delivery to a second client, steering while a run is
active, and recovery after API state is reloaded. Add browser tests for opening
the event stream, reconnecting after a page reload, and keeping the composer
usable during an active run.
