# Hermes gated WebSocket authentication Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect FlanCommand to Hermes v0.19 gated WebSocket servers with server-side login and short-lived tickets.

**Architecture:** Extend the Hermes WebSocket transport with an optional ticket-auth session. It logs in over HTTP, keeps cookies in memory, requests one ticket per socket, and retains the existing token path when ticket credentials are not configured. Add runtime configuration for the new server-only credentials and update deployment docs.

**Tech Stack:** TypeScript, Node fetch, `ws`, Vitest, Zod environment validation.

---

### Task 1: Add failing transport-auth tests

**Files:**
- Modify: `packages/hermes-adapter/src/ws-transport.test.ts`
- Test: existing WebSocket transport test suite

- [ ] Add tests for password login request shape and cookie capture.
- [ ] Add tests for ticket request and `?ticket=` socket URL.
- [ ] Add a test proving each reconnect gets a new ticket.
- [ ] Add a test proving password, cookie, and ticket values do not appear in safe state or errors.
- [ ] Run `npx vitest run packages/hermes-adapter/src/ws-transport.test.ts` and confirm the new tests fail for missing behavior.

### Task 2: Implement the gated Hermes session

**Files:**
- Modify: `packages/hermes-adapter/src/ws-transport.ts`

- [ ] Add an injectable HTTP request function for deterministic tests.
- [ ] Add in-memory cookie storage from `Set-Cookie` response headers.
- [ ] Add login to `/auth/password-login` with provider `basic`.
- [ ] Add ticket request to `/api/auth/ws-ticket` using the cookie.
- [ ] Select ticket mode when username and password are both configured.
- [ ] Mint a fresh ticket before each socket connection and preserve token mode otherwise.
- [ ] Run the focused tests and make them pass.

### Task 3: Wire runtime configuration

**Files:**
- Modify: `apps/api/src/hermes-runtime-config.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/hermes-runtime-config.test.ts`
- Modify: `packages/config/src/env.ts`
- Modify: `packages/config/src/env.test.ts`

- [ ] Add optional dashboard username/password values without exposing them in returned health or metrics data.
- [ ] Pass the values into the adapter.
- [ ] Add tests for ticket-mode selection and blank credential handling.
- [ ] Run focused API and config tests.

### Task 4: Update deployment documentation

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/operations/deployment.md`

- [ ] Document the new server-only Hermes dashboard credentials.
- [ ] Clarify that `HERMES_ORIGIN` is the private Hermes handshake origin and `FLANC_PUBLIC_ORIGIN` is the public app origin.
- [ ] Document the required Hermes basic-auth username/password setup and token fallback.
- [ ] Add troubleshooting for ticket login and WebSocket handshake failures.

### Task 5: Verify and publish the implementation

- [ ] Run focused adapter, API, and config tests.
- [ ] Run `npm run check`.
- [ ] Run `git diff --check` and `docker compose config`.
- [ ] Review the diff for secret leakage.
- [ ] Commit the feature branch.
