# Phase 11: Workspace browser

Status: workspace browser slice complete.

## Shipped

- Workspace listing for declared project paths.
- Text-file preview for bounded files.
- Directory navigation in the web UI.
- Name and text search across declared workspace paths.
- Symlink and path-traversal protection.
- Entry count, search result, recursion-depth, and file-size bounds.
- Safe error states for missing, binary, oversized, and out-of-bound files.
- Workspace entries can insert their exact declared path into the chat composer.

## Evidence

- Unit tests cover listing, text reads, search, traversal rejection, and symlink escape rejection.
- API tests cover declared-project browsing, workspace search, and an out-of-bound file request.
- Full repository checks pass: 455 tests, build, Chromium, and Firefox browser suites.
- Browser coverage passes 24 Chromium tests and 24 Firefox tests.

## Boundaries

This slice does not write files and does not provide an embedded terminal. File editing still needs the Phase 7 exact-diff approval workflow. Inserted paths are plain composer text; Hermes does not receive an invented path-reference protocol.
