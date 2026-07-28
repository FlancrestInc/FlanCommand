import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AgentEvent,
  CredentialRequest,
  HermesSession,
  SafeError,
} from "@flancommand/event-schema";
import {
  createHermesAdapter,
  HermesAdapterError,
  type HermesAdapter,
} from "@flancommand/hermes-adapter";
import {
  defaultPolicy,
  evaluateAction,
  normalizeProject,
  permissionPolicyForMode,
  resolvePolicy,
  type Policy,
  type PolicyAction,
  type PolicyEvaluation,
  type PermissionMode,
  type Project,
} from "./policy.js";
import { FileStore, type FileRecord } from "./file-store.js";
import { JsonMetadataStore } from "./metadata-store.js";
import { ApprovalLinkSigner } from "./approval-link.js";
import {
  notificationAdaptersFromEnvironment,
  type NotificationAdapter,
  type NotificationMessage,
} from "./notification.js";
import {
  BwsCliCredentialProvider,
  CredentialBroker,
  type CredentialLease,
  type CredentialProvider,
  type CredentialReference,
} from "./credential-broker.js";
import { listWorkspace, readWorkspaceFile, searchWorkspace } from "./workspace.js";
import { applyEditProposal, createEditProposal, type EditProposal } from "./edit-proposal.js";
import { applyProjectInstructions } from "./project-context.js";
import { TerminalManager } from "./terminal.js";
import { defaultSettings, normalizeSettings, type UserSettings } from "./settings.js";
import { readHermesRuntimeConfig } from "./hermes-runtime-config.js";
import { isAllowedRequestOrigin, parseAllowedOrigins } from "./request-security.js";
import { hasTrustedIdentity, readAuthConfig, type RequestAuthConfig } from "./request-auth.js";
import { RateLimiter, readRateLimitConfig } from "./rate-limit.js";
import { JobQueue } from "./job-queue.js";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  at: string;
  runId?: string;
  turnId?: string;
  status?: "complete" | "working" | "failed" | "stopped";
  attachments?: string[];
}

interface SessionState {
  session: HermesSession;
  messages: ChatMessage[];
  skipResume?: boolean;
  activeRunId?: string;
  projectId?: string;
  permissionModeOverride?: PermissionMode;
  conversationPolicy?: Partial<Policy>;
  customTitle?: string;
  isPinned?: boolean;
  folderId?: string;
  archived?: boolean;
}

interface FolderRecord {
  id: string;
  name: string;
  createdAt: string;
}

interface ApprovalRecord {
  id: string;
  actionHash: string;
  action: PolicyAction;
  description: string;
  sessionId?: string;
  projectId?: string;
  runId?: string;
  details?: { path?: string; host?: string; projectId?: string };
  evaluation: PolicyEvaluation;
  decision: "pending" | "approved" | "denied";
  createdAt: string;
}

interface ArtifactRecord {
  id: string;
  fileId: string;
  name: string;
  artifactType: "file" | "image" | "document" | "link" | "unknown";
  createdAt: string;
}

type JobStatus =
  | "queued"
  | "running"
  | "waiting_for_approval"
  | "waiting_for_credential"
  | "paused"
  | "completed"
  | "failed"
  | "canceled";
interface JobRecord {
  id: string;
  title: string;
  prompt?: string;
  status: JobStatus;
  sessionId?: string;
  runId?: string;
  progress?: number;
  error?: SafeError;
  credentialRequest?: CredentialRequest;
  attachments?: string[];
  createdAt: string;
  updatedAt: string;
}
interface NotificationRecord {
  id: string;
  kind: "approval" | "job" | "system";
  title: string;
  body: string;
  jobId?: string;
  approvalId?: string;
  reviewUrl?: string;
  read: boolean;
  createdAt: string;
}
interface AuditRecord {
  type: string;
  fileId?: string;
  projectId?: string;
  sessionId?: string;
  permissionMode?: string;
  artifactId?: string;
  credentialId?: string;
  proposalId?: string;
  path?: string;
  beforeHash?: string;
  afterHash?: string;
  terminalId?: string;
  host?: string;
  injectionMethod?: string;
  approvalId?: string;
  at: string;
}
interface PersistedMetadata {
  version: 1;
  projects: Project[];
  approvals: ApprovalRecord[];
  artifacts: ArtifactRecord[];
  audit: AuditRecord[];
  jobs: JobRecord[];
  runEvents: Record<string, AgentEvent[]>;
  notifications: NotificationRecord[];
  credentialReferences: CredentialReference[];
  folders: FolderRecord[];
  editProposals: EditProposal[];
  settings: UserSettings;
  sessions: Record<
    string,
    {
      messages: ChatMessage[];
      skipResume?: boolean;
      projectId?: string;
      permissionModeOverride?: PermissionMode;
      conversationPolicy?: Partial<Policy>;
      customTitle?: string;
      isPinned?: boolean;
      folderId?: string;
      archived?: boolean;
    }
  >;
}

export interface ApiServerOptions {
  adapter?: HermesAdapter;
  fileStore?: FileStore;
  metadataPath?: string;
  notificationAdapters?: NotificationAdapter[];
  credentialProviders?: CredentialProvider[];
  terminalManager?: TerminalManager;
  allowedOrigins?: Set<string>;
  auth?: RequestAuthConfig;
  maxConcurrentJobs?: number;
}

function json(response: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(text);
}

function sse(response: ServerResponse, event: string, data: unknown): void {
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function body(
  request: IncomingMessage,
  maxBytes = 1_048_576,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > maxBytes) throw new ApiError(413, "Request body is too large.");
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new ApiError(400, "Request body must be an object.");
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sessionPayload(state: SessionState): Record<string, unknown> {
  return {
    ...state.session,
    ...(state.customTitle ? { title: state.customTitle, customTitle: state.customTitle } : {}),
    ...(state.isPinned ? { isPinned: true } : {}),
    ...(state.folderId ? { folderId: state.folderId } : {}),
    ...(state.archived ? { archived: true } : {}),
    ...(state.projectId ? { projectId: state.projectId } : {}),
    ...(state.permissionModeOverride
      ? { permissionModeOverride: state.permissionModeOverride }
      : { permissionModeOverride: null }),
    messages: state.messages,
  };
}

function sessionListPayload(state: SessionState): Record<string, unknown> {
  return {
    ...state.session,
    ...(state.customTitle ? { title: state.customTitle, customTitle: state.customTitle } : {}),
    ...(state.isPinned ? { isPinned: true } : {}),
    ...(state.folderId ? { folderId: state.folderId } : {}),
    ...(state.archived ? { archived: true } : {}),
  };
}

function sessionMatches(state: SessionState, query: string): boolean {
  if (!query) return true;
  const haystack = [
    state.customTitle,
    state.session.title,
    ...state.messages.map((message) => message.text),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function publicFile(record: FileRecord): Omit<FileRecord, "storageKey"> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => key !== "storageKey")) as Omit<
    FileRecord,
    "storageKey"
  >;
}

function artifactFilePath(uri: string): string | undefined {
  if (uri.startsWith("file://")) {
    try {
      return fileURLToPath(uri);
    } catch {
      return undefined;
    }
  }
  if (/^[a-z][a-z\d+.-]*:\/\//iu.test(uri)) return undefined;
  return resolve(uri);
}

function artifactMimeType(name: string, declared?: string): string {
  if (declared) return declared.split(";", 1)[0]!.toLowerCase();
  const extension = extname(name).toLowerCase();
  return (
    {
      ".md": "text/markdown",
      ".markdown": "text/markdown",
      ".txt": "text/plain",
      ".log": "text/plain",
      ".csv": "text/csv",
      ".json": "application/json",
      ".js": "text/javascript",
      ".ts": "text/javascript",
      ".css": "text/css",
      ".xml": "text/xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".pdf": "application/pdf",
    }[extension] ?? "application/octet-stream"
  );
}

function isDeclaredRemotePath(candidate: string, roots: string[]): boolean {
  const clean = candidate.replace(/\/+$/u, "") || "/";
  return roots.some((root) => {
    const normalizedRoot = root.replace(/\/+$/u, "") || "/";
    return clean === normalizedRoot || clean.startsWith(`${normalizedRoot}/`);
  });
}

function activeAssistantForRun(state: SessionState, runId: string): ChatMessage | undefined {
  return [...state.messages]
    .reverse()
    .find(
      (item) =>
        item.role === "assistant" &&
        item.runId === runId &&
        !["complete", "failed", "stopped"].includes(item.status ?? "working"),
    );
}

function applyEvent(state: SessionState, event: AgentEvent): void {
  if (event.type === "message.delta") {
    const current = activeAssistantForRun(state, event.runId);
    if (current) current.text += event.text;
    else
      state.messages.push({
        id: `message-${event.runId}`,
        role: "assistant",
        text: event.text,
        at: new Date().toISOString(),
        runId: event.runId,
        status: "working",
      });
  } else if (event.type === "message.completed") {
    const current = activeAssistantForRun(state, event.runId);
    if (current) current.turnId = event.messageId;
  } else if (event.type === "run.completed") {
    const current = activeAssistantForRun(state, event.runId);
    if (current) current.status = "complete";
    state.activeRunId = undefined;
    state.session.status = "idle";
  } else if (event.type === "run.failed") {
    const current = activeAssistantForRun(state, event.runId);
    if (current) {
      current.status = "failed";
      current.text += `\n\n_${event.error.message}_`;
    }
    state.activeRunId = undefined;
    state.session.status = "failed";
  } else if (event.type === "run.stopped") {
    const current = activeAssistantForRun(state, event.runId);
    if (current) current.status = "stopped";
    state.activeRunId = undefined;
    state.session.status = "idle";
  } else if (event.type === "run.started") {
    if (
      state.messages.some(
        (item) =>
          item.role === "assistant" &&
          item.runId === event.runId &&
          ["complete", "failed", "stopped"].includes(item.status ?? "working"),
      )
    ) {
      state.messages.push({
        id: `message-${event.runId}-${Date.now()}`,
        role: "assistant",
        text: "",
        at: new Date().toISOString(),
        runId: event.runId,
        status: "working",
      });
    }
    state.activeRunId = event.runId;
    state.session.status = "running";
  }
}

export function createApiServer(options: ApiServerOptions = {}) {
  const hermesConfig = readHermesRuntimeConfig();
  const allowedOrigins =
    options.allowedOrigins ?? parseAllowedOrigins(process.env.FLANC_ALLOWED_ORIGINS);
  const auth = options.auth ?? readAuthConfig();
  const rateLimiter = new RateLimiter(readRateLimitConfig());
  const adapter =
    options.adapter ??
    createHermesAdapter({
      ...hermesConfig,
    });
  const sessions = new Map<string, SessionState>();
  const resumedSessions = new Set<string>();
  const folders = new Map<string, FolderRecord>();
  const editProposals = new Map<string, EditProposal>();
  const projects = new Map<string, Project>([
    [
      "project-local",
      {
        id: "project-local",
        name: "Local workspace",
        description: "The default boundary for local development.",
        paths: [process.cwd()],
        hosts: ["127.0.0.1", "localhost"],
        permissionMode: "ask",
        policy: {},
        createdAt: new Date().toISOString(),
      },
    ],
  ]);
  const approvals = new Map<string, ApprovalRecord>();
  const artifacts = new Map<string, ArtifactRecord>();
  const audit: AuditRecord[] = [];
  const jobs = new Map<string, JobRecord>();
  const configuredJobLimit = Number(process.env.FLANC_MAX_CONCURRENT_JOBS ?? 2);
  const jobQueue = new JobQueue(
    options.maxConcurrentJobs ??
      (Number.isInteger(configuredJobLimit) && configuredJobLimit > 0 ? configuredJobLimit : 2),
  );
  const runEventLog = new Map<string, AgentEvent[]>();
  const notifications = new Map<string, NotificationRecord>();
  const notificationAdapters =
    options.notificationAdapters ?? notificationAdaptersFromEnvironment();
  const credentialProviders = options.credentialProviders ?? [new BwsCliCredentialProvider()];
  const credentialBroker = new CredentialBroker(
    [],
    new Map(credentialProviders.map((provider) => [provider.name, provider])),
  );
  const terminalManager = options.terminalManager ?? new TerminalManager();
  const requestMetrics = {
    total: 0,
    byMethod: {} as Record<string, number>,
    byStatus: {} as Record<string, number>,
    totalDurationMs: 0,
  };
  const approvalLinkSigner = new ApprovalLinkSigner(
    process.env.FLANC_APPROVAL_SIGNING_SECRET ?? randomBytes(32).toString("hex"),
  );
  const storageRoot = process.env.FLANC_STORAGE_ROOT ?? resolve(process.cwd(), "storage");
  const fileStore =
    options.fileStore ??
    new FileStore({ root: storageRoot, metadataPath: resolve(storageRoot, "metadata/files.json") });
  const metadataStore = new JsonMetadataStore<PersistedMetadata>(
    options.metadataPath ?? resolve(storageRoot, "metadata/state.json"),
    {
      version: 1,
      projects: [...projects.values()],
      approvals: [],
      artifacts: [],
      audit: [],
      jobs: [],
      runEvents: {},
      notifications: [],
      credentialReferences: [],
      folders: [],
      editProposals: [],
      settings: { ...defaultSettings },
      sessions: {},
    },
  );
  let settings: UserSettings = { ...defaultSettings };
  let approvalSequence = 1;
  let jobSequence = 1;
  let notificationSequence = 1;
  let metadataReady: Promise<void> | undefined;
  let jobsWerePausedOnStartup = false;

  const persistMetadata = () =>
    metadataStore.save({
      version: 1,
      projects: [...projects.values()],
      approvals: [...approvals.values()],
      artifacts: [...artifacts.values()],
      audit: [...audit],
      jobs: [...jobs.values()],
      runEvents: Object.fromEntries(runEventLog),
      notifications: [...notifications.values()],
      credentialReferences: credentialBroker.list(),
      folders: [...folders.values()],
      editProposals: [...editProposals.values()],
      settings,
      sessions: Object.fromEntries(
        [...sessions.entries()].map(([id, state]) => [
          id,
          {
            messages: state.messages,
            ...(state.skipResume ? { skipResume: true } : {}),
            ...(state.projectId ? { projectId: state.projectId } : {}),
            ...(state.permissionModeOverride
              ? { permissionModeOverride: state.permissionModeOverride }
              : {}),
            ...(state.conversationPolicy ? { conversationPolicy: state.conversationPolicy } : {}),
            ...(state.customTitle ? { customTitle: state.customTitle } : {}),
            ...(state.isPinned ? { isPinned: true } : {}),
            ...(state.folderId ? { folderId: state.folderId } : {}),
            ...(state.archived ? { archived: true } : {}),
          },
        ]),
      ),
    });
  const enforceRateLimit = (request: IncomingMessage, bucket: string, response: ServerResponse) => {
    const client = request.socket.remoteAddress ?? "unknown";
    const result = rateLimiter.check(`${bucket}:${client}`);
    response.setHeader("x-ratelimit-limit", String(result.limit));
    response.setHeader("x-ratelimit-remaining", String(result.remaining));
    if (result.allowed) return true;
    response.writeHead(429, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "retry-after": String(result.retryAfterSeconds),
    });
    response.end(
      JSON.stringify({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Try again shortly.",
        },
      }),
    );
    return false;
  };
  const notify = async (
    input: Omit<NotificationRecord, "id" | "read" | "createdAt">,
    message?: NotificationMessage,
  ) => {
    const notification: NotificationRecord = {
      ...input,
      id: `notification-${notificationSequence++}`,
      read: false,
      createdAt: new Date().toISOString(),
    };
    notifications.set(notification.id, notification);
    await persistMetadata();
    if (message && notificationAdapters.length) {
      const results = await Promise.allSettled(
        notificationAdapters.map((adapter) => adapter.send(message)),
      );
      const failures = results
        .map((result, index) =>
          result.status === "rejected" ? notificationAdapters[index]?.name : undefined,
        )
        .filter((name): name is string => Boolean(name));
      if (failures.length) {
        notification.body = `${notification.body} (Delivery failed: ${failures.join(", ")})`;
        await persistMetadata();
      }
    }
    return notification;
  };
  const approvalReviewUrl = (approvalId: string): string => {
    const token = approvalLinkSigner.create(approvalId);
    return `${process.env.FLANC_PUBLIC_ORIGIN ?? ""}/approval-review.html?id=${encodeURIComponent(approvalId)}&token=${encodeURIComponent(token)}`;
  };
  const updateJob = async (job: JobRecord, patch: Partial<JobRecord>) => {
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
    await persistMetadata();
  };
  const createJob = (
    state: SessionState,
    sessionId: string,
    text: string,
    attachments: string[] = [],
  ): JobRecord => {
    const now = new Date().toISOString();
    state.messages.push({
      id: `message-user-${Date.now()}`,
      role: "user",
      text,
      at: now,
      status: "complete",
      ...(attachments.length
        ? {
            attachments: attachments.flatMap((id) => {
              const record = fileStore.get(id);
              return record ? [record.safeName] : [];
            }),
          }
        : {}),
    });
    const job: JobRecord = {
      id: `job-${jobSequence++}`,
      title: text.slice(0, 80),
      prompt: text,
      status: "queued",
      sessionId,
      createdAt: now,
      updatedAt: now,
      ...(attachments.length ? { attachments } : {}),
    };
    jobs.set(job.id, job);
    return job;
  };
  const runJob = async (
    job: JobRecord,
    state: SessionState,
    text: string,
    response?: ServerResponse,
    requiresResume = state.messages.length > 0,
  ): Promise<void> => {
    try {
      // The run is queued after the request-level readiness check. Re-check
      // the transport here because the WebSocket may have closed while the
      // job was waiting for a worker slot or before this callback started.
      await adapter.connect();
      // Hermes may expose a durable stored ID from session.list but require a
      // different live runtime ID for prompt.submit after reconnects/restarts.
      // Resume once per API process; the adapter then reuses its live-session
      // alias without replaying a potentially large history on every message.
      if (!state.skipResume && !resumedSessions.has(state.session.id)) {
        try {
          await adapter.resumeSession(state.session.id);
          resumedSessions.add(state.session.id);
        } catch (error) {
          // Newly created sessions may not have a resumable durable record yet;
          // those can still accept a prompt on the live connection.
          if (requiresResume) throw error;
        }
      }
      const attachmentRefs: string[] = [];
      for (const fileId of job.attachments ?? []) {
        const record = fileStore.get(fileId);
        const content = await fileStore.content(fileId);
        if (!record || !content) throw new Error(`Attachment ${fileId} is unavailable.`);
        const result = record.mimeType.startsWith("image/")
          ? await adapter.attachImage(state.session.id, {
              name: record.safeName,
              mimeType: record.mimeType,
              contentBase64: content.toString("base64"),
            })
          : await adapter.attachFile(state.session.id, {
              name: record.safeName,
              mimeType: record.mimeType,
              contentBase64: content.toString("base64"),
            });
        if (!result.attached) throw new Error(`Hermes rejected attachment ${record.safeName}.`);
        if (result.refText) attachmentRefs.push(result.refText);
        audit.push({
          type: "file.attached",
          fileId: record.id,
          sessionId: state.session.id,
          at: new Date().toISOString(),
        });
      }
      await persistMetadata();
      const prompt = attachmentRefs.length ? `${text}\n\n${attachmentRefs.join("\n")}` : text;
      const stream = text.startsWith("/")
        ? adapter.dispatchCommand(state.session.id, text)
        : adapter.sendMessage(state.session.id, {
            text: applyProjectInstructions(
              prompt,
              state.projectId ? projects.get(state.projectId)?.instructions : undefined,
            ),
          });
      const importArtifact = async (event: Extract<AgentEvent, { type: "artifact.created" }>) => {
        const uri = event.artifact.uri;
        const project = state.projectId ? projects.get(state.projectId) : undefined;
        const candidate = uri ? artifactFilePath(uri) : undefined;
        if (!candidate || !project) {
          audit.push({
            type: "artifact.rejected",
            sessionId: state.session.id,
            projectId: state.projectId,
            path: uri,
            at: new Date().toISOString(),
          });
          return;
        }
        try {
          const candidateRealPath = await realpath(candidate);
          const allowed = await Promise.all(
            project.paths.map(async (path) => {
              try {
                const root = await realpath(resolve(path));
                return candidateRealPath === root || candidateRealPath.startsWith(`${root}/`);
              } catch {
                return false;
              }
            }),
          );
          if (!allowed.some(Boolean) || !(await lstat(candidateRealPath)).isFile())
            throw new Error();
          const content = await readFile(candidateRealPath);
          const name = event.artifact.name || basename(candidateRealPath);
          const record = await fileStore.put({
            name,
            mimeType: artifactMimeType(name, event.artifact.mimeType),
            content,
            projectId: state.projectId,
            sessionId: state.session.id,
          });
          const artifact: ArtifactRecord = {
            id: `artifact-${artifacts.size + 1}`,
            fileId: record.id,
            name: record.safeName,
            artifactType:
              event.artifact.kind === "image" || event.artifact.kind === "document"
                ? event.artifact.kind
                : event.artifact.kind === "link" || event.artifact.kind === "file"
                  ? event.artifact.kind
                  : "unknown",
            createdAt: new Date().toISOString(),
          };
          artifacts.set(artifact.id, artifact);
          audit.push({
            type: "artifact.created",
            artifactId: artifact.id,
            fileId: record.id,
            projectId: state.projectId,
            sessionId: state.session.id,
            path: candidateRealPath,
            at: artifact.createdAt,
          });
        } catch {
          audit.push({
            type: "artifact.rejected",
            sessionId: state.session.id,
            projectId: state.projectId,
            path: candidate,
            at: new Date().toISOString(),
          });
        }
      };
      for await (const event of stream) {
        const events = runEventLog.get(job.id) ?? [];
        events.push(event);
        if (events.length > 256) events.splice(0, events.length - 256);
        runEventLog.set(job.id, events);
        if (event.type === "run.started")
          await updateJob(job, { runId: event.runId, status: "running" });
        if (event.type === "approval.requested") {
          const createdAt = new Date().toISOString();
          const actionHash = createHash("sha256")
            .update(JSON.stringify(event.approval))
            .digest("hex");
          approvals.set(event.approval.id, {
            id: event.approval.id,
            actionHash,
            action: "command",
            description: event.approval.description || event.approval.action,
            sessionId: state.session.id,
            projectId: state.projectId,
            runId: event.runId,
            evaluation: {
              decision: "approval",
              action: "command",
              reason: "Hermes requested approval for an action.",
              boundary: "conversation",
            },
            decision: "pending",
            createdAt,
          });
          job.status = "waiting_for_approval";
          const reviewUrl = approvalReviewUrl(event.approval.id);
          await notify(
            {
              kind: "approval",
              title: "Hermes needs approval",
              body: event.approval.description || event.approval.action,
              approvalId: event.approval.id,
              jobId: job.id,
              reviewUrl,
            },
            {
              title: "Hermes needs approval",
              body: event.approval.description || event.approval.action,
              url: reviewUrl,
            },
          );
        }
        if (event.type === "credential.requested") {
          await updateJob(job, {
            status: "waiting_for_credential",
            credentialRequest: event.credential,
          });
          await notify({
            kind: "approval",
            title: "Hermes needs a credential",
            body: `${event.credential.name}: ${event.credential.purpose ?? "Credential access is required."}`,
            jobId: job.id,
          });
        }
        if (event.type === "artifact.created") await importArtifact(event);
        applyEvent(state, event);
        if (event.type === "run.completed")
          await updateJob(job, { status: "completed", progress: 100 });
        if (event.type === "run.failed") {
          await updateJob(job, { status: "failed", error: event.error });
          await notify({
            kind: "job",
            title: "Hermes run failed",
            body: event.error.message,
            jobId: job.id,
          });
        }
        if (event.type === "run.stopped") await updateJob(job, { status: "canceled" });
        await persistMetadata();
        if (response && !response.destroyed) sse(response, "agent", event);
      }
      if (response && !response.destroyed) sse(response, "state", sessionPayload(state));
    } catch (error) {
      await updateJob(job, { status: "failed", error: safeError(error) });
      await notify({
        kind: "job",
        title: "Hermes run failed",
        body: "The background run failed.",
        jobId: job.id,
      });
      if (response && !response.destroyed) sse(response, "error", { error: safeError(error) });
    } finally {
      await persistMetadata();
      if (response && !response.destroyed) response.end();
    }
  };

  const ensureReady = async () => {
    if (!metadataReady) {
      metadataReady = (async () => {
        await metadataStore.init();
        await fileStore.init();
        const expiredFileIds = await fileStore.removeExpired();
        const stored = metadataStore.value;
        settings = normalizeSettings(
          stored.settings ? { ...stored.settings } : {},
          defaultSettings,
        );
        if (stored.projects.length) {
          projects.clear();
          for (const project of stored.projects) projects.set(project.id, project);
        }
        for (const approval of stored.approvals) approvals.set(approval.id, approval);
        for (const artifact of stored.artifacts) artifacts.set(artifact.id, artifact);
        audit.push(...stored.audit);
        for (const fileId of expiredFileIds)
          audit.push({ type: "file.expired", fileId, at: new Date().toISOString() });
        for (const job of stored.jobs)
          jobs.set(
            job.id,
            ["running", "queued"].includes(job.status)
              ? { ...job, status: "paused", updatedAt: new Date().toISOString() }
              : job,
          );
        for (const [jobId, events] of Object.entries(stored.runEvents ?? {}))
          runEventLog.set(jobId, events.slice(-256));
        for (const notification of stored.notifications)
          notifications.set(notification.id, notification);
        for (const reference of stored.credentialReferences ?? []) credentialBroker.set(reference);
        for (const folder of stored.folders ?? []) folders.set(folder.id, folder);
        for (const proposal of stored.editProposals ?? []) editProposals.set(proposal.id, proposal);
        approvalSequence = approvals.size + 1;
        jobSequence = jobs.size + 1;
        notificationSequence = notifications.size + 1;
        jobsWerePausedOnStartup = stored.jobs.some((job) =>
          ["running", "queued"].includes(job.status),
        );
      })();
    }
    await metadataReady;
    await adapter.connect();
    if (!sessions.size) {
      const listed = await adapter.listSessions();
      for (const session of listed) {
        const stored = metadataStore.value.sessions[session.id];
        sessions.set(session.id, {
          session: { ...session },
          messages: stored?.messages ?? [],
          ...(stored?.skipResume || isEphemeralSessionId(session.id) ? { skipResume: true } : {}),
          projectId: stored?.projectId ?? "project-local",
          ...(stored?.permissionModeOverride
            ? { permissionModeOverride: stored.permissionModeOverride }
            : {}),
          ...(stored?.conversationPolicy ? { conversationPolicy: stored.conversationPolicy } : {}),
          ...(stored?.customTitle ? { customTitle: stored.customTitle } : {}),
          ...(stored?.isPinned ? { isPinned: true } : {}),
          ...(stored?.folderId ? { folderId: stored.folderId } : {}),
          ...(stored?.archived ? { archived: true } : {}),
        });
      }
    }
    if (jobsWerePausedOnStartup) {
      jobsWerePausedOnStartup = false;
      await notify({
        kind: "system",
        title: "Background work paused",
        body: "The API restarted. Active job records were rehydrated for review.",
      });
    } else {
      await persistMetadata();
    }
  };

  return createServer(async (request, response) => {
    const requestStartedAt = process.hrtime.bigint();
    response.once("finish", () => {
      const method = request.method ?? "UNKNOWN";
      const status = String(response.statusCode);
      requestMetrics.total += 1;
      requestMetrics.byMethod[method] = (requestMetrics.byMethod[method] ?? 0) + 1;
      requestMetrics.byStatus[status] = (requestMetrics.byStatus[status] ?? 0) + 1;
      requestMetrics.totalDurationMs += Number(process.hrtime.bigint() - requestStartedAt) / 1e6;
    });
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const parts = url.pathname.split("/").filter(Boolean);
      const isHealthRequest =
        request.method === "GET" && (url.pathname === "/health" || url.pathname === "/api/health");
      if (
        !isHealthRequest &&
        request.method !== "OPTIONS" &&
        !hasTrustedIdentity(request.headers, auth)
      ) {
        response.writeHead(401, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "www-authenticate": "Cloudflare-Access",
        });
        response.end(
          JSON.stringify({
            error: {
              code: "AUTH_REQUIRED",
              message: "Sign in through the protected web boundary.",
            },
          }),
        );
        return;
      }
      if (
        request.method === "GET" &&
        !url.pathname.startsWith("/api/") &&
        url.pathname !== "/health"
      ) {
        const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
        const assetRoot = resolve(process.cwd(), "apps/web/public");
        const safePath = resolve(assetRoot, requested);
        if (safePath !== assetRoot && !safePath.startsWith(`${assetRoot}/`)) {
          json(response, 404, { error: { code: "NOT_FOUND", message: "Not found." } });
          return;
        }
        try {
          const content = await readFile(safePath);
          const types: Record<string, string> = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".webmanifest": "application/manifest+json; charset=utf-8",
            ".svg": "image/svg+xml",
          };
          response.writeHead(200, {
            "content-type": types[extname(safePath)] ?? "application/octet-stream",
            "cache-control": "no-cache",
            "content-security-policy":
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
            "permissions-policy": "camera=(), geolocation=(), microphone=()",
            "referrer-policy": "strict-origin-when-cross-origin",
            "x-content-type-options": "nosniff",
          });
          response.end(content);
        } catch {
          json(response, 404, { error: { code: "NOT_FOUND", message: "Not found." } });
        }
        return;
      }
      if (request.method === "OPTIONS") {
        if (!isAllowedRequestOrigin(request.headers.origin, allowedOrigins)) {
          json(response, 403, {
            error: { code: "ORIGIN_NOT_ALLOWED", message: "Request origin is not allowed." },
          });
          return;
        }
        response.writeHead(204, {
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "content-type",
        });
        response.end();
        return;
      }
      if (
        request.method !== "GET" &&
        !isAllowedRequestOrigin(request.headers.origin, allowedOrigins)
      ) {
        json(response, 403, {
          error: { code: "ORIGIN_NOT_ALLOWED", message: "Request origin is not allowed." },
        });
        return;
      }
      if (
        request.method === "GET" &&
        (url.pathname === "/api/health" || url.pathname === "/health")
      ) {
        try {
          await ensureReady();
          json(response, 200, {
            ok: true,
            transport: hermesConfig.transport,
            checks: {
              api: { ok: true },
              runtime: { ok: true },
            },
          });
        } catch {
          json(response, 503, {
            ok: false,
            transport: hermesConfig.transport,
            checks: {
              api: { ok: true },
              runtime: { ok: false },
            },
          });
        }
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/metrics") {
        await ensureReady();
        const jobsByStatus = [...jobs.values()].reduce<Record<string, number>>((counts, job) => {
          counts[job.status] = (counts[job.status] ?? 0) + 1;
          return counts;
        }, {});
        json(response, 200, {
          uptimeSeconds: Math.floor(process.uptime()),
          transport: hermesConfig.transport,
          requests: {
            total: requestMetrics.total,
            byMethod: { ...requestMetrics.byMethod },
            byStatus: { ...requestMetrics.byStatus },
            averageDurationMs: requestMetrics.total
              ? Math.round((requestMetrics.totalDurationMs / requestMetrics.total) * 100) / 100
              : 0,
          },
          sessions: {
            total: sessions.size,
            running: [...sessions.values()].filter((state) => state.session.status === "running")
              .length,
          },
          jobs: jobsByStatus,
          notifications: {
            unread: [...notifications.values()].filter((item) => !item.read).length,
          },
          artifacts: artifacts.size,
        });
        return;
      }
      await ensureReady();
      const rateLimitedBucket =
        request.method === "POST" && url.pathname === "/api/files"
          ? "files"
          : request.method === "POST" && url.pathname === "/api/policy/evaluate"
            ? "policy"
            : request.method === "POST" &&
                (url.pathname === "/api/sessions" ||
                  parts[3] === "messages" ||
                  parts[3] === "retry")
              ? "runs"
              : request.method === "POST" && parts[1] === "approvals"
                ? "approvals"
                : request.method === "POST" && parts[1] === "terminals"
                  ? "terminals"
                  : request.method === "POST" && parts[1] === "projects"
                    ? "projects"
                    : request.method === "POST" &&
                        parts[1] === "projects" &&
                        parts[3] === "credentials"
                      ? "credentials"
                      : undefined;
      if (rateLimitedBucket && !enforceRateLimit(request, rateLimitedBucket, response)) return;
      if (request.method === "GET" && url.pathname === "/api/sessions") {
        const query = url.searchParams.get("q") ?? "";
        const folderId = url.searchParams.get("folderId") ?? "";
        const includeArchived = url.searchParams.get("includeArchived") === "true";
        const visible = [...sessions.values()]
          .filter((state) => (includeArchived || !state.archived) && sessionMatches(state, query))
          .filter((state) => !folderId || state.folderId === folderId)
          .sort((left, right) => Number(Boolean(right.isPinned)) - Number(Boolean(left.isPinned)));
        json(response, 200, { sessions: visible.map((item) => sessionListPayload(item)) });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/folders") {
        json(response, 200, { folders: [...folders.values()] });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/folders") {
        const input = await body(request);
        if (typeof input.name !== "string" || !input.name.trim()) {
          json(response, 400, {
            error: { code: "INVALID_FOLDER", message: "Folder name is required." },
          });
          return;
        }
        const folder: FolderRecord = {
          id: `folder-${folders.size + 1}`,
          name: input.name.trim(),
          createdAt: new Date().toISOString(),
        };
        folders.set(folder.id, folder);
        await persistMetadata();
        json(response, 201, folder);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/models") {
        json(response, 200, { models: await adapter.listModels() });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/capabilities") {
        json(response, 200, { capabilities: await adapter.getCapabilities() });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/settings") {
        json(response, 200, settings);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/settings") {
        const input = await body(request);
        settings = normalizeSettings(input, settings);
        audit.push({ type: "settings.updated", at: new Date().toISOString() });
        await persistMetadata();
        json(response, 200, settings);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/projects") {
        const includeArchived = url.searchParams.get("includeArchived") === "true";
        json(response, 200, {
          projects: [...projects.values()].filter(
            (project) => includeArchived || !project.archived,
          ),
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/workspace") {
        const projectId = url.searchParams.get("projectId") ?? "";
        const project = projects.get(projectId);
        if (!project) {
          json(response, 404, {
            error: { code: "PROJECT_NOT_FOUND", message: "Choose a known project." },
          });
          return;
        }
        try {
          json(response, 200, {
            listing: await listWorkspace(project, url.searchParams.get("path") ?? undefined),
          });
        } catch (error) {
          json(response, 403, {
            error: {
              code: "WORKSPACE_ACCESS_DENIED",
              message:
                error instanceof Error ? error.message : "Workspace path could not be opened.",
            },
          });
        }
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/workspace/search") {
        const projectId = url.searchParams.get("projectId") ?? "";
        const query = url.searchParams.get("q") ?? "";
        const project = projects.get(projectId);
        if (!project) {
          json(response, 404, {
            error: { code: "PROJECT_NOT_FOUND", message: "Choose a known project." },
          });
          return;
        }
        if (!query.trim()) {
          json(response, 400, {
            error: { code: "MISSING_WORKSPACE_QUERY", message: "Search text is required." },
          });
          return;
        }
        try {
          json(response, 200, await searchWorkspace(project, query));
        } catch (error) {
          json(response, 403, {
            error: {
              code: "WORKSPACE_SEARCH_DENIED",
              message: error instanceof Error ? error.message : "Workspace search was rejected.",
            },
          });
        }
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/workspace/file") {
        const projectId = url.searchParams.get("projectId") ?? "";
        const requestedPath = url.searchParams.get("path") ?? "";
        const project = projects.get(projectId);
        if (!project || !requestedPath) {
          json(response, 400, {
            error: {
              code: "INVALID_WORKSPACE_FILE",
              message: "Project and file path are required.",
            },
          });
          return;
        }
        try {
          const content = await readWorkspaceFile(project, requestedPath);
          response.writeHead(200, {
            "content-type": "text/plain; charset=utf-8",
            "content-length": Buffer.byteLength(content),
            "cache-control": "private, no-store",
            "content-security-policy": "sandbox",
          });
          response.end(content);
        } catch (error) {
          json(response, 403, {
            error: {
              code: "WORKSPACE_FILE_DENIED",
              message: error instanceof Error ? error.message : "Workspace file could not be read.",
            },
          });
        }
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/edit-proposals") {
        const projectId = url.searchParams.get("projectId") ?? undefined;
        json(response, 200, {
          proposals: [...editProposals.values()].filter(
            (proposal) => !projectId || proposal.projectId === projectId,
          ),
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/workspace/proposals") {
        const input = await body(request, 1_100_000);
        const projectId = typeof input.projectId === "string" ? input.projectId : "";
        const path = typeof input.path === "string" ? input.path : "";
        const afterText = typeof input.afterText === "string" ? input.afterText : "";
        const project = projects.get(projectId);
        if (!project || !path) {
          json(response, 400, {
            error: {
              code: "INVALID_EDIT_PROPOSAL",
              message: "Project and file path are required.",
            },
          });
          return;
        }
        try {
          const evaluation = evaluateAction({
            policy: resolvePolicy(defaultPolicy, project.policy),
            action: "write",
            path,
            declaredPaths: project.paths,
          });
          if (evaluation.decision === "deny") {
            json(response, 403, { error: { code: "EDIT_DENIED", message: evaluation.reason } });
            return;
          }
          const proposal = await createEditProposal(project, path, afterText, projectId);
          editProposals.set(proposal.id, proposal);
          await persistMetadata();
          json(response, 201, { proposal, evaluation });
        } catch (error) {
          json(response, 403, {
            error: {
              code: "EDIT_PROPOSAL_FAILED",
              message:
                error instanceof Error ? error.message : "The edit proposal could not be created.",
            },
          });
        }
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "api" &&
        parts[1] === "edit-proposals" &&
        parts.length === 4 &&
        (parts[3] === "approve" || parts[3] === "reject")
      ) {
        const proposal = editProposals.get(parts[2]!);
        if (!proposal) {
          json(response, 404, {
            error: { code: "EDIT_PROPOSAL_NOT_FOUND", message: "Edit proposal was not found." },
          });
          return;
        }
        if (proposal.status !== "pending") {
          json(response, 409, {
            error: {
              code: "EDIT_PROPOSAL_DECIDED",
              message: "This edit proposal was already decided.",
            },
          });
          return;
        }
        if (parts[3] === "reject") {
          proposal.status = "rejected";
          proposal.decidedAt = new Date().toISOString();
          audit.push({
            type: "file.edit.rejected",
            proposalId: proposal.id,
            path: proposal.path,
            at: proposal.decidedAt,
          });
          await persistMetadata();
          json(response, 200, proposal);
          return;
        }
        const project = proposal.projectId ? projects.get(proposal.projectId) : undefined;
        if (!project) {
          json(response, 404, {
            error: { code: "PROJECT_NOT_FOUND", message: "The edit project was not found." },
          });
          return;
        }
        try {
          await applyEditProposal(project, proposal);
        } catch (error) {
          if (error instanceof Error && error.message.includes("changed since")) {
            proposal.status = "stale";
            proposal.decidedAt = new Date().toISOString();
            await persistMetadata();
            json(response, 409, {
              error: { code: "EDIT_PROPOSAL_STALE", message: error.message },
              proposal,
            });
            return;
          }
          throw error;
        }
        proposal.status = "approved";
        proposal.decidedAt = new Date().toISOString();
        audit.push({
          type: "file.edit.approved",
          proposalId: proposal.id,
          path: proposal.path,
          beforeHash: proposal.beforeHash,
          afterHash: proposal.afterHash,
          at: proposal.decidedAt,
        });
        await persistMetadata();
        json(response, 200, proposal);
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "api" &&
        parts[1] === "sessions" &&
        parts.length === 4 &&
        parts[3] === "policy"
      ) {
        const state = sessions.get(parts[2]!);
        if (!state) {
          json(response, 404, {
            error: { code: "SESSION_NOT_FOUND", message: "Conversation was not found." },
          });
          return;
        }
        const input = await body(request);
        if (
          input.mode !== "inherit" &&
          input.mode !== "ask" &&
          input.mode !== "safe" &&
          input.mode !== "autonomy"
        ) {
          json(response, 400, {
            error: {
              code: "INVALID_PERMISSION_MODE",
              message: "Conversation mode must be inherit, ask, safe, or autonomy.",
            },
          });
          return;
        }
        if (input.mode === "inherit") {
          delete state.permissionModeOverride;
          delete state.conversationPolicy;
        } else {
          state.permissionModeOverride = input.mode as PermissionMode;
          state.conversationPolicy = permissionPolicyForMode(state.permissionModeOverride);
        }
        audit.push({
          type: "conversation.permission_mode.updated",
          sessionId: state.session.id,
          permissionMode: input.mode,
          at: new Date().toISOString(),
        });
        await persistMetadata();
        json(response, 200, {
          ...sessionPayload(state),
          permissionModeOverride: state.permissionModeOverride ?? null,
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/projects") {
        const input = await body(request);
        const id = `project-${projects.size + 1}`;
        const project = normalizeProject(input, id);
        projects.set(id, project);
        await persistMetadata();
        json(response, 201, project);
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "api" &&
        parts[1] === "projects" &&
        parts.length === 3
      ) {
        const project = projects.get(parts[2]!);
        if (!project) {
          json(response, 404, {
            error: { code: "PROJECT_NOT_FOUND", message: "Project was not found." },
          });
          return;
        }
        const input = await body(request);
        const updated = normalizeProject({ ...project, ...input }, project.id);
        updated.createdAt = project.createdAt;
        updated.archived = project.archived;
        projects.set(updated.id, updated);
        audit.push({
          type: "project.updated",
          projectId: updated.id,
          at: new Date().toISOString(),
        });
        await persistMetadata();
        json(response, 200, updated);
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "api" &&
        parts[1] === "projects" &&
        parts.length === 4 &&
        parts[3] === "archive"
      ) {
        const project = projects.get(parts[2]!);
        if (!project) {
          json(response, 404, {
            error: { code: "PROJECT_NOT_FOUND", message: "Project was not found." },
          });
          return;
        }
        project.archived = true;
        audit.push({
          type: "project.archived",
          projectId: project.id,
          at: new Date().toISOString(),
        });
        await persistMetadata();
        json(response, 200, project);
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "api" &&
        parts[1] === "projects" &&
        parts.length === 4 &&
        parts[3] === "boundary"
      ) {
        const project = projects.get(parts[2]!);
        if (!project) {
          json(response, 404, {
            error: { code: "PROJECT_NOT_FOUND", message: "Project was not found." },
          });
          return;
        }
        const input = await body(request);
        const path = typeof input.path === "string" ? input.path.trim() : "";
        const host = typeof input.host === "string" ? input.host.trim() : "";
        if ((path && host) || (!path && !host)) {
          json(response, 400, {
            error: {
              code: "INVALID_BOUNDARY",
              message: "Provide exactly one absolute path or host to add.",
            },
          });
          return;
        }
        const approvalId = typeof input.approvalId === "string" ? input.approvalId : undefined;
        if (path) {
          if (!path.startsWith("/")) {
            json(response, 400, {
              error: { code: "INVALID_BOUNDARY", message: "A project path must be absolute." },
            });
            return;
          }
          const normalizedPath = resolve(path);
          if (!project.paths.includes(normalizedPath)) {
            project.paths.push(normalizedPath);
            audit.push({
              type: "project.boundary.expanded",
              projectId: project.id,
              path: normalizedPath,
              ...(approvalId ? { approvalId } : {}),
              at: new Date().toISOString(),
            });
            await persistMetadata();
          }
        } else {
          if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(host)) {
            json(response, 400, {
              error: { code: "INVALID_BOUNDARY", message: "Host contains unsupported characters." },
            });
            return;
          }
          if (!project.hosts.includes(host)) {
            project.hosts.push(host);
            audit.push({
              type: "project.boundary.expanded",
              projectId: project.id,
              host,
              ...(approvalId ? { approvalId } : {}),
              at: new Date().toISOString(),
            });
            await persistMetadata();
          }
        }
        json(response, 200, project);
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "api" &&
        parts[1] === "projects" &&
        parts.length === 4 &&
        parts[3] === "policy"
      ) {
        const project = projects.get(parts[2]!);
        if (!project) {
          json(response, 404, {
            error: { code: "PROJECT_NOT_FOUND", message: "Project was not found." },
          });
          return;
        }
        const input = await body(request);
        if (input.mode !== "ask" && input.mode !== "safe" && input.mode !== "autonomy") {
          json(response, 400, {
            error: {
              code: "INVALID_PERMISSION_MODE",
              message: "Permission mode must be ask, safe, or autonomy.",
            },
          });
          return;
        }
        const mode = input.mode as PermissionMode;
        project.permissionMode = mode;
        project.policy = permissionPolicyForMode(mode);
        audit.push({
          type: "project.permission_mode.updated",
          projectId: project.id,
          permissionMode: mode,
          at: new Date().toISOString(),
        });
        await persistMetadata();
        json(response, 200, project);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/terminals") {
        const input = await body(request);
        const projectId = typeof input.projectId === "string" ? input.projectId : "";
        const requestedPath = typeof input.cwd === "string" ? input.cwd : undefined;
        const host =
          typeof input.host === "string" && input.host.trim() ? input.host.trim() : "local";
        const credentialId =
          typeof input.credentialId === "string" ? input.credentialId.trim() : "";
        const project = projects.get(projectId);
        if (!project) {
          json(response, 404, {
            error: { code: "PROJECT_NOT_FOUND", message: "Choose a known project." },
          });
          return;
        }
        if (host !== "local" && !project.hosts.includes(host)) {
          json(response, 403, {
            error: {
              code: "TERMINAL_HOST_DENIED",
              message: "That terminal host is not declared by the project.",
            },
          });
          return;
        }
        let credentialLease: CredentialLease | undefined;
        if (credentialId) {
          const reference = credentialBroker.get(credentialId);
          if (!reference) {
            json(response, 404, {
              error: {
                code: "CREDENTIAL_NOT_FOUND",
                message: "Credential reference was not found.",
              },
            });
            return;
          }
          if (reference.projectId !== project.id) {
            json(response, 403, {
              error: {
                code: "CREDENTIAL_SCOPE_DENIED",
                message: "Credential reference is not approved for this project.",
              },
            });
            return;
          }
          if (host !== "local") {
            json(response, 409, {
              error: {
                code: "REMOTE_CREDENTIAL_INJECTION_UNSUPPORTED",
                message: "Temporary-file credentials can only be injected into local terminals.",
              },
            });
            return;
          }
          if (reference.injectionMethod !== "temporary_file") {
            json(response, 409, {
              error: {
                code: "CREDENTIAL_INJECTION_UNSUPPORTED",
                message: "Only temporary-file credential injection is supported for terminals.",
              },
            });
            return;
          }
          try {
            credentialLease = await credentialBroker.openLease(credentialId, { host });
          } catch (error) {
            json(response, 502, {
              error: {
                code: "CREDENTIAL_UNAVAILABLE",
                message: error instanceof Error ? error.message : "Credential provider failed.",
              },
            });
            return;
          }
        }
        try {
          const path =
            host === "local"
              ? (await listWorkspace(project, requestedPath)).path
              : requestedPath || project.paths[0];
          if (!path || (host !== "local" && !isDeclaredRemotePath(path, project.paths)))
            throw new Error("Terminal working directory is outside the project boundary.");
          const terminal = terminalManager.create(
            path,
            host,
            credentialLease
              ? {
                  environment: { FLANCOMMAND_CREDENTIAL_FILE: credentialLease.path },
                  onClose: credentialLease.close,
                }
              : {},
          );
          audit.push({
            type: "terminal.created",
            terminalId: terminal.id,
            path: terminal.cwd,
            host: terminal.host,
            at: terminal.createdAt,
          });
          if (credentialId)
            audit.push({
              type: "credential.used",
              credentialId,
              projectId: project.id,
              host,
              injectionMethod: "temporary_file",
              at: terminal.createdAt,
            });
          await persistMetadata();
          json(response, 201, terminal);
        } catch (error) {
          await credentialLease?.close();
          json(response, 403, {
            error: {
              code: "TERMINAL_CWD_DENIED",
              message:
                error instanceof Error ? error.message : "Terminal directory is not allowed.",
            },
          });
        }
        return;
      }
      if (
        request.method === "GET" &&
        parts[0] === "api" &&
        parts[1] === "terminals" &&
        parts.length === 4 &&
        parts[3] === "stream"
      ) {
        const terminal = terminalManager.get(parts[2]!);
        if (!terminal) {
          json(response, 404, {
            error: { code: "TERMINAL_NOT_FOUND", message: "Terminal session was not found." },
          });
          return;
        }
        response.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        try {
          sse(response, "snapshot", { text: terminalManager.history(terminal.id) });
          for await (const chunk of terminalManager.stream(terminal.id)) {
            if (response.destroyed) break;
            sse(response, "output", { text: chunk });
          }
          if (!response.destroyed)
            sse(response, "closed", { error: terminalManager.get(terminal.id)?.error });
        } finally {
          if (!response.destroyed) response.end();
        }
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "api" &&
        parts[1] === "terminals" &&
        parts.length === 4 &&
        parts[3] === "resize"
      ) {
        const input = await body(request, 10_000);
        try {
          terminalManager.resize(parts[2]!, input.cols as number, input.rows as number);
          json(response, 202, { ok: true });
        } catch (error) {
          json(response, 409, {
            error: {
              code: "TERMINAL_RESIZE_FAILED",
              message: error instanceof Error ? error.message : "Terminal resize was rejected.",
            },
          });
        }
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "api" &&
        parts[1] === "terminals" &&
        parts.length === 4 &&
        parts[3] === "input"
      ) {
        const input = await body(request, 100_000);
        if (typeof input.text !== "string") {
          json(response, 400, {
            error: { code: "INVALID_TERMINAL_INPUT", message: "Terminal input must be text." },
          });
          return;
        }
        try {
          terminalManager.write(parts[2]!, input.text);
          json(response, 202, { ok: true });
        } catch (error) {
          json(response, 409, {
            error: {
              code: "TERMINAL_WRITE_FAILED",
              message: error instanceof Error ? error.message : "Terminal input was rejected.",
            },
          });
        }
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "api" &&
        parts[1] === "terminals" &&
        parts.length === 4 &&
        parts[3] === "close"
      ) {
        try {
          terminalManager.close(parts[2]!);
          audit.push({
            type: "terminal.closed",
            terminalId: parts[2],
            at: new Date().toISOString(),
          });
          await persistMetadata();
          json(response, 200, { ok: true });
        } catch (error) {
          json(response, 404, {
            error: {
              code: "TERMINAL_NOT_FOUND",
              message: error instanceof Error ? error.message : "Terminal session was not found.",
            },
          });
        }
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/approvals") {
        json(response, 200, { approvals: [...approvals.values()] });
        return;
      }
      if (
        request.method === "GET" &&
        parts[0] === "api" &&
        parts[1] === "approvals" &&
        parts.length === 4 &&
        parts[3] === "review"
      ) {
        const token = url.searchParams.get("token") ?? "";
        const payload = approvalLinkSigner.verify(token);
        const approval = approvals.get(parts[2]!);
        if (!payload || payload.approvalId !== parts[2] || !approval) {
          json(response, 404, {
            error: {
              code: "APPROVAL_LINK_INVALID",
              message: "This approval link is invalid or expired.",
            },
          });
          return;
        }
        json(response, 200, { approval, expiresAt: payload.expiresAt });
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "api" &&
        parts[1] === "approvals" &&
        parts.length === 4 &&
        (parts[3] === "approve" || parts[3] === "deny")
      ) {
        const input = await body(request);
        const approval = approvals.get(parts[2]!);
        if (!approval) {
          json(response, 404, {
            error: { code: "APPROVAL_NOT_FOUND", message: "This approval was not found." },
          });
          return;
        }
        if (approval.decision !== "pending") {
          json(response, 409, {
            error: {
              code: "APPROVAL_ALREADY_DECIDED",
              message: "This approval was already decided.",
            },
          });
          return;
        }
        const decision = parts[3] === "approve" ? "approve" : "deny";
        if (decision === "approve") await adapter.approveAction(approval.id, approval.sessionId);
        else
          await adapter.denyAction(
            approval.id,
            typeof input.reason === "string" ? input.reason : "Denied from FlanCommand.",
            approval.sessionId,
          );
        approval.decision = decision === "approve" ? "approved" : "denied";
        await persistMetadata();
        json(response, 200, approval);
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "api" &&
        parts[1] === "approvals" &&
        parts.length === 4 &&
        parts[3] === "review"
      ) {
        const input = await body(request);
        const token = typeof input.token === "string" ? input.token : "";
        const decision =
          input.decision === "approve" || input.decision === "deny" ? input.decision : undefined;
        const payload = approvalLinkSigner.verify(token);
        const approval = approvals.get(parts[2]!);
        if (!payload || payload.approvalId !== parts[2] || !approval) {
          json(response, 404, {
            error: {
              code: "APPROVAL_LINK_INVALID",
              message: "This approval link is invalid or expired.",
            },
          });
          return;
        }
        if (!decision) {
          json(response, 400, {
            error: { code: "INVALID_DECISION", message: "Decision must be approve or deny." },
          });
          return;
        }
        if (approval.decision !== "pending") {
          json(response, 409, {
            error: {
              code: "APPROVAL_ALREADY_DECIDED",
              message: "This approval was already decided.",
            },
          });
          return;
        }
        if (decision === "approve") await adapter.approveAction(approval.id, approval.sessionId);
        else
          await adapter.denyAction(
            approval.id,
            typeof input.reason === "string" ? input.reason : "Denied from review link.",
            approval.sessionId,
          );
        approval.decision = decision === "approve" ? "approved" : "denied";
        approvalLinkSigner.consume(token);
        await persistMetadata();
        json(response, 200, approval);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/audit") {
        json(response, 200, { audit: [...audit] });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/jobs") {
        json(response, 200, { jobs: [...jobs.values()] });
        return;
      }
      if (request.method === "DELETE" && url.pathname === "/api/notifications") {
        notifications.clear();
        await persistMetadata();
        response.writeHead(204);
        response.end();
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/notifications") {
        json(response, 200, { notifications: [...notifications.values()] });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/credentials") {
        json(response, 200, { credentials: credentialBroker.list() });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/credentials/health") {
        json(response, 200, {
          health: await credentialBroker.health(url.searchParams.get("projectId") ?? undefined),
        });
        return;
      }
      if (
        request.method === "GET" &&
        parts[0] === "api" &&
        parts[1] === "projects" &&
        parts.length === 4 &&
        parts[3] === "credentials"
      ) {
        if (!projects.has(parts[2]!)) {
          json(response, 404, {
            error: { code: "PROJECT_NOT_FOUND", message: "Project was not found." },
          });
          return;
        }
        json(response, 200, { credentials: credentialBroker.list(parts[2]) });
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "api" &&
        parts[1] === "projects" &&
        parts.length === 4 &&
        parts[3] === "credentials"
      ) {
        const projectId = parts[2]!;
        if (!projects.has(projectId)) {
          json(response, 404, {
            error: { code: "PROJECT_NOT_FOUND", message: "Project was not found." },
          });
          return;
        }
        const input = await body(request);
        const injectionMethod = input.injectionMethod;
        if (
          typeof input.name !== "string" ||
          typeof input.provider !== "string" ||
          typeof input.externalSecretId !== "string" ||
          typeof input.purpose !== "string" ||
          !["environment", "stdin", "temporary_file", "ssh_agent"].includes(String(injectionMethod))
        ) {
          json(response, 400, {
            error: {
              code: "INVALID_CREDENTIAL_REFERENCE",
              message:
                "Name, provider, secret reference, purpose, and injection method are required.",
            },
          });
          return;
        }
        const now = new Date().toISOString();
        const reference: CredentialReference = {
          id: `credential-${credentialBroker.list().length + 1}`,
          projectId,
          name: input.name.trim(),
          provider: input.provider.trim(),
          externalSecretId: input.externalSecretId.trim(),
          purpose: input.purpose.trim(),
          allowedHosts: Array.isArray(input.allowedHosts)
            ? input.allowedHosts.filter(
                (value): value is string => typeof value === "string" && value.length > 0,
              )
            : [],
          injectionMethod: injectionMethod as CredentialReference["injectionMethod"],
          createdAt: now,
          updatedAt: now,
        };
        credentialBroker.set(reference);
        audit.push({ type: "credential.reference.created", credentialId: reference.id, at: now });
        await persistMetadata();
        json(response, 201, reference);
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "api" &&
        parts[1] === "credentials" &&
        parts.length === 4 &&
        parts[3] === "validate"
      ) {
        const reference = credentialBroker.get(parts[2]!);
        if (!reference) {
          json(response, 404, {
            error: { code: "CREDENTIAL_NOT_FOUND", message: "Credential reference was not found." },
          });
          return;
        }
        try {
          await credentialBroker.validate(reference.id);
        } catch (error) {
          json(response, 502, {
            error: {
              code: "CREDENTIAL_UNAVAILABLE",
              message: error instanceof Error ? error.message : "Credential provider failed.",
            },
          });
          return;
        }
        audit.push({
          type: "credential.reference.validated",
          credentialId: reference.id,
          at: new Date().toISOString(),
        });
        await persistMetadata();
        json(response, 200, reference);
        return;
      }
      if (
        request.method === "DELETE" &&
        parts[0] === "api" &&
        parts[1] === "notifications" &&
        parts.length === 3
      ) {
        const notification = notifications.get(parts[2]!);
        if (!notification) {
          json(response, 404, {
            error: { code: "NOTIFICATION_NOT_FOUND", message: "Notification was not found." },
          });
          return;
        }
        notifications.delete(notification.id);
        await persistMetadata();
        response.writeHead(204);
        response.end();
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "api" &&
        parts[1] === "notifications" &&
        parts.length === 4 &&
        parts[3] === "read"
      ) {
        const notification = notifications.get(parts[2]!);
        if (!notification) {
          json(response, 404, {
            error: { code: "NOTIFICATION_NOT_FOUND", message: "Notification was not found." },
          });
          return;
        }
        notification.read = true;
        await persistMetadata();
        json(response, 200, notification);
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "api" &&
        parts[1] === "jobs" &&
        parts.length === 4 &&
        parts[3] === "provide-credential"
      ) {
        const job = jobs.get(parts[2]!);
        if (!job) {
          json(response, 404, { error: { code: "JOB_NOT_FOUND", message: "Job was not found." } });
          return;
        }
        if (job.status !== "waiting_for_credential" || !job.credentialRequest?.requestId) {
          json(response, 409, {
            error: {
              code: "CREDENTIAL_REQUEST_UNAVAILABLE",
              message: "This job is not waiting for a native credential.",
            },
          });
          return;
        }
        const input = await body(request);
        const credentialId =
          typeof input.credentialId === "string" ? input.credentialId.trim() : "";
        const reference = credentialId ? credentialBroker.get(credentialId) : undefined;
        if (!reference) {
          json(response, 404, {
            error: { code: "CREDENTIAL_NOT_FOUND", message: "Credential reference was not found." },
          });
          return;
        }
        const state = job.sessionId ? sessions.get(job.sessionId) : undefined;
        if (!state || reference.projectId !== (state.projectId ?? "project-local")) {
          json(response, 403, {
            error: {
              code: "CREDENTIAL_SCOPE_DENIED",
              message: "Credential reference is not approved for this project.",
            },
          });
          return;
        }
        try {
          const value = await credentialBroker.resolve(reference.id);
          await adapter.provideCredential(job.sessionId!, job.credentialRequest.requestId, value);
          await updateJob(job, { status: "running", credentialRequest: undefined });
          audit.push({
            type: "credential.responded",
            credentialId: reference.id,
            sessionId: job.sessionId,
            at: new Date().toISOString(),
          });
          audit.push({
            type: "credential.used",
            credentialId: reference.id,
            projectId: reference.projectId,
            host: "hermes",
            injectionMethod: "native_secret_request",
            at: new Date().toISOString(),
          });
          await persistMetadata();
          json(response, 202, job);
        } catch {
          json(response, 502, {
            error: { code: "CREDENTIAL_UNAVAILABLE", message: "Credential provider failed." },
          });
        }
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "api" &&
        parts[1] === "jobs" &&
        parts.length === 4 &&
        parts[3] === "cancel"
      ) {
        const job = jobs.get(parts[2]!);
        if (!job) {
          json(response, 404, { error: { code: "JOB_NOT_FOUND", message: "Job was not found." } });
          return;
        }
        if (!job.runId) jobQueue.cancel(job.id);
        if (job.runId) await adapter.stopRun(job.runId, job.sessionId);
        await updateJob(job, { status: "canceled" });
        json(response, 202, job);
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "api" &&
        parts[1] === "jobs" &&
        parts.length === 4 &&
        (parts[3] === "retry" || parts[3] === "duplicate")
      ) {
        const source = jobs.get(parts[2]!);
        if (!source) {
          json(response, 404, { error: { code: "JOB_NOT_FOUND", message: "Job was not found." } });
          return;
        }
        const action = parts[3];
        const retryable = ["failed", "paused", "canceled"].includes(source.status);
        const duplicable = !["running", "queued"].includes(source.status);
        if ((action === "retry" && !retryable) || (action === "duplicate" && !duplicable)) {
          json(response, 409, {
            error: {
              code: "JOB_ACTION_UNAVAILABLE",
              message:
                action === "retry"
                  ? "Only failed, paused, or canceled jobs can be retried."
                  : "Running jobs cannot be duplicated.",
            },
          });
          return;
        }
        if (!source.prompt || !source.sessionId) {
          json(response, 409, {
            error: {
              code: "JOB_PROMPT_UNAVAILABLE",
              message: "This older job has no saved prompt to duplicate.",
            },
          });
          return;
        }
        const state = sessions.get(source.sessionId);
        if (!state) {
          json(response, 409, {
            error: { code: "SESSION_NOT_FOUND", message: "The job's conversation is unavailable." },
          });
          return;
        }
        const prompt = source.prompt;
        const job = createJob(state, source.sessionId, prompt, source.attachments);
        await persistMetadata();
        void jobQueue.enqueue(job.id, async () => {
          await updateJob(job, { status: "running" });
          await runJob(job, state, prompt);
        });
        json(response, 202, job);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/files") {
        json(response, 200, {
          files: fileStore
            .list({
              projectId: url.searchParams.get("projectId") ?? undefined,
              sessionId: url.searchParams.get("sessionId") ?? undefined,
              search: url.searchParams.get("search") ?? undefined,
            })
            .map(publicFile),
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/files") {
        const input = await body(request, 15 * 1024 * 1024);
        if (
          typeof input.name !== "string" ||
          typeof input.mimeType !== "string" ||
          typeof input.contentBase64 !== "string"
        ) {
          json(response, 400, {
            error: {
              code: "INVALID_FILE",
              message: "Name, MIME type, and base64 content are required.",
            },
          });
          return;
        }
        let content: Buffer;
        try {
          content = Buffer.from(input.contentBase64, "base64");
        } catch {
          throw new ApiError(400, "File content is not valid base64.");
        }
        let record: FileRecord;
        try {
          const expiresAt =
            typeof input.expiresAt === "string"
              ? input.expiresAt
              : new Date(Date.now() + settings.retentionDays * 24 * 60 * 60 * 1000).toISOString();
          record = await fileStore.put({
            name: input.name,
            mimeType: input.mimeType,
            content,
            ...(typeof input.projectId === "string" ? { projectId: input.projectId } : {}),
            ...(typeof input.sessionId === "string" ? { sessionId: input.sessionId } : {}),
            expiresAt,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "File could not be stored.";
          throw new ApiError(message.includes("large") ? 413 : 415, message);
        }
        audit.push({ type: "file.uploaded", fileId: record.id, at: new Date().toISOString() });
        await persistMetadata();
        json(response, 201, publicFile(record));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/files/retention") {
        const removed = await fileStore.removeExpired();
        for (const fileId of removed)
          audit.push({ type: "file.expired", fileId, at: new Date().toISOString() });
        await persistMetadata();
        json(response, 200, { removed });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/artifacts") {
        json(response, 200, {
          artifacts: [...artifacts.values()].map((artifact) => ({
            ...artifact,
            file: fileStore.get(artifact.fileId)
              ? publicFile(fileStore.get(artifact.fileId)!)
              : undefined,
          })),
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/artifacts") {
        const input = await body(request);
        if (typeof input.fileId !== "string" || !fileStore.get(input.fileId)) {
          json(response, 400, {
            error: { code: "FILE_NOT_FOUND", message: "Register an existing file as an artifact." },
          });
          return;
        }
        const artifact: ArtifactRecord = {
          id: `artifact-${artifacts.size + 1}`,
          fileId: input.fileId,
          name: typeof input.name === "string" ? input.name : fileStore.get(input.fileId)!.safeName,
          artifactType:
            input.artifactType === "image" ||
            input.artifactType === "document" ||
            input.artifactType === "link" ||
            input.artifactType === "file"
              ? input.artifactType
              : "unknown",
          createdAt: new Date().toISOString(),
        };
        artifacts.set(artifact.id, artifact);
        audit.push({
          type: "artifact.created",
          artifactId: artifact.id,
          fileId: artifact.fileId,
          at: artifact.createdAt,
        });
        await persistMetadata();
        json(response, 201, artifact);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/policy/evaluate") {
        const input = await body(request);
        const action = input.action;
        if (
          action !== "read" &&
          action !== "write" &&
          action !== "command" &&
          action !== "network"
        ) {
          json(response, 400, {
            error: {
              code: "INVALID_ACTION",
              message: "Action must be read, write, command, or network.",
            },
          });
          return;
        }
        const project =
          typeof input.projectId === "string" ? projects.get(input.projectId) : undefined;
        const conversationPolicy =
          typeof input.conversationPolicy === "object" &&
          input.conversationPolicy !== null &&
          !Array.isArray(input.conversationPolicy)
            ? (input.conversationPolicy as Partial<Policy>)
            : typeof input.sessionId === "string"
              ? sessions.get(input.sessionId)?.conversationPolicy
              : undefined;
        const evaluation = evaluateAction({
          policy: resolvePolicy(defaultPolicy, project?.policy, conversationPolicy),
          action,
          path: typeof input.path === "string" ? input.path : undefined,
          host: typeof input.host === "string" ? input.host : undefined,
          declaredPaths: project?.paths,
          declaredHosts: project?.hosts,
        });
        let approval: ApprovalRecord | undefined;
        if (evaluation.decision === "approval") {
          const createdAt = new Date().toISOString();
          const actionHash = createHash("sha256")
            .update(
              JSON.stringify({
                action,
                path: input.path,
                host: input.host,
                projectId: input.projectId,
              }),
            )
            .digest("hex");
          approval = {
            id: `approval-${approvalSequence++}`,
            actionHash,
            action,
            description: evaluation.reason,
            details: {
              ...(typeof input.path === "string" ? { path: input.path } : {}),
              ...(typeof input.host === "string" ? { host: input.host } : {}),
              ...(typeof input.projectId === "string" ? { projectId: input.projectId } : {}),
            },
            ...(typeof input.sessionId === "string" ? { sessionId: input.sessionId } : {}),
            ...(typeof input.projectId === "string" ? { projectId: input.projectId } : {}),
            evaluation,
            decision: "pending",
            createdAt,
          };
          approvals.set(approval.id, approval);
          const reviewUrl = approvalReviewUrl(approval.id);
          await notify(
            {
              kind: "approval",
              title: "Approval required",
              body: approval.description,
              approvalId: approval.id,
              reviewUrl,
            },
            { title: "Approval required", body: approval.description, url: reviewUrl },
          );
          await persistMetadata();
          json(response, 200, { evaluation, approval, reviewUrl });
          return;
        }
        json(response, 200, { evaluation });
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "api" &&
        parts[1] === "approvals" &&
        parts.length === 4 &&
        (parts[3] === "approve" || parts[3] === "deny")
      ) {
        const approval = approvals.get(parts[2]!);
        if (!approval) {
          json(response, 404, {
            error: { code: "APPROVAL_NOT_FOUND", message: "Approval request was not found." },
          });
          return;
        }
        if (approval.decision !== "pending") {
          json(response, 409, {
            error: {
              code: "APPROVAL_ALREADY_DECIDED",
              message: "This approval was already decided.",
            },
          });
          return;
        }
        if (parts[3] === "approve") await adapter.approveAction(approval.id, approval.sessionId);
        else await adapter.denyAction(approval.id, "Denied in FlanCommand.", approval.sessionId);
        approval.decision = parts[3] === "approve" ? "approved" : "denied";
        await persistMetadata();
        json(response, 200, approval);
        return;
      }
      if (parts[0] === "api" && parts[1] === "files" && parts.length >= 3) {
        const record = fileStore.get(parts[2]!);
        if (!record) {
          json(response, 404, {
            error: { code: "FILE_NOT_FOUND", message: "File was not found." },
          });
          return;
        }
        if (request.method === "DELETE" && parts.length === 3) {
          await fileStore.remove(record.id);
          audit.push({ type: "file.deleted", fileId: record.id, at: new Date().toISOString() });
          await persistMetadata();
          json(response, 200, { ok: true });
          return;
        }
        if (request.method === "GET" && (parts[3] === "preview" || parts[3] === "download")) {
          const content = await fileStore.content(record.id);
          if (!content) {
            json(response, 404, {
              error: { code: "FILE_CONTENT_NOT_FOUND", message: "File content was not found." },
            });
            return;
          }
          const isPreview = parts[3] === "preview";
          if (isPreview && !fileStore.isPreviewable(record)) {
            json(response, 415, {
              error: {
                code: "PREVIEW_UNSUPPORTED",
                message: "This file type cannot be previewed safely.",
              },
            });
            return;
          }
          const contentType =
            isPreview && record.mimeType.startsWith("text/")
              ? "text/plain; charset=utf-8"
              : record.mimeType;
          response.writeHead(200, {
            "content-type": contentType,
            "content-length": content.byteLength,
            "cache-control": "private, no-store",
            "content-security-policy": "sandbox",
            "content-disposition": isPreview
              ? "inline"
              : `attachment; filename="${record.safeName}"`,
          });
          response.end(content);
          return;
        }
      }
      if (parts[0] === "api" && parts[1] === "artifacts" && parts.length >= 3) {
        const artifact = artifacts.get(parts[2]!);
        if (!artifact) {
          json(response, 404, {
            error: { code: "ARTIFACT_NOT_FOUND", message: "Artifact was not found." },
          });
          return;
        }
        const record = fileStore.get(artifact.fileId);
        if (!record) {
          json(response, 404, {
            error: { code: "FILE_NOT_FOUND", message: "Artifact file was not found." },
          });
          return;
        }
        if (request.method === "GET" && parts.length === 3) {
          json(response, 200, { ...artifact, file: publicFile(record) });
          return;
        }
        if (request.method === "GET" && (parts[3] === "preview" || parts[3] === "download")) {
          const content = await fileStore.content(record.id);
          if (!content) {
            json(response, 404, {
              error: { code: "FILE_CONTENT_NOT_FOUND", message: "Artifact content was not found." },
            });
            return;
          }
          if (parts[3] === "preview" && !fileStore.isPreviewable(record)) {
            json(response, 415, {
              error: {
                code: "PREVIEW_UNSUPPORTED",
                message: "This artifact type cannot be previewed safely.",
              },
            });
            return;
          }
          response.writeHead(200, {
            "content-type":
              parts[3] === "preview" && record.mimeType.startsWith("text/")
                ? "text/plain; charset=utf-8"
                : record.mimeType,
            "content-length": content.byteLength,
            "cache-control": "private, no-store",
            "content-security-policy": "sandbox",
            "content-disposition":
              parts[3] === "preview" ? "inline" : `attachment; filename="${record.safeName}"`,
          });
          response.end(content);
          return;
        }
      }
      if (request.method === "POST" && url.pathname === "/api/sessions") {
        const input = await body(request);
        const session = await adapter.createSession({
          title: typeof input.title === "string" ? input.title : undefined,
          modelId:
            typeof input.modelId === "string" && input.modelId
              ? input.modelId
              : settings.defaultModel || undefined,
        });
        const state = {
          session: { ...session },
          messages: [],
          skipResume: true,
        } satisfies SessionState;
        sessions.set(session.id, state);
        await persistMetadata();
        json(response, 201, sessionPayload(state));
        return;
      }
      if (
        request.method === "GET" &&
        parts[0] === "api" &&
        parts[1] === "projects" &&
        parts.length === 3
      ) {
        const project = projects.get(parts[2]!);
        if (!project) {
          json(response, 404, {
            error: { code: "PROJECT_NOT_FOUND", message: "Project was not found." },
          });
          return;
        }
        json(response, 200, project);
        return;
      }
      const sessionId = parts[2];
      const state = sessionId ? sessions.get(sessionId) : undefined;
      if (!sessionId || !state || parts[0] !== "api" || parts[1] !== "sessions") {
        json(response, 404, {
          error: { code: "NOT_FOUND", message: "That command center resource was not found." },
        });
        return;
      }
      if (request.method === "GET" && parts.length === 3) {
        if (state.messages.length === 0 && !state.skipResume) {
          const resumed = await adapter.resumeSession(state.session.id);
          if (resumed.history) {
            state.messages = resumed.history.map((message, index) => ({
              id: `hermes-history-${index}`,
              role: message.role,
              text: message.text,
              at: new Date().toISOString(),
              status: "complete",
            }));
          }
        }
        json(response, 200, sessionPayload(state));
        return;
      }
      if (request.method === "POST" && parts.length === 4 && parts[3] === "reconnect") {
        const input = await body(request);
        const resumed = await adapter.resumeSession(state.session.id);
        state.session = { ...state.session, ...resumed };
        state.activeRunId = resumed.status === "running" ? state.activeRunId : undefined;
        const historyRestored = Boolean(resumed.history?.length);
        if (historyRestored) {
          state.messages = resumed.history!.map((message, index) => ({
            id: `hermes-history-${index}`,
            role: message.role,
            text: message.text,
            at: new Date().toISOString(),
            status: "complete",
          }));
        }
        const latestJob = [...jobs.values()]
          .filter((job) => job.sessionId === state.session.id)
          .at(-1);
        const after =
          typeof input.after === "number" && Number.isFinite(input.after)
            ? Math.max(0, Math.floor(input.after))
            : 0;
        const replay = latestJob ? (runEventLog.get(latestJob.id) ?? []).slice(after) : [];
        await persistMetadata();
        json(response, 200, {
          ...sessionPayload(state),
          reconnect: { historyRestored, status: resumed.status },
          replay,
        });
        return;
      }
      if (request.method === "POST" && parts.length === 4 && parts[3] === "organization") {
        const input = await body(request);
        if (input.folderId !== undefined && input.folderId !== null) {
          if (typeof input.folderId !== "string" || !folders.has(input.folderId)) {
            json(response, 400, {
              error: { code: "FOLDER_NOT_FOUND", message: "Choose a known folder." },
            });
            return;
          }
          state.folderId = input.folderId;
        } else if (input.folderId === null) state.folderId = undefined;
        if (typeof input.customTitle === "string") {
          const title = input.customTitle.trim();
          state.customTitle = title || undefined;
        } else if (input.customTitle === null) state.customTitle = undefined;
        if (typeof input.isPinned === "boolean") state.isPinned = input.isPinned;
        if (typeof input.archived === "boolean") state.archived = input.archived;
        await persistMetadata();
        json(response, 200, sessionPayload(state));
        return;
      }
      if (request.method === "GET" && parts.length === 4 && parts[3] === "commands") {
        json(response, 200, { commands: await adapter.listCommands(sessionId) });
        return;
      }
      if (request.method === "POST" && parts.length === 4 && parts[3] === "project") {
        const input = await body(request);
        if (typeof input.projectId !== "string" || !projects.has(input.projectId)) {
          json(response, 400, {
            error: { code: "PROJECT_NOT_FOUND", message: "Choose a known project." },
          });
          return;
        }
        state.projectId = input.projectId;
        await persistMetadata();
        json(response, 200, sessionPayload(state));
        return;
      }
      if (request.method === "POST" && parts.length === 4 && parts[3] === "stop") {
        const input = await body(request);
        const runId = typeof input.runId === "string" ? input.runId : state.activeRunId;
        if (runId) await adapter.stopRun(runId, sessionId);
        const job = [...jobs.values()].find(
          (item) =>
            item.sessionId === sessionId &&
            (!runId || item.runId === runId) &&
            [
              "queued",
              "running",
              "waiting_for_approval",
              "waiting_for_credential",
              "paused",
            ].includes(item.status),
        );
        if (job) await updateJob(job, { status: "canceled" });
        json(response, 202, { ok: true });
        return;
      }
      if (request.method === "POST" && parts.length === 4 && parts[3] === "retry") {
        const input = await body(request);
        if (typeof input.turnId !== "string" || !input.turnId) {
          json(response, 400, {
            error: { code: "MISSING_TURN", message: "A turn ID is required to retry." },
          });
          return;
        }
        const assistantIndex = state.messages.findIndex(
          (message) => message.role === "assistant" && message.turnId === input.turnId,
        );
        const userMessage =
          assistantIndex > 0 && state.messages[assistantIndex - 1]?.role === "user"
            ? state.messages[assistantIndex - 1]
            : undefined;
        if (!userMessage) {
          json(response, 409, {
            error: {
              code: "RETRY_PROMPT_NOT_FOUND",
              message: "The original prompt is unavailable.",
            },
          });
          return;
        }
        await adapter.retryTurn(sessionId, input.turnId);
        state.messages = state.messages.slice(0, assistantIndex - 1);
        await persistMetadata();
        json(response, 202, { ok: true, text: userMessage.text });
        return;
      }
      if (request.method === "POST" && parts.length === 4 && parts[3] === "model") {
        const input = await body(request);
        if (typeof input.modelId !== "string" || !input.modelId) {
          json(response, 400, {
            error: { code: "MISSING_MODEL", message: "A model ID is required." },
          });
          return;
        }
        await adapter.setSessionModel(sessionId, input.modelId);
        state.session.modelId = input.modelId;
        json(response, 200, sessionPayload(state));
        return;
      }
      if (request.method === "POST" && parts.length === 4 && parts[3] === "memory") {
        const input = await body(request);
        const command = typeof input.command === "string" ? input.command.trim() : "/memory";
        if (!/^\/memory(?:\s+(?:pending|approval))?$/u.test(command)) {
          json(response, 400, {
            error: {
              code: "INVALID_MEMORY_COMMAND",
              message: "Only /memory, /memory pending, and /memory approval are supported.",
            },
          });
          return;
        }
        try {
          await adapter.resumeSession(sessionId);
        } catch (error) {
          if (state.messages.length > 0) throw error;
          // A freshly created Hermes session may not have a durable resume ID
          // yet. It can still accept slash commands on its live connection.
        }
        let output = "";
        for await (const event of adapter.dispatchCommand(sessionId, command)) {
          if (event.type === "message.delta") output += event.text;
        }
        json(response, 200, { source: "hermes", command, output });
        return;
      }
      if (request.method === "POST" && parts.length === 4 && parts[3] === "messages") {
        const input = await body(request);
        const text = typeof input.text === "string" ? input.text.trim() : "";
        const requestedFileIds = Array.isArray(input.fileIds)
          ? input.fileIds.filter((value): value is string => typeof value === "string")
          : [];
        if (requestedFileIds.length > 4) {
          json(response, 400, {
            error: {
              code: "TOO_MANY_ATTACHMENTS",
              message: "Attach up to four files per message.",
            },
          });
          return;
        }
        const fileIds = [...new Set(requestedFileIds)];
        if (!text) {
          json(response, 400, {
            error: { code: "EMPTY_MESSAGE", message: "Write a message before sending." },
          });
          return;
        }
        if (text.startsWith("/") && fileIds.length) {
          json(response, 400, {
            error: {
              code: "ATTACHMENTS_NOT_SUPPORTED",
              message: "Slash commands cannot include file attachments.",
            },
          });
          return;
        }
        for (const fileId of fileIds) {
          const record = fileStore.get(fileId);
          if (!record) {
            json(response, 404, {
              error: { code: "FILE_NOT_FOUND", message: "One attached file was not found." },
            });
            return;
          }
          if (
            (record.projectId && record.projectId !== (state.projectId ?? "project-local")) ||
            (record.sessionId && record.sessionId !== sessionId)
          ) {
            json(response, 403, {
              error: {
                code: "FILE_SCOPE_DENIED",
                message: "One attached file is outside this conversation.",
              },
            });
            return;
          }
        }
        const hadPersistedMessages = state.messages.length > 0;
        const job = createJob(state, sessionId, text, fileIds);
        await persistMetadata();
        response.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        sse(response, "message", state.messages[state.messages.length - 1]);
        await jobQueue.enqueue(job.id, async () => {
          await updateJob(job, { status: "running" });
          await runJob(job, state, text, response, hadPersistedMessages);
        });
        if (!response.destroyed && job.status === "canceled") response.end();
        return;
      }
      json(response, 404, {
        error: { code: "NOT_FOUND", message: "That command center resource was not found." },
      });
    } catch (error) {
      json(
        response,
        error instanceof ApiError ? error.status : error instanceof HermesAdapterError ? 502 : 500,
        { error: safeError(error) },
      );
    }
  });
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isEphemeralSessionId(id: string): boolean {
  return /^[a-f0-9]{8}$/i.test(id);
}

function safeError(error: unknown): SafeError {
  if (error instanceof HermesAdapterError) return error.toSafeError();
  if (error instanceof ApiError)
    return { code: "INVALID_REQUEST", message: error.message, component: "api", retryable: false };
  return {
    code: "API_FAILURE",
    message: "The command center could not complete that request.",
    component: "api",
    retryable: true,
  };
}
