# Hermes Command Center
## Implementation Roadmap for Codex

**Status:** Planning  
**Primary owner:** Ryan  
**Target hosts:** Barnabas (web application), Gospel (Hermes Agent)  
**Primary access:** Desktop browser, with a responsive Safari web-app experience on iPhone  
**Initial integration target:** Hermes TUI Gateway JSON-RPC/WebSocket through `hermes serve`

---

## 1. Product Vision

Build a personal, self-hosted web interface that becomes the primary way to interact with Hermes Agent while preserving Telegram and the terminal UI as fallbacks.

The application should combine:

- The conversational comfort of ChatGPT
- The visibility and control of a terminal interface
- The clarity and restraint of Stripe's interface
- A playful command-center identity
- Strong permission controls and auditability
- Excellent file, Markdown, code, and artifact handling

The finished experience should feel joyful and polished without placing visual decoration ahead of usability.

### Success statement

The product succeeds when it is more functional than Telegram for everyday Hermes use, provides substantially better insight into what Hermes is doing, and remains pleasant enough that opening it feels like the preferred way to begin a task.

---

## 2. Guiding Principles

1. **Chat comes first.**  
   Every architectural and visual decision should preserve a fast, comfortable, reliable chat experience.

2. **Hide machinery until it matters.**  
   Active work should be visible. Completed tool activity should collapse into an expandable summary.

3. **Structured integration over terminal scraping.**  
   Use Hermes' native JSON-RPC/WebSocket interface wherever possible. Retain a PTY adapter only as a fallback.

4. **Hermes remains the agent authority.**  
   Avoid forking or modifying Hermes unless a confirmed integration gap makes it necessary.

5. **The browser never handles reusable infrastructure secrets.**  
   Resolve credentials server-side and redact sensitive output before storage or display.

6. **Permission rules must be understandable.**  
   A user should be able to see why an action was allowed, blocked, or paused.

7. **Build seams before features.**  
   Encapsulate Hermes, notifications, credentials, storage, and execution behind adapters so they can evolve independently.

8. **Desktop first, mobile capable.**  
   Optimize the full command-center experience for desktop while making chat, approvals, uploads, and notifications work well on a phone.

9. **Errors must be actionable.**  
   Never show a vague failure when the system can identify the failed component, likely cause, relevant logs, or recovery action.

10. **Ship in vertical slices.**  
    Each phase should leave behind a demonstrable, testable improvement rather than a pile of disconnected infrastructure.

---

## 3. Confirmed Product Decisions

### Interfaces

- The web application will be the primary Hermes interface.
- Telegram and the Hermes terminal UI remain supported fallbacks.
- The design is for one user and one Hermes instance initially.
- Multiple Hermes instances may be supported later through the adapter design.

### Chat

- Multiple conversations appear in a sidebar.
- Conversations can be searched, renamed, pinned, and organized into folders or projects.
- Stop and retry are required.
- Message editing, regeneration, and branching are later enhancements.
- Streaming is preferred.
- If streaming is temporarily unavailable, the UI must still show an accurate working state.
- Markdown, code, tables, images, files, diagrams, and logs must render cleanly.
- Code blocks need syntax highlighting, copy, line numbers, and download support.
- Slash commands and a command palette are required.
- Generated or inspected content can open in a split artifact panel.
- An optional embedded terminal is planned after the core chat experience.

### Agent activity

During a run, show:

- Current stage
- Elapsed time
- Model
- Reasoning effort, when supported
- Context usage
- Token usage, when available
- Tool calls
- Commands
- Tool inputs and outputs
- Duration
- Success or failure
- Retry count
- Memories used, when identifiable
- Background-job state

After completion, collapse this into a compact expandable activity chip or timeline.

### Developer Mode

Developer Mode is disabled by default.

When enabled, it may show:

- Full structured event stream
- Tool request and response payloads
- Command output
- Timing and retry metadata
- Hermes protocol messages
- Adapter diagnostics

Secrets and credential patterns remain redacted even in Developer Mode.

### Settings

Global settings include:

- Default model
- Default reasoning effort
- Context configuration
- Response limits
- System prompt
- Enabled tools
- Memory settings
- Notification settings
- File-retention policy
- Theme and layout preferences

Per-conversation overrides include:

- Model
- Reasoning effort
- Permission policy

Advanced settings remain tucked away.

### Projects and files

A project can contain:

- Name and description
- Persistent instructions
- Declared workspace paths
- Declared remote hosts
- Default permission policy
- Credential references
- Uploaded files
- Generated artifacts
- Related conversations
- Notification settings

Required file behavior:

- Drag-and-drop upload
- Image and text-file support first
- File previews
- Uploaded-file library
- Configurable retention policy
- Generated artifact panel
- Downloadable artifacts
- Workspace browser
- File diffs before save
- Approval before edits where policy requires it

### Permissions

Permission layers resolve in this order:

1. Conversation override
2. Project policy
3. Global default
4. Hermes' own safety behavior

Initial modes:

- **Ask every time**
- **Allow safe actions**
- **Full autonomy**

Conversation-level policy overrides project-level policy.

Non-destructive commands are considered safe when confidently classified. Ambiguous commands fall back to approval.

Hermes may request expansion beyond declared project boundaries. Expansion requires approval.

### Credentials

- Bitwarden is the intended credential catalog.
- Prefer Bitwarden Secrets Manager for service-owned secrets.
- Personal-vault automation may be supported later only with careful session handling.
- Hermes should prompt the user to add a missing credential to Bitwarden.
- Reusable credentials must not enter prompts, chat history, browser JavaScript, or ordinary logs.
- All output is passed through redaction before persistence or display.
- Audit entries identify credential references, never secret values.

### Background work and notifications

- Tasks continue after the browser closes.
- Multiple tasks may run concurrently.
- Jobs can be paused, canceled, retried, and duplicated.
- Approval-required jobs pause rather than fail.
- Approval notifications use browser notifications, ntfy, and Apprise.
- Notification links open a short-lived approval review page.
- The actual approval is submitted through an authenticated state-changing request, not a GET request.

### Hosting

- Barnabas hosts the web frontend and application backend.
- Gospel continues running Hermes Agent.
- Hermes performs SSH directly from Gospel.
- Cloudflare Zero Trust provides remote access.
- The web application should be installable through Safari's Add to Home Screen behavior.
- The first version may use a simplified theme.
- The reusable Windows 3.1-inspired design system can be integrated after the core application is proven.

---

## 4. Recommended Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│ Browser / Safari Web App                                   │
│                                                             │
│ Chat • Projects • Files • Jobs • Approvals • Settings      │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS / WebSocket
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Hermes Command Center on Barnabas                           │
│                                                             │
│ Frontend                                                    │
│ Backend-for-Frontend                                        │
│ Hermes Adapter                                              │
│ Permission Policy Engine                                    │
│ Approval Service                                            │
│ Job Coordinator                                             │
│ Notification Service                                        │
│ Credential Broker                                           │
│ Redaction Pipeline                                          │
│ File / Artifact Service                                     │
│ Audit Service                                               │
│ PostgreSQL                                                  │
└──────────────────────────┬──────────────────────────────────┘
                           │ Private authenticated connection
                           │ JSON-RPC / WebSocket
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Gospel                                                      │
│                                                             │
│ hermes serve                                                │
│ Hermes sessions, tools, models, memory, slash commands      │
│ Hermes Telegram gateway                                     │
│ SSH execution from Gospel                                   │
└─────────────────────────────────────────────────────────────┘
```

### Why this split

Barnabas owns the product-specific experience:

- UI metadata
- Projects
- Permissions
- Approvals
- Files
- Jobs
- Audit records
- Notifications
- Credential references
- Redaction

Gospel owns Hermes-native behavior:

- Agent sessions
- Model interaction
- Tool execution
- Memory
- Slash commands
- Telegram gateway
- SSH execution

The browser should communicate only with the Barnabas application. Do not expose the Hermes backend directly to browser JavaScript.

---

## 5. Integration Strategy

Hermes documents three programmatic integration surfaces:

1. **TUI Gateway JSON-RPC**
2. **ACP**
3. **OpenAI-compatible HTTP API**

For a custom web UI requiring sessions, approvals, slash commands, clarifications, and broad Hermes feature coverage, the TUI Gateway JSON-RPC interface is the preferred starting point.

Launch the headless backend on Gospel with:

```bash
hermes serve
```

### Required adapter boundary

Create a stable internal interface that prevents Hermes protocol details from leaking throughout the application.

```ts
export interface HermesAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getCapabilities(): Promise<HermesCapabilities>;

  listSessions(input?: ListSessionsInput): Promise<HermesSession[]>;
  getSession(sessionId: string): Promise<HermesSession>;
  createSession(input: CreateSessionInput): Promise<HermesSession>;
  renameSession(sessionId: string, title: string): Promise<void>;

  sendMessage(
    sessionId: string,
    input: SendMessageInput,
  ): AsyncIterable<AgentEvent>;

  stopRun(runId: string): Promise<void>;
  retryTurn(sessionId: string, turnId: string): Promise<void>;

  dispatchCommand(
    sessionId: string,
    command: string,
  ): AsyncIterable<AgentEvent>;

  listCommands(sessionId?: string): Promise<SlashCommand[]>;
  listModels(): Promise<ModelInfo[]>;
  setSessionModel(sessionId: string, modelId: string): Promise<void>;

  approveAction(actionId: string): Promise<void>;
  denyAction(actionId: string, reason?: string): Promise<void>;
}
```

### Normalized event model

Translate all Hermes events into an internal event vocabulary.

```ts
export type AgentEvent =
  | { type: "run.started"; runId: string; sessionId: string; at: string }
  | { type: "run.status"; runId: string; stage: string; detail?: string }
  | { type: "message.delta"; runId: string; text: string }
  | { type: "message.completed"; runId: string; messageId: string }
  | { type: "tool.started"; runId: string; toolCall: ToolCall }
  | { type: "tool.output"; runId: string; toolCallId: string; chunk: string }
  | { type: "tool.completed"; runId: string; toolCallId: string; result: unknown }
  | { type: "tool.failed"; runId: string; toolCallId: string; error: SafeError }
  | { type: "approval.requested"; runId: string; approval: ApprovalRequest }
  | { type: "memory.used"; runId: string; memory: MemoryReference }
  | { type: "artifact.created"; runId: string; artifact: ArtifactReference }
  | { type: "context.updated"; sessionId: string; usage: ContextUsage }
  | { type: "run.completed"; runId: string; summary?: RunSummary }
  | { type: "run.failed"; runId: string; error: SafeError }
  | { type: "run.stopped"; runId: string };
```

### Fallback adapters

Plan for, but do not initially build unless needed:

- `HermesPtyAdapter`
- `HermesOpenAiAdapter`
- Future multi-agent adapters

---

## 6. Source-of-Truth Rules

### Hermes owns

- Native conversation/session content
- Hermes model state
- Hermes memory
- Hermes tool execution
- Native slash-command behavior
- Agent run state when exposed by the protocol

### Command Center owns

- Custom conversation titles when Hermes does not support them
- Pins and folders
- Project relationships
- Permission policies
- Approval records
- File metadata and retention
- Artifact metadata
- Notification preferences
- UI preferences
- Audit records
- Search indexes or caches
- Credential references

### Conversation synchronization

The desired behavior is that Telegram, the terminal UI, and the web UI can resume the same Hermes session.

This must be proven during the discovery phase. Do not assume that every messaging session is immediately enumerable or resumable through the TUI gateway.

If Telegram session mapping is not directly exposed:

1. Inspect Hermes' session metadata and gateway session storage.
2. Determine whether a stable Hermes session ID can be associated with a Telegram chat.
3. Add a read-only mapping layer in the Command Center.
4. Avoid modifying Hermes unless no stable supported mapping is available.
5. Document any unavoidable limitation clearly.

Do not silently create parallel threads and present them as synchronized.

---

## 7. Security Model

### Trust boundaries

```text
Untrusted or partially trusted:
- Browser input
- Uploaded files
- Hermes-generated text
- Tool output
- Notification links
- File names and metadata

Trusted services:
- Command Center backend
- Policy engine
- Credential broker
- Audit service

Sensitive systems:
- Bitwarden
- SSH keys
- Gospel
- Remote project hosts
- Cloudflare service credentials
```

### Mandatory controls

- Authenticate all application routes.
- Place the application behind Cloudflare Access.
- Use CSRF protection for cookie-authenticated state-changing requests.
- Use secure, HTTP-only, same-site cookies.
- Validate WebSocket origin and authentication.
- Apply rate limits to login, approval, upload, and execution routes.
- Encrypt sensitive database fields when application-level secrets are unavoidable.
- Never store plaintext reusable credentials in PostgreSQL.
- Restrict uploaded file size, type, and path handling.
- Store files outside the web root.
- Prevent path traversal.
- Sanitize rendered Markdown and HTML.
- Use a restrictive Content Security Policy.
- Redact known secrets before logging, storing, indexing, or streaming.
- Keep immutable or append-only audit records where practical.
- Require explicit confirmation before project-boundary expansion.
- Do not execute approval actions through unauthenticated links.
- Expire approval links and make them single-use.
- Ensure an approval is bound to an exact action hash.

### Approval action hash

An approval should identify the exact proposed operation:

```json
{
  "actionType": "shell.execute",
  "host": "barnabas",
  "workingDirectory": "/home/ryan/projects/disc-steward",
  "command": "docker compose up -d",
  "environmentKeys": ["COMPOSE_PROJECT_NAME"],
  "credentialRefs": [],
  "contentHash": "sha256:..."
}
```

If the action changes after approval, request a new approval.

---

## 8. Permission Policy Design

### Policy inheritance

```text
Conversation override
        ↓
Project default
        ↓
Global default
        ↓
Conservative deny-or-ask fallback
```

### Suggested action categories

- `filesystem.read`
- `filesystem.write`
- `filesystem.delete`
- `filesystem.move`
- `shell.inspect`
- `shell.execute`
- `package.install`
- `service.control`
- `container.inspect`
- `container.modify`
- `network.read`
- `network.write`
- `message.send`
- `remote.connect`
- `project.expand_boundary`
- `credential.use`
- `credential.reveal`
- `artifact.publish`

### Initial defaults

| Action | Default |
|---|---|
| Read declared project files | Allow |
| List directories | Allow |
| Inspect processes, logs, containers, or system state | Allow |
| Run confidently non-destructive commands | Allow |
| Connect to a declared host | Allow connection |
| Execute a command on a declared host | Evaluate command separately |
| Write or edit files | Ask |
| Delete, overwrite, or move files | Ask |
| Install or remove packages | Ask |
| Start, stop, restart, or reconfigure services | Ask |
| Modify containers | Ask |
| Send messages or trigger external side effects | Ask |
| Access undeclared host or path | Ask to expand boundary |
| Use an approved credential reference | Apply project policy |
| Reveal a credential | Deny |

### Safe-command classification

Treat command classification as a layered decision:

1. Hermes-provided tool metadata
2. Structured command and arguments
3. Known-safe command rules
4. Known-dangerous command rules
5. Working directory and project boundary
6. Host boundary
7. User-selected policy mode
8. Conservative fallback to approval

Do not rely only on matching command names such as `rm`. Shells, interpreters, scripts, aliases, pipes, redirection, and command substitution can hide destructive behavior.

---

## 9. Credential Broker

### Preferred approach

Use Bitwarden Secrets Manager for application and tool credentials that must be available to services without exposing a personal vault session.

### Credential reference shape

```yaml
id: gospel-ssh
provider: bitwarden-secrets-manager
secret_id: 00000000-0000-0000-0000-000000000000
purpose: SSH access from Gospel
allowed_projects:
  - disc-steward
allowed_hosts:
  - barnabas.lan
injection:
  type: temporary_file
  mode: "0600"
```

### Credential workflow

1. Hermes requests a capability requiring a credential.
2. Command Center checks whether the project has an approved credential reference.
3. If missing, the run enters `waiting_for_credential`.
4. The UI prompts Ryan to create or associate a Bitwarden secret.
5. The backend validates access to the secret reference without displaying it.
6. The run resumes.
7. The broker resolves the secret only at execution time.
8. The secret is injected through the narrowest possible channel.
9. Temporary material is destroyed immediately after use.
10. Logs and output pass through redaction.

### Redaction pipeline

Redact:

- Exact active secret values
- Known API key formats
- Private-key blocks
- Authorization headers
- Cookies and session tokens
- Password arguments and environment values
- Bitwarden access tokens
- Cloudflare service tokens
- SSH private-key material

Keep redaction centralized. Do not depend on each UI component to hide secrets correctly.

---

## 10. Data Model

Use PostgreSQL unless a discovery spike proves that SQLite is sufficient for all concurrency, background jobs, and deployment needs.

### Core tables

#### `users`

A minimal table is still useful even for a single-user product.

- `id`
- `external_identity`
- `display_name`
- `created_at`
- `updated_at`

#### `projects`

- `id`
- `name`
- `slug`
- `description`
- `instructions`
- `default_permission_mode`
- `created_at`
- `updated_at`
- `archived_at`

#### `project_boundaries`

- `id`
- `project_id`
- `boundary_type`
- `host`
- `path`
- `access_level`
- `approved_at`
- `revoked_at`

#### `conversation_metadata`

- `id`
- `hermes_session_id`
- `custom_title`
- `project_id`
- `folder_id`
- `is_pinned`
- `permission_mode_override`
- `model_override`
- `reasoning_effort_override`
- `last_seen_at`
- `created_at`
- `updated_at`

#### `folders`

- `id`
- `name`
- `sort_order`
- `created_at`
- `updated_at`

#### `runs`

- `id`
- `hermes_run_id`
- `hermes_session_id`
- `conversation_metadata_id`
- `status`
- `stage`
- `started_at`
- `completed_at`
- `stopped_at`
- `failure_code`
- `safe_error_message`

#### `run_events`

- `id`
- `run_id`
- `sequence`
- `event_type`
- `safe_payload_json`
- `created_at`

#### `approvals`

- `id`
- `run_id`
- `action_type`
- `action_summary`
- `safe_action_payload_json`
- `action_hash`
- `status`
- `expires_at`
- `decided_at`
- `decision_source`
- `decision_reason`

#### `permission_policies`

- `id`
- `scope_type`
- `scope_id`
- `action_category`
- `decision`
- `constraints_json`
- `created_at`
- `updated_at`

#### `credential_references`

- `id`
- `project_id`
- `name`
- `provider`
- `external_secret_id`
- `purpose`
- `allowed_hosts_json`
- `injection_method`
- `created_at`
- `updated_at`
- `last_validated_at`

#### `files`

- `id`
- `project_id`
- `conversation_metadata_id`
- `origin`
- `original_name`
- `storage_key`
- `mime_type`
- `size_bytes`
- `sha256`
- `retention_policy_id`
- `created_at`
- `expires_at`
- `deleted_at`

#### `artifacts`

- `id`
- `run_id`
- `file_id`
- `artifact_type`
- `title`
- `preview_metadata_json`
- `created_at`

#### `jobs`

- `id`
- `run_id`
- `job_type`
- `status`
- `progress_current`
- `progress_total`
- `progress_label`
- `started_at`
- `updated_at`
- `completed_at`

#### `notifications`

- `id`
- `event_type`
- `channel`
- `destination_reference`
- `safe_payload_json`
- `status`
- `sent_at`
- `failure_message`

#### `audit_events`

- `id`
- `actor_type`
- `actor_id`
- `event_type`
- `resource_type`
- `resource_id`
- `safe_details_json`
- `ip_address`
- `user_agent`
- `created_at`

#### `settings`

- `id`
- `scope_type`
- `scope_id`
- `setting_key`
- `setting_value_json`
- `updated_at`

---

## 11. User-Interface Structure

### Desktop layout

```text
┌──────────────────────────────────────────────────────────────────┐
│ Top Bar: Project • Model • Context • Run Status • Commands      │
├───────────────┬───────────────────────────────┬──────────────────┤
│ Conversations │ Chat                          │ Artifact / Detail│
│ Projects      │                               │ Panel            │
│ Search        │ Messages                      │                  │
│ Files         │ Tool activity                 │ Preview          │
│ Jobs          │ Composer                      │ Diff             │
│ Approvals     │                               │ Logs             │
└───────────────┴───────────────────────────────┴──────────────────┘
```

The right panel opens only when useful and is resizable and dismissible.

### Mobile layout

- Conversation list becomes a drawer.
- Artifact panel becomes a full-screen route or sheet.
- Approval request uses a readable modal.
- Composer remains reachable above the keyboard.
- File upload supports picker, camera roll, and share-sheet behavior where the browser permits it.
- Long tool output remains collapsed by default.
- Context, model, and status become compact chips.

### Primary screens

1. Chat
2. Conversation search and organization
3. Project workspace
4. File library
5. Artifact viewer
6. Jobs dashboard
7. Approval inbox
8. Memory viewer/editor
9. Audit log
10. Settings
11. Developer diagnostics

### Chat composer

Required:

- Multiline input
- Submit shortcut
- Stop button
- File attachment
- Drag-and-drop
- Slash-command autocomplete
- Command palette
- Model and reasoning override access
- Clear working state
- Retry failed send
- Draft preservation during reconnect

### Activity presentation

While active:

```text
● Inspecting project files · 18s
  ├─ Read package.json
  ├─ Ran git status
  └─ Waiting for approval: edit src/app.ts
```

After completion:

```text
[ Worked for 42s · 5 tool calls · 1 file changed ▸ ]
```

---

## 12. Technology Recommendation

Codex should verify current ecosystem versions before committing, but the initial recommendation is:

### Monorepo

- `pnpm` workspaces
- TypeScript throughout
- Shared schemas and event types

### Frontend

- React
- Vite or a suitable full-stack framework if server rendering materially helps
- TanStack Query
- A robust router
- CodeMirror or Monaco for diffs and editable text
- Shiki for code rendering
- `react-markdown` or an equivalent controlled Markdown pipeline
- DOMPurify or framework-equivalent sanitization
- Accessible primitives rather than a heavy visual component kit
- Service worker only after the normal web application is stable

### Backend

Either of these is acceptable:

- TypeScript backend using Fastify
- Python backend using FastAPI

Prefer TypeScript if sharing the normalized event model and validation schemas materially reduces integration mistakes.

### Shared validation

- Zod or equivalent schema validation
- Generated OpenAPI where practical
- Strict parsing of Hermes messages before normalization

### Database and jobs

- PostgreSQL
- A durable job queue backed by PostgreSQL or Redis
- Avoid introducing Redis until a demonstrated requirement justifies it
- Database migrations checked into source control

### File storage

Start with local filesystem storage on Barnabas behind a storage adapter.

Future options:

- S3-compatible object storage
- NAS-backed storage
- Per-project storage roots

### Deployment

- Docker Compose on Barnabas
- systemd-managed `hermes serve` on Gospel
- Health checks
- Structured logs
- Backups for PostgreSQL and file metadata
- Secrets injected through Bitwarden or host-level secret mechanisms

---

## 13. Repository Layout

```text
hermes-command-center/
├─ apps/
│  ├─ web/
│  └─ api/
├─ packages/
│  ├─ hermes-adapter/
│  ├─ event-schema/
│  ├─ permission-engine/
│  ├─ credential-broker/
│  ├─ redaction/
│  ├─ notification-adapters/
│  ├─ storage-adapter/
│  ├─ ui/
│  └─ config/
├─ infra/
│  ├─ docker/
│  ├─ systemd/
│  ├─ cloudflare/
│  └─ scripts/
├─ docs/
│  ├─ architecture/
│  ├─ decisions/
│  ├─ protocol/
│  ├─ security/
│  └─ operations/
├─ tests/
│  ├─ integration/
│  ├─ end-to-end/
│  └─ fixtures/
├─ compose.yaml
├─ pnpm-workspace.yaml
├─ README.md
└─ ROADMAP.md
```

---

# 14. Phased Implementation Plan

## Phase 0: Repository and documentation foundation

### Goal

Create a clean project skeleton and record decisions before building product features.

### Tasks

- Create the monorepo.
- Add formatting, linting, type checking, and tests.
- Add environment-variable validation.
- Establish branch and commit conventions.
- Add ADRs for:
  - Hermes integration protocol
  - Frontend framework
  - Backend framework
  - Database
  - File storage
  - Authentication boundary
  - Credential strategy
- Add local development Compose services.
- Add CI that runs formatting checks, linting, tests, and builds.
- Add a sanitized example configuration.
- Ensure secrets and local state are ignored by Git.

### Deliverable

A repository that can be cloned, configured, tested, and started without product functionality.

### Acceptance criteria

- `pnpm install` succeeds.
- A single documented command starts development services.
- CI passes on a clean checkout.
- No secret is committed.
- Architectural decisions are written down.

---

## Phase 1: Hermes integration probe

### Goal

Prove the actual capabilities and limits of the current Hermes protocol before building the product around assumptions.

### Tasks

On Gospel:

- Verify installed Hermes version.
- Verify `hermes serve` command and supported flags.
- Bind it to a private interface.
- Configure authentication if supported.
- Add a temporary systemd service for the probe.
- Confirm firewall and host connectivity from Barnabas.

Build a small command-line probe that can:

- Connect over WebSocket.
- Perform the required handshake.
- Discover or document supported methods.
- List Hermes sessions.
- Open one existing session.
- Create a new session.
- Send a message.
- Stream response text.
- Capture tool-start and tool-result events.
- Dispatch `/model`.
- List or discover slash commands.
- Stop a running response.
- Exercise an approval or clarification flow.
- Disconnect and reconnect.
- Resume or inspect an active run if supported.
- Identify context and token metadata.
- Inspect session metadata for Telegram origin or mapping.
- Test concurrent runs in separate sessions.
- Record raw sanitized protocol transcripts as fixtures.

### Research questions

The phase is incomplete until these are answered:

1. Can Telegram-created sessions be listed?
2. Can a Telegram-created session be resumed through the TUI gateway?
3. Does a message sent through the web-facing protocol appear in the same Telegram thread?
4. What identifiers remain stable across gateway restarts?
5. Are active runs resumable after client disconnect?
6. How are approvals represented?
7. How are tool calls represented?
8. Is reasoning effort configurable?
9. What context/token data is available?
10. Can model changes be made through structured RPC or only slash commands?
11. Are files and artifacts represented structurally?
12. What authentication and origin controls does `hermes serve` provide?
13. Are there known Cloudflare WebSocket concerns that affect the chosen topology?

### Deliverable

`docs/protocol/hermes-integration-report.md`

It must contain:

- Hermes version tested
- Launch command
- Connection sequence
- Supported methods
- Event examples
- Capability matrix
- Known gaps
- Telegram session findings
- Reconnection findings
- Security findings
- Recommended adapter behavior
- Sanitized fixtures

### Acceptance criteria

- A response streams into the probe.
- Tool activity is parsed structurally.
- Stop works or the limitation is documented.
- Session behavior is understood.
- Telegram sharing is proven or accurately declared unsupported.
- No production UI work begins until this report exists.

### Stop/go decision

**Go:** The TUI gateway supplies enough structure for the required chat and activity UI.

**Fallback:** Use the OpenAI-compatible API for chat while implementing missing controls through supported Hermes mechanisms.

**Last resort:** Add a PTY adapter for narrow unsupported features, not as the primary integration.

---

## Phase 2: Adapter and event pipeline

### Goal

Turn the probe into a production-quality Hermes adapter and normalized event stream.

### Tasks

- Implement `HermesAdapter`.
- Validate every inbound Hermes message.
- Normalize raw messages into `AgentEvent`.
- Add reconnect with bounded exponential backoff.
- Add heartbeat and stale-connection detection.
- Add message sequencing and deduplication.
- Add run and session correlation.
- Add safe protocol logging.
- Pass all text and payloads through redaction.
- Store sanitized event fixtures for regression tests.
- Add an adapter capability object so the UI can hide unsupported controls.
- Add contract tests against fixtures.
- Add opt-in integration tests against Gospel.

### Deliverable

A reusable package that exposes Hermes without requiring UI code to know the native protocol.

### Acceptance criteria

- Raw Hermes protocol types are isolated inside the adapter package.
- The same fixtures replay deterministically.
- Reconnection does not duplicate visible message content.
- Unknown messages are retained safely for diagnostics without crashing the application.
- Redaction occurs before persistence and application logging.

---

## Phase 3: Basic chat vertical slice

### Goal

Deliver the first usable end-to-end chat experience.

### Tasks

Backend:

- Add session list endpoint.
- Add session detail endpoint.
- Add create-session endpoint.
- Add send-message WebSocket or SSE route.
- Add stop-run endpoint.
- Add retry endpoint where supported.
- Add model list and model-change endpoint.
- Persist UI metadata only.
- Add connection and health status.

Frontend:

- Create desktop shell.
- Create conversation sidebar.
- Create conversation view.
- Add message composer.
- Stream response text.
- Show working state and elapsed time.
- Add Stop.
- Add Retry.
- Render Markdown.
- Render secure code blocks with syntax highlighting, copy, line numbers, and download.
- Add reconnect and draft preservation.
- Add basic responsive mobile layout.
- Add light and dark themes.
- Add error states with actionable recovery steps.

### Deliverable

A web application that can replace Telegram for ordinary text and code conversations on the local network.

### Acceptance criteria

- A new conversation can be created.
- Existing supported Hermes sessions can be opened.
- Text streams without duplication.
- Stop behaves correctly.
- Retry behaves correctly or is clearly capability-gated.
- Markdown and code render correctly.
- Refreshing the browser does not lose the conversation.
- A temporary network interruption recovers cleanly.
- Desktop and iPhone layouts remain usable.

---

## Phase 4: Activity timeline and command-center visibility

### Goal

Expose Hermes' work clearly without cluttering completed conversations.

### Tasks

- Render active tool calls.
- Render command output incrementally.
- Show current stage.
- Show elapsed time.
- Show model.
- Show context percentage.
- Show token counts where available.
- Show memory references where available.
- Show retries and failures.
- Collapse completed activity into a summary chip.
- Add expandable timeline.
- Add Developer Mode.
- Add sanitized raw-event inspector.
- Add slash-command autocomplete.
- Add command palette.
- Add capability-aware controls.
- Add model picker.
- Add reasoning-effort picker if supported.

### Deliverable

A polished command-center chat that provides the visibility Ryan values in the TUI.

### Acceptance criteria

- Active work is understandable without Developer Mode.
- Completed activity is compact by default.
- Every failed tool call has a useful error.
- Developer Mode cannot reveal known secrets.
- Slash commands are discoverable and usable.
- Model switching works per session.
- Unsupported data is not faked.

---

## Phase 5: Projects and basic permissions

### Goal

Introduce project boundaries and permission decisions before adding powerful file-editing behavior.

### Tasks

Projects:

- Create, edit, archive, and select projects.
- Add persistent project instructions.
- Add declared local paths.
- Add declared remote hosts.
- Link conversations to projects.
- Show the active project clearly in chat.

Permissions:

- Implement policy inheritance.
- Add the three permission modes.
- Implement initial action categories.
- Add safe-command classifier.
- Add boundary checks.
- Add approval request creation.
- Add approve and deny flows.
- Bind approvals to action hashes.
- Pause the run while awaiting approval.
- Resume the same run after approval.
- Add approval inbox.
- Add audit events for policy evaluation and decisions.

### Deliverable

A user can create a project, chat within its boundaries, and approve protected actions.

### Acceptance criteria

- Conversation policy overrides project policy.
- Project policy overrides global policy.
- Reads inside declared paths can be allowed automatically.
- Writes pause when the policy requires approval.
- Undeclared paths and hosts trigger boundary expansion requests.
- Approved actions cannot silently change before execution.
- Every decision is explainable in the audit log.

---

## Phase 6: File uploads, library, previews, and artifacts

### Goal

Complete the version-one file experience.

### Tasks

Uploads:

- Drag-and-drop upload.
- File-picker upload.
- Multiple-file upload.
- Upload progress.
- Size and type limits.
- Virus or malware scanning if practical for the deployment.
- Hash-based duplicate detection.
- Secure file names and storage keys.

Library:

- Project and conversation association.
- Search and filtering.
- Retention policies.
- Expiration job.
- Manual delete.
- Audit events.

Previews:

- Images
- Plain text
- Markdown
- JSON
- Logs
- Source code
- PDFs as a later subtask if necessary

Artifacts:

- Detect structured artifact events where Hermes supports them.
- Allow backend registration where Hermes returns paths.
- Show artifacts in the split panel.
- Download artifacts.
- Preview supported artifacts.
- Keep artifact access authorized and logged.

### Deliverable

Users can upload important files, reference them in chat, preview them, and retrieve Hermes-generated output.

### Acceptance criteria

- Drag-and-drop works.
- Uploads never become directly executable web content.
- File paths cannot escape storage boundaries.
- Retention removes expired files and records the action.
- Image and text previews work on desktop and phone.
- Generated files appear in the artifact panel.
- Downloads use safe names and authorization checks.

---

## Phase 7: File editing and diffs

### Goal

Allow Hermes to propose changes while keeping Ryan in control.

### Tasks

- Capture proposed file edits structurally where possible.
- Generate before-and-after diff.
- Render side-by-side and unified diff modes.
- Add syntax highlighting.
- Add per-file approve and reject.
- Add approve-all only when policies allow.
- Revalidate the file has not changed since the proposal.
- Handle conflicts.
- Save through an approved backend operation.
- Record hashes before and after.
- Add audit records.
- Add optional project-level auto-approval for safe edits later.

### Deliverable

Hermes can propose file changes and Ryan can review the exact diff before saving.

### Acceptance criteria

- No stale diff can overwrite a newer file silently.
- Approval applies to exact content.
- Rejected edits are not written.
- The audit log records file path and hashes, not sensitive content by default.
- Diff rendering remains usable on mobile.

---

## Phase 8: Notifications and durable background jobs

### Goal

Let tasks continue after the browser closes and reliably summon Ryan when input is needed.

### Tasks

Jobs:

- Add durable job records.
- Rehydrate active jobs after backend restart.
- Support queued, running, waiting-for-approval, waiting-for-credential, paused, completed, failed, canceled.
- Add cancel, retry, pause, resume, and duplicate where technically supported.
- Add progress model for measurable jobs.
- Add job dashboard.
- Add concurrency limits.

Notifications:

- Browser notifications
- ntfy adapter
- Apprise adapter
- Per-project and global preferences
- Deduplication
- Quiet hours if desired later
- Retry and failure logging
- Signed, short-lived approval review links
- Mobile-friendly approval page
- Authenticated POST for decision

Reconnection:

- Reattach to active runs.
- Replay missed sanitized events.
- Show honest state when Hermes cannot resume a stream.
- Avoid duplicate messages.

### Deliverable

A long-running Hermes task remains visible and actionable after the browser closes.

### Acceptance criteria

- Closing the browser does not cancel a supported background run.
- Approval-required tasks pause.
- ntfy or Apprise notification is sent.
- Notification link opens the correct approval.
- Expired or reused links cannot decide an action.
- Backend restart does not lose durable job metadata.
- Reconnection does not duplicate output.

---

## Phase 9: Credential broker and Bitwarden integration

### Goal

Provide credentials to approved tools without exposing them to chat, browser code, or logs.

### Tasks

- Choose and document Bitwarden Secrets Manager or alternative.
- Implement credential provider interface.
- Add project credential references.
- Add validation without revealing values.
- Add `waiting_for_credential` workflow.
- Add missing-credential UI.
- Add instructions or deep link for creating the Bitwarden item.
- Add association flow after creation.
- Add narrow injection methods:
  - Process environment
  - Standard input
  - Temporary file
  - SSH agent or dedicated key reference
- Add cleanup.
- Add active-secret redaction.
- Add known-pattern redaction.
- Add credential-use audit record.
- Add rotation and validation status.
- Add provider-health diagnostics.

### Deliverable

A project can securely use a Bitwarden-managed credential during an approved action.

### Acceptance criteria

- Secret values never reach the browser.
- Secret values never enter normal event persistence.
- Logs are redacted.
- Temporary files have restrictive permissions and are removed.
- Credential references are scoped by project and host.
- Missing credentials pause rather than crash a run.
- Revoked credentials fail safely and provide a useful recovery path.

---

## Phase 10: Search, organization, and memory controls

### Goal

Make the application comfortable for ongoing daily use.

### Tasks

Conversation organization:

- Search
- Rename
- Pin
- Folders
- Project filters
- Archive
- Recent activity

Memory:

- List Hermes memories through supported interfaces.
- View memory details.
- Edit and delete only through supported Hermes operations.
- Show memories used by an answer where available.
- Clearly label inferred associations.
- Do not pretend a memory was used when Hermes does not expose that fact.

Context:

- Add context meter.
- Show compaction events.
- Show major context consumers if available.
- Add manual compaction only if Hermes supports it safely.

### Deliverable

A user can find prior work and inspect or manage Hermes memory without using the terminal.

### Acceptance criteria

- Search returns relevant sessions or clearly states indexing limits.
- Memory changes affect Hermes' real source of truth.
- Context usage is accurate and capability-gated.
- No duplicate memory store is presented as authoritative.

---

## Phase 11: Workspace browser and embedded terminal

### Goal

Add terminal-adjacent capabilities without compromising the chat-first design.

### Tasks

Workspace browser:

- Browse declared project paths.
- Preview files.
- Search names and content.
- Copy paths into chat.
- Open file in artifact panel.
- Request boundary expansion when navigating outside declared roots.

Terminal:

- Optional per-project terminal.
- Explicit host and working-directory indicator.
- Session isolation.
- Resize and reconnect.
- Copy and paste.
- Audit session creation and host.
- Do not record raw terminal content by default.
- Apply credential and boundary policies.
- Keep it visually secondary to chat.

### Deliverable

A controlled workspace and terminal experience for advanced tasks.

### Acceptance criteria

- Terminal cannot silently connect outside project boundaries.
- Current host and directory are always visible.
- Closing the panel does not accidentally terminate a task unless chosen.
- Sensitive terminal output is not persisted by default.

---

## Phase 12: Theme-system integration and polish

### Goal

Apply the reusable Windows 3.1-inspired design language after the interaction model is stable.

### Tasks

- Integrate design tokens from `~/projects/style`.
- Give Command Center its own color identity.
- Maintain light and dark variants.
- Add restrained window-open transitions.
- Add useful button, toast, panel, and task-state animations.
- Respect reduced-motion preferences.
- Audit keyboard navigation.
- Audit screen-reader labels.
- Audit contrast.
- Tune responsive behavior.
- Add loading skeletons and empty states.
- Add visual regression tests.
- Add PWA manifest and icons.
- Validate Safari Add to Home Screen behavior.

### Deliverable

A polished, distinctive command center that remains fast and unobtrusive.

### Acceptance criteria

- Animations communicate state.
- Reduced-motion mode works.
- Keyboard navigation covers the core chat flow.
- Light and dark modes meet contrast requirements.
- The interface remains fast on desktop and iPhone.
- Theme-system integration does not couple core business logic to visual components.

---

## Phase 13: Production hardening

### Goal

Make the system dependable enough to become the primary Hermes interface.

### Tasks

- Threat-model review.
- Dependency audit.
- Backup and restore test.
- PostgreSQL backup schedule.
- File metadata and storage backup policy.
- Disaster-recovery documentation.
- Structured log retention.
- Health endpoints.
- Metrics and alerting.
- WebSocket load and soak tests.
- Upload abuse tests.
- Approval replay tests.
- Redaction regression suite.
- Browser compatibility tests.
- Cloudflare Access and WebSocket validation.
- Gospel disconnect simulation.
- Barnabas restart simulation.
- Hermes upgrade compatibility checklist.
- Operational runbook.

### Deliverable

A stable production deployment with documented recovery procedures.

### Acceptance criteria

- Backup restoration is tested.
- Approval replay is prevented.
- Known test secrets are always redacted.
- Expected failures produce actionable messages.
- Hermes outage does not corrupt application state.
- Application restart preserves durable jobs and metadata.
- Upgrade procedure includes protocol-fixture tests.

---

# 15. Version-One Definition

Version one is complete when these five priorities are excellent:

1. Beautiful chat
2. Permission controls
3. Custom themes
4. File uploads
5. Markdown and code rendering

The following supporting features are also required for a credible version one:

- Conversation sidebar and history
- Stop
- Retry
- Hermes working indicator
- Basic tool-activity display
- Model visibility and switching
- Responsive mobile layout
- Basic project boundaries
- Approval flow
- Basic audit log
- Secure credential architecture, even if full Bitwarden integration lands immediately afterward
- Reconnection behavior
- Actionable errors

### Explicitly not required for version one

- Multiple Hermes instances
- Run comparison
- Named settings presets
- Message branching
- Full embedded terminal
- Complete memory editing
- Advanced artifact editors
- Shared multi-user access
- Public internet authentication beyond Cloudflare Access
- Full universal-theme integration during the earliest prototype

---

# 16. Testing Strategy

## Unit tests

- Event normalization
- Redaction
- Policy inheritance
- Safe-command classification
- Boundary resolution
- Action hashing
- Retention calculations
- Credential scoping
- Markdown sanitization helpers

## Contract tests

- Raw Hermes fixture to normalized event
- Unknown Hermes messages
- Reordered or duplicated events
- Reconnect replay
- Capability discovery

## Integration tests

- Barnabas API to Gospel `hermes serve`
- PostgreSQL persistence
- File storage
- Notification adapters
- Bitwarden provider
- Approval pause and resume
- Model switching
- Session listing and resume

## End-to-end tests

- Create a conversation and receive a streamed response
- Stop a run
- Retry a failed turn
- Upload and preview a file
- Trigger and approve a write action
- Deny an action
- Expand a project boundary
- Close and reopen the browser during a run
- Use an approval link on mobile
- Verify a seeded test secret is redacted
- Switch themes
- Use slash-command autocomplete

## Security tests

- Path traversal
- Stored and reflected XSS through Markdown
- Malicious SVG or HTML upload
- CSRF
- WebSocket origin bypass
- Approval replay
- Approval action mutation
- Expired token
- Oversized upload
- Credential leakage in logs
- Credential leakage in Developer Mode
- SQL injection
- Command-injection boundaries
- Unauthorized artifact download

---

# 17. Observability

### Structured log fields

- `request_id`
- `user_id`
- `session_id`
- `run_id`
- `project_id`
- `approval_id`
- `event_type`
- `component`
- `duration_ms`
- `status`
- `error_code`

Never include raw secret values or unredacted tool output.

### Health checks

- Web application
- API
- PostgreSQL
- File storage
- Hermes connection
- Notification providers
- Credential provider

### Useful metrics

- Active WebSocket connections
- Hermes connection state
- Active and queued jobs
- Runs by outcome
- Tool failures
- Approval wait duration
- Notification failures
- Upload volume
- Redaction matches
- Reconnect count
- Response first-token latency
- Full run duration

---

# 18. Deployment Plan

## Gospel

Create a systemd unit for `hermes serve`.

Requirements:

- Dedicated service user if compatible with existing Hermes state
- Explicit working directory
- Explicit environment file
- Restart policy
- Private bind address
- Firewall restriction to Barnabas
- Health check
- Logs available through journald
- No direct public exposure

Do not finalize the unit until Phase 1 confirms the exact supported command-line options.

## Barnabas

Docker Compose services:

```text
web
api
postgres
optional-job-worker
optional-reverse-proxy
```

Mounts:

- Application configuration
- Uploaded files
- Generated artifacts
- Database backup location

### Cloudflare

- Protect the Barnabas application with Cloudflare Access.
- Validate normal HTTPS requests.
- Validate application WebSockets.
- Do not route browser traffic directly to Gospel.
- Consider a Cloudflare service token only for machine-to-machine access if the topology requires it.
- Prefer LAN/private-network communication from Barnabas to Gospel.

---

# 19. Codex Working Method

Codex should work phase by phase.

For each phase:

1. Read this roadmap.
2. Read existing ADRs and phase reports.
3. Inspect the repository before making changes.
4. Restate the phase goal and current constraints.
5. Implement the smallest complete vertical slice.
6. Add or update tests.
7. Run formatting, linting, type checks, tests, and builds.
8. Update documentation.
9. Record discoveries and deviations.
10. Stop at the phase boundary for review.

### Codex must not

- Invent Hermes RPC methods.
- Assume Telegram sessions are shareable without testing.
- Expose `hermes serve` directly to the browser.
- Store Bitwarden secret values.
- log unredacted protocol payloads in production.
- bypass approvals to make a demo work.
- rewrite unrelated parts of the repository.
- couple the UI directly to raw Hermes events.
- add a heavy dependency without documenting why.
- implement visual polish before the core interaction is reliable.
- claim an unsupported Hermes feature exists.

### Required phase completion note

At the end of each phase, Codex should write:

```markdown
## Phase Completion Report

### Completed
- ...

### Tests run
- ...

### Manual verification
- ...

### Discoveries
- ...

### Deviations from roadmap
- ...

### Known limitations
- ...

### Recommended next phase
- ...
```

---

# 20. Initial Codex Prompt

Use this prompt to start Phase 0 and Phase 1 only:

```text
You are building a self-hosted application named Hermes Command Center.

Read ROADMAP.md in full before changing anything. The product is a desktop-first,
mobile-capable web interface for a remote Hermes Agent instance. Barnabas will
host the web application. Gospel currently hosts Hermes Agent. The preferred
integration is the Hermes TUI Gateway JSON-RPC/WebSocket interface exposed by
`hermes serve`.

Your assignment is limited to:

1. Phase 0: repository and documentation foundation
2. Phase 1: Hermes integration probe

Do not build the production chat UI yet.

Requirements:

- Create a clean monorepo and document the chosen tooling.
- Add formatting, linting, type checking, tests, environment validation, and CI.
- Add ADRs for major technology decisions.
- Build a narrow command-line integration probe for `hermes serve`.
- Do not invent protocol methods. Inspect the installed Hermes version and
  official documentation or source as needed.
- Record sanitized raw protocol fixtures.
- Determine whether existing sessions can be listed and resumed.
- Specifically test whether a Telegram-created session can be identified and
  resumed through the TUI gateway.
- Test streaming, tool events, stop, slash commands, model switching,
  approvals or clarifications, reconnect behavior, and concurrent sessions.
- Identify available context, token, memory, file, and artifact metadata.
- Keep secrets out of source control, logs, fixtures, and reports.
- Do not expose Gospel directly to browser clients.
- Write docs/protocol/hermes-integration-report.md with a capability matrix,
  findings, limitations, and the recommended production adapter behavior.
- Write a Phase Completion Report before stopping.

When a Hermes capability cannot be verified, mark it unknown rather than
guessing. Prefer a small reliable probe over a premature application shell.
```

---

# 21. Decision Log Starter

Create ADRs for these decisions:

| ADR | Decision |
|---|---|
| ADR-001 | Use Hermes TUI Gateway JSON-RPC/WebSocket as primary integration |
| ADR-002 | Isolate Hermes behind a backend adapter |
| ADR-003 | Keep Hermes as session and memory source of truth |
| ADR-004 | Host application on Barnabas and Hermes on Gospel |
| ADR-005 | Browser communicates only with Barnabas |
| ADR-006 | Use PostgreSQL for application metadata |
| ADR-007 | Use project and conversation permission inheritance |
| ADR-008 | Use server-side credential references |
| ADR-009 | Redact before persistence or display |
| ADR-010 | Build desktop-first responsive web application |
| ADR-011 | Use local file storage behind a storage adapter initially |
| ADR-012 | Delay full design-system integration until core UX is proven |

---

# 22. Open Questions to Resolve During Development

These questions should not block Phase 0, but most must be answered during the integration probe or before their related phase.

### Hermes protocol

- How stable is the TUI gateway protocol across Hermes releases?
- Is there version or capability negotiation?
- How does authentication work?
- How are approvals and clarifications encoded?
- How are files and artifacts represented?
- Can an active run survive client disconnect?
- Can missed events be replayed?
- Can Telegram-created sessions be resumed?
- Can web-originated replies appear in the same Telegram thread?
- Does Hermes expose memory attribution for a response?
- Is reasoning effort configurable independently of the model?

### Permissions

- Can Hermes pause before executing every relevant tool?
- Does the TUI gateway already provide an approval callback?
- Which decisions belong in Hermes versus Command Center?
- How should scripts and interpreters be classified safely?

### Files

- How does Hermes receive uploaded files?
- Does Hermes require local paths on Gospel?
- Should Barnabas copy files to Gospel, mount shared storage, or expose a controlled download?
- How are generated files discovered reliably?

### Jobs

- Which Hermes tasks survive process or gateway restart?
- Which tasks can truly pause and resume?
- How should unsupported pause behavior be represented?

### Credentials

- Will Bitwarden Secrets Manager be used?
- Which component owns its machine token?
- Can SSH use dedicated keys or an agent without materializing private keys?
- How will credential rotation be detected?

### Mobile

- Which browser-notification behavior is available in the targeted Safari version?
- How should Add to Home Screen and service-worker updates be handled?
- Can notification deep links return to the exact approval after Cloudflare authentication?

---

# 23. Milestone Checklist

## Milestone A: Integration understood

- [ ] `hermes serve` runs reliably on Gospel
- [ ] Barnabas connects privately
- [ ] Protocol report completed
- [ ] Session behavior documented
- [ ] Telegram sharing tested
- [ ] Streaming tested
- [ ] Tool events tested
- [ ] Stop tested
- [ ] Approval flow tested
- [ ] Reconnection tested

## Milestone B: Chat replaces Telegram for ordinary use

- [ ] Conversation sidebar
- [ ] New and existing sessions
- [ ] Streaming chat
- [ ] Stop and retry
- [ ] Markdown
- [ ] Excellent code blocks
- [ ] Responsive mobile layout
- [ ] Light and dark themes
- [ ] Actionable errors

## Milestone C: Command-center visibility

- [ ] Active stage
- [ ] Tool activity
- [ ] Elapsed time
- [ ] Model
- [ ] Context meter
- [ ] Collapsed completion summary
- [ ] Expandable timeline
- [ ] Slash commands
- [ ] Command palette
- [ ] Developer Mode

## Milestone D: Controlled agent actions

- [ ] Projects
- [ ] Declared boundaries
- [ ] Permission inheritance
- [ ] Approval queue
- [ ] Pause and resume
- [ ] Audit log
- [ ] Boundary expansion

## Milestone E: Version-one file experience

- [ ] Drag-and-drop
- [ ] Upload progress
- [ ] File library
- [ ] Retention policy
- [ ] Image preview
- [ ] Text/code preview
- [ ] Artifact panel
- [ ] Download
- [ ] File diff approval

## Milestone F: Durable remote use

- [ ] Background jobs
- [ ] Browser notifications
- [ ] ntfy
- [ ] Apprise
- [ ] Mobile approval flow
- [ ] Reconnection
- [ ] Backend restart recovery

## Milestone G: Secure credentials

- [ ] Credential provider selected
- [ ] Bitwarden integration
- [ ] Missing-credential pause
- [ ] Project credential references
- [ ] Narrow injection
- [ ] Cleanup
- [ ] Redaction regression tests
- [ ] Rotation workflow

## Milestone H: Production-ready

- [ ] Cloudflare Access
- [ ] Backups
- [ ] Restore test
- [ ] Security tests
- [ ] Metrics
- [ ] Health checks
- [ ] Upgrade runbook
- [ ] Theme-system integration
- [ ] Safari web-app validation

---

# 24. Official Hermes References

- [Programmatic Integration](https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration)
- [Desktop App and `hermes serve`](https://hermes-agent.nousresearch.com/docs/user-guide/desktop)
- [CLI Commands Reference](https://hermes-agent.nousresearch.com/docs/reference/cli-commands)
- [Sessions](https://hermes-agent.nousresearch.com/docs/user-guide/sessions)
- [TUI](https://hermes-agent.nousresearch.com/docs/user-guide/tui)
- [Messaging Gateway](https://hermes-agent.nousresearch.com/docs/user-guide/messaging)
- [Telegram](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/telegram)
- [API Server](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/api-server.md)

---

## Final Direction

Build the narrowest reliable path from browser to Hermes first.

The order of operations is:

1. Prove Hermes integration.
2. Normalize and secure the event stream.
3. Build excellent chat.
4. Add visibility.
5. Add permissions.
6. Add files and artifacts.
7. Add durable jobs and notifications.
8. Add credentials.
9. Add advanced tools.
10. Apply the full visual identity.
11. Harden production.

Do not let future ambitions muddy the first watering hole. The first major victory is a beautiful, reliable chat interface that can truthfully show what Hermes is doing and safely pause before it crosses a boundary.
