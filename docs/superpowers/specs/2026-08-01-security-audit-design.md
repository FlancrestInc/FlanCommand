# FlanCommand Security Audit and Focused Hardening

## Goal

Find common, exploitable vulnerabilities in the API, browser boundary, remote
filesystem access, process execution, authentication, approval links, and
deployment configuration. Fix confirmed issues without changing intended app
behavior.

## Audit method

1. Check dependencies, repository secrets, Docker settings, and security headers.
2. Trace request input to filesystem, shell, WebSocket, credential, and state
   mutation boundaries.
3. Add a regression test before each code fix where practical.
4. Apply the smallest safe fix.
5. Run formatting, lint, typecheck, unit tests, build, and focused security
   tests. Report checks that cannot run in the current environment.

## Security targets

- Authentication and authorization: ensure protected routes cannot be bypassed
  and state-changing requests enforce origin and rate-limit policy.
- Injection: validate paths, hosts, shell arguments, URLs, JSON, and HTML sinks.
- Secrets: prevent tokens, credentials, cookies, and approval material from
  reaching logs, browser responses, or committed files.
- Resource safety: bound request bodies, output, frame sizes, subprocesses, and
  rate-limited mutations.
- Browser protections: use safe response headers and safe DOM rendering.
- Deployment: preserve non-root, read-only, loopback-bound, secret-free defaults.

## Out of scope

No broad redesign, permission-model rewrite, live deployment changes, or
behavior changes that require a product decision. Findings that need those
decisions will be reported separately.
