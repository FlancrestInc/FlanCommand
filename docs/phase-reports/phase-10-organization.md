# Phase 10: Conversation organization

Status: organization and user-settings slice complete.

## Shipped

- Durable custom conversation titles.
- Pin and archive metadata.
- Durable folders and conversation-folder links.
- Server-side search across titles and stored message text.
- Folder filtering.
- Browser controls for rename, pin, archive, folder assignment, and folder creation.
- Hermes session content remains the source of truth; organization metadata stays in Command Center.
- Durable browser settings for default model, reasoning effort, response limit,
  file retention, notifications, theme, and activity density.
- Settings apply the default model to new conversations and file retention to
  new uploads.
- Browser diagnostics panel for recent audit events.
- Hermes memory status drawer using the native `/memory` gateway command.

## Evidence

- API tests cover folder creation, organization updates, and search by custom title.
- Full repository checks pass after this slice.
- `apps/api/src/settings.test.ts` covers conservative defaults and bounded
  settings normalization.
- `apps/api/src/app.test.ts` covers settings read/write and audit records.
- The same API suite verifies settings and conversation policy survive an API
  restart.

## Boundaries

Conversation rename is Command Center metadata. It does not claim to rename a native Hermes session when Hermes does not advertise rename support. The TUI Gateway exposes `/memory` status and pending-write review, but no direct memory-list or edit RPC. The browser therefore shows honest status only; memory browsing and editing remain pending until Hermes exposes those operations through the chosen backend boundary.
