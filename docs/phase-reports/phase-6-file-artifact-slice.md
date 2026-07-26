# Phase 6 file and artifact slice

Status: Functional local slice.

## Delivered

- Bounded JSON upload API with project and conversation association.
- Local storage adapter outside the web root.
- Safe filenames, SHA-256 duplicate reuse, restrictive file permissions, and
  size/type limits.
- Text and image previews; unsafe HTML/SVG/executable content is rejected.
- Safe attachment downloads with `Content-Disposition`.
- File listing, search filters, deletion, retention cleanup, and audit records.
- Expired uploads are cleaned on API initialization and recorded as audit events.
- Artifact registration, listing, preview, and download routes.
- Browser file picker, multi-file upload, drag-and-drop, upload progress, file
  library, searchable file list, safe delete, in-page image/text preview, and
  artifact links.
- Explicit file attachment chips in the composer transfer selected text, PDF,
  and image files to Hermes through its native `file.attach` and
  `image.attach_bytes` RPCs.
- Hermes `artifact.created` events with local paths are imported into the file
  store when the path is inside the active project's declared roots.

## Evidence

- `apps/api/src/file-store.test.ts`: storage, duplicate, type/size, and expiry
  tests pass.
- `apps/api/src/app.test.ts`: upload, preview, artifact registration, and unsafe
  type rejection pass.
- Full workspace check passes with 439 tests.
- Chromium coverage proves upload, explicit attachment, and streamed chat use.
- Chromium and Firefox coverage prove a registered artifact appears in the live
  browser artifact panel and opens through the safe preview route.
- Runtime smoke check: upload, search, text preview, and delete all passed
  through the API used by the browser.
- Manual upload of `../check.md` returned safe name `check.md`; text preview
  returned the original content; HTML upload returned HTTP 415.

## Known limits

- File and audit metadata are persisted through the local JSON metadata store;
  PostgreSQL remains a later deployment choice.
- Virus scanning is not configured in this local slice.
- Remote URLs and artifact paths outside declared project roots are rejected;
  only local, project-bound artifact files are imported automatically.
- Attachment transfer uses the installed Hermes gateway contract. Older
  gateways without the native attachment RPCs fail clearly instead of
  pretending the file was sent.
