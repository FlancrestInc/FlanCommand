import type { Server } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AgentEvent, HermesSession } from "@flancommand/event-schema";
import { HermesAdapterError, type HermesAdapter } from "@flancommand/hermes-adapter";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiServer } from "./server.js";
import { FileStore } from "./file-store.js";
import { TerminalManager } from "./terminal.js";
import type { CredentialProvider } from "./credential-broker.js";

const sessions: HermesSession[] = [
  { id: "session-1", title: "First session", source: "hermes", status: "idle" },
];

function makeAdapter(
  events: AgentEvent[] = [],
  missingResume = false,
): HermesAdapter & {
  resumed: string[];
  connects: number;
  retried: string[];
  stopped: string[];
  sent: string[];
  provided: Array<{ sessionId: string; requestId: string; value: string }>;
  attached: Array<{ kind: string; sessionId: string; name: string; contentBase64: string }>;
} {
  const stopped: string[] = [];
  const resumed: string[] = [];
  let connects = 0;
  const retried: string[] = [];
  const sent: string[] = [];
  const provided: Array<{ sessionId: string; requestId: string; value: string }> = [];
  const attached: Array<{ kind: string; sessionId: string; name: string; contentBase64: string }> =
    [];
  return {
    stopped,
    resumed,
    get connects() {
      return connects;
    },
    retried,
    sent,
    provided,
    attached,
    connect: async () => {
      connects += 1;
    },
    disconnect: async () => {},
    getCapabilities: async () => ({
      sessions: { status: "observed" },
      streaming: { status: "observed" },
      commands: { status: "unsupported" },
      models: { status: "unsupported" },
      approvals: { status: "unsupported" },
      clarifications: { status: "unsupported" },
      reconnect: { status: "unsupported" },
      artifacts: { status: "unsupported" },
      memory: { status: "unsupported" },
      usage: { status: "unsupported" },
      context: { status: "unsupported" },
      stop: { status: "observed" },
      retry: { status: "unsupported" },
      rename: { status: "unsupported" },
      modelSelection: { status: "unsupported" },
    }),
    listSessions: async () => sessions,
    getSession: async (id) => sessions.find((session) => session.id === id) ?? sessions[0]!,
    createSession: async (input) => ({
      id: "session-new",
      title: input?.title ?? "New session",
      source: "hermes",
      status: "idle",
    }),
    resumeSession: async (id) => {
      resumed.push(id);
      if (missingResume)
        throw new HermesAdapterError({
          code: "TRANSPORT_REQUEST_FAILED",
          message: "Hermes WebSocket transport failed: 4007: session not found",
          operation: "resumeSession",
          retryable: true,
        });
      return {
        id,
        source: "hermes",
        status: "idle",
        history: retried.length
          ? []
          : [
              { role: "user", text: "Restored question" },
              { role: "assistant", text: "Restored answer" },
            ],
      };
    },
    renameSession: async () => {},
    sendMessage: async function* (_sessionId, input) {
      sent.push(input.text);
      for (const event of events) yield event;
    },
    stopRun: async (runId) => {
      stopped.push(runId);
    },
    retryTurn: async (_sessionId, turnId) => {
      retried.push(turnId);
    },
    dispatchCommand: async function* () {
      for (const event of events) yield event;
    },
    listCommands: async () => [],
    listModels: async () => [],
    setSessionModel: async () => {},
    approveAction: async () => {},
    denyAction: async () => {},
    provideCredential: async (sessionId, requestId, value) => {
      provided.push({ sessionId, requestId, value });
    },
    attachFile: async (sessionId, input) => {
      attached.push({ kind: "file", sessionId, ...input });
      return { attached: true, refText: `@file:${input.name}` };
    },
    attachImage: async (sessionId, input) => {
      attached.push({ kind: "image", sessionId, ...input });
      return { attached: true, refText: `@image:${input.name}` };
    },
  };
}

let server: Server | undefined;
const tempRoots: string[] = [];

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })),
  );
});

async function start(
  adapter?: HermesAdapter,
  fileStore?: FileStore,
  terminalManager?: TerminalManager,
  metadataPath?: string,
  credentialProviders?: CredentialProvider[],
): Promise<string> {
  const metadataRoot = metadataPath
    ? undefined
    : await mkdtemp(join(tmpdir(), "flancommand-api-meta-"));
  if (metadataRoot) tempRoots.push(metadataRoot);
  server = createApiServer({
    ...(adapter ? { adapter } : {}),
    ...(fileStore ? { fileStore } : {}),
    ...(terminalManager ? { terminalManager } : {}),
    ...(credentialProviders ? { credentialProviders } : {}),
    metadataPath: metadataPath ?? join(metadataRoot!, "state.json"),
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server did not bind");
  return `http://127.0.0.1:${address.port}`;
}

describe("API BFF", () => {
  it("serves an installable browser shell with security headers", async () => {
    const base = await start(makeAdapter());

    const shell = await fetch(`${base}/`);
    expect(shell.status).toBe(200);
    expect(shell.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(shell.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await shell.text()).toContain('rel="manifest"');

    const approvalPage = await fetch(`${base}/approval-review.html`);
    expect(approvalPage.status).toBe(200);
    expect(approvalPage.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(await approvalPage.text()).toContain('<script type="module" src="/approval-review.js">');
    const approvalScript = await fetch(`${base}/approval-review.js`);
    expect(approvalScript.status).toBe(200);
    expect(approvalScript.headers.get("content-type")).toContain("text/javascript");

    const manifest = await fetch(`${base}/manifest.webmanifest`);
    expect(manifest.status).toBe(200);
    expect(manifest.headers.get("content-type")).toContain("application/manifest+json");
    await expect(manifest.json()).resolves.toMatchObject({
      display: "standalone",
      start_url: "/",
    });

    const icon = await fetch(`${base}/icon.svg`);
    expect(icon.status).toBe(200);
    expect(icon.headers.get("content-type")).toContain("image/svg+xml");

    const serviceWorker = await fetch(`${base}/sw.js`);
    expect(serviceWorker.status).toBe(200);
    expect(serviceWorker.headers.get("content-type")).toContain("text/javascript");
    expect(await serviceWorker.text()).toContain('const CACHE_NAME = "flancommand-shell-v7"');
  });

  it("restores settings and conversation policy after an API restart", async () => {
    const metadataRoot = await mkdtemp(join(tmpdir(), "flancommand-api-restart-"));
    tempRoots.push(metadataRoot);
    const metadataPath = join(metadataRoot, "state.json");
    const base = await start(makeAdapter(), undefined, undefined, metadataPath);

    await fetch(`${base}/api/settings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ defaultModel: "hermes-fast", retentionDays: 90 }),
    });
    await fetch(`${base}/api/sessions/session-1/policy`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "safe" }),
    });
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;

    const restarted = await start(makeAdapter(), undefined, undefined, metadataPath);
    await expect(
      fetch(`${restarted}/api/settings`).then((response) => response.json()),
    ).resolves.toMatchObject({
      defaultModel: "hermes-fast",
      retentionDays: 90,
    });
    await expect(
      fetch(`${restarted}/api/sessions/session-1`).then((response) => response.json()),
    ).resolves.toMatchObject({ permissionModeOverride: "safe" });
  });

  it("rejects state-changing requests from untrusted origins", async () => {
    vi.stubEnv("FLANC_ALLOWED_ORIGINS", "https://command.example");
    const base = await start(makeAdapter());

    const rejected = await fetch(`${base}/api/folders`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ name: "blocked" }),
    });
    expect(rejected.status).toBe(403);

    const allowed = await fetch(`${base}/api/folders`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://command.example" },
      body: JSON.stringify({ name: "allowed" }),
    });
    expect(allowed.status).toBe(201);
    vi.unstubAllEnvs();
  });

  it("protects the web and API routes when Cloudflare identity is required", async () => {
    vi.stubEnv("FLANC_REQUIRE_AUTH", "true");
    const base = await start(makeAdapter());

    const rejectedApi = await fetch(`${base}/api/settings`);
    expect(rejectedApi.status).toBe(401);
    await expect(rejectedApi.json()).resolves.toMatchObject({
      error: { code: "AUTH_REQUIRED" },
    });

    const rejectedShell = await fetch(`${base}/`);
    expect(rejectedShell.status).toBe(401);

    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(200);

    const allowed = await fetch(`${base}/api/settings`, {
      headers: { "cf-access-authenticated-user-email": "ryan@example.com" },
    });
    expect(allowed.status).toBe(200);
    vi.unstubAllEnvs();
  });

  it("rate limits high-risk mutations with retry headers", async () => {
    vi.stubEnv("FLANC_RATE_LIMIT_MAX", "1");
    const base = await start(makeAdapter());
    const first = await fetch(`${base}/api/files`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(first.status).toBe(400);
    const second = await fetch(`${base}/api/files`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBeTruthy();
    expect(second.headers.get("x-ratelimit-limit")).toBe("1");
    vi.unstubAllEnvs();
  });

  it("does not opt chat streams into wildcard cross-origin access", async () => {
    const base = await start(
      makeAdapter([
        {
          type: "run.started",
          runId: "run-stream",
          sessionId: "session-1",
          at: "2026-01-01T00:00:00.000Z",
        },
        {
          type: "run.completed",
          runId: "run-stream",
          sessionId: "session-1",
        },
      ]),
    );
    const response = await fetch(`${base}/api/sessions/session-1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "stream safely" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    await response.text();
  });

  it("recreates a Hermes session that expired before the next message", async () => {
    const adapter = makeAdapter(
      [
        {
          type: "run.started",
          runId: "run-recreated",
          sessionId: "session-new",
          at: "2026-01-01T00:00:00.000Z",
        },
        {
          type: "message.delta",
          runId: "run-recreated",
          sessionId: "session-new",
          text: "Recovered",
        },
        { type: "run.completed", runId: "run-recreated", sessionId: "session-new" },
      ],
      true,
    );
    const base = await start(adapter);
    const response = await fetch(`${base}/api/sessions/session-1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Continue after being away" }),
    });

    expect(response.status).toBe(200);
    const stream = await response.text();
    expect(stream).toContain('event: session\ndata: {"type":"replaced"');
    expect(stream).toContain('"id":"session-new"');
    expect(stream).not.toContain("session not found");
    await expect(fetch(`${base}/api/sessions/session-new`)).resolves.toMatchObject({ status: 200 });
  });

  it("serves health and session routes through the adapter", async () => {
    const adapter = makeAdapter();
    const base = await start(adapter);

    await expect(fetch(`${base}/health`)).resolves.toMatchObject({ status: 200 });
    const list = await fetch(`${base}/api/sessions`);
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toEqual({ sessions });
    const metrics = await fetch(`${base}/api/metrics`);
    expect(metrics.status).toBe(200);
    await expect(metrics.json()).resolves.toMatchObject({
      transport: "mock",
      requests: { total: expect.any(Number), byMethod: { GET: expect.any(Number) } },
      sessions: { total: 1, running: 0 },
      jobs: {},
      notifications: { unread: 0 },
      artifacts: 0,
    });

    const created = await fetch(`${base}/api/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Created here" }),
    });
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({
      id: "session-new",
      title: "Created here",
    });

    const detail = await fetch(`${base}/api/sessions/session-1`);
    expect(detail.status).toBe(200);
    const detailBody = await detail.json();
    expect(detailBody).toMatchObject(sessions[0]!);
    expect(detailBody).toMatchObject({
      messages: [
        { role: "user", text: "Restored question" },
        { role: "assistant", text: "Restored answer" },
      ],
    });

    expect(adapter.resumed).toEqual(["session-1"]);

    const projects = await fetch(`${base}/api/projects`);
    expect(projects.status).toBe(200);
    await expect(projects.json()).resolves.toMatchObject({ projects: [{ id: "project-local" }] });

    const settings = await fetch(`${base}/api/settings`);
    expect(settings.status).toBe(200);
    await expect(settings.json()).resolves.toMatchObject({
      defaultModel: "",
      reasoningEffort: "medium",
      responseLimit: 4096,
    });

    const savedSettings = await fetch(`${base}/api/settings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        defaultModel: "hermes-fast",
        retentionDays: 90,
        compactActivity: true,
      }),
    });
    expect(savedSettings.status).toBe(200);
    await expect(savedSettings.json()).resolves.toMatchObject({
      defaultModel: "hermes-fast",
      retentionDays: 90,
      compactActivity: true,
    });

    const projectResponse = await fetch(`${base}/api/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Context project", instructions: "Use terse repo style." }),
    });
    const project = (await projectResponse.json()) as { id: string; instructions: string };
    expect(project.instructions).toBe("Use terse repo style.");
    await fetch(`${base}/api/sessions/session-1/project`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: project.id }),
    });
    const contextualMessage = await fetch(`${base}/api/sessions/session-1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Build the feature." }),
    });
    await contextualMessage.text();
    expect(adapter.sent.at(-1)).toContain("<project-instructions>");
    expect(adapter.sent.at(-1)).toContain("Use terse repo style.");
    expect(adapter.sent.at(-1)).toContain("Build the feature.");

    const editableResponse = await fetch(`${base}/api/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Editable project",
        paths: ["/tmp/workspace"],
        hosts: ["gospel"],
      }),
    });
    const editable = (await editableResponse.json()) as { id: string; createdAt: string };
    const updated = await fetch(`${base}/api/projects/${editable.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Renamed project", instructions: "Keep changes small." }),
    });
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      id: editable.id,
      name: "Renamed project",
      instructions: "Keep changes small.",
      paths: ["/tmp/workspace"],
      hosts: ["gospel"],
      createdAt: editable.createdAt,
    });
    const archived = await fetch(`${base}/api/projects/${editable.id}/archive`, {
      method: "POST",
    });
    expect(archived.status).toBe(200);
    await expect(archived.json()).resolves.toMatchObject({ id: editable.id, archived: true });
    await expect(
      fetch(`${base}/api/projects`).then((response) => response.json()),
    ).resolves.toEqual(
      expect.objectContaining({
        projects: expect.not.arrayContaining([expect.objectContaining({ id: editable.id })]),
      }),
    );
    await expect(
      fetch(`${base}/api/projects?includeArchived=true`).then((response) => response.json()),
    ).resolves.toEqual(
      expect.objectContaining({
        projects: expect.arrayContaining([
          expect.objectContaining({ id: editable.id, archived: true }),
        ]),
      }),
    );

    const permissionMode = await fetch(`${base}/api/projects/project-local/policy`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "safe" }),
    });
    expect(permissionMode.status).toBe(200);
    await expect(permissionMode.json()).resolves.toMatchObject({
      id: "project-local",
      permissionMode: "safe",
      policy: { read: "allow", write: "approval", command: "allow", network: "approval" },
    });

    const folder = await fetch(`${base}/api/folders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Daily work" }),
    });
    expect(folder.status).toBe(201);
    const folderBody = (await folder.json()) as { id: string };
    const organization = await fetch(`${base}/api/sessions/session-1/organization`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customTitle: "Daily status",
        isPinned: true,
        folderId: folderBody.id,
      }),
    });
    expect(organization.status).toBe(200);
    await expect(organization.json()).resolves.toMatchObject({
      title: "Daily status",
      isPinned: true,
      folderId: folderBody.id,
    });
    const searched = await fetch(`${base}/api/sessions?q=daily`);
    await expect(searched.json()).resolves.toMatchObject({ sessions: [{ id: "session-1" }] });

    const evaluation = await fetch(`${base}/api/policy/evaluate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "project-local", action: "write", path: "/tmp/out.txt" }),
    });
    expect(evaluation.status).toBe(200);
    const evaluationBody = (await evaluation.json()) as {
      approval: { id: string; decision: string };
      reviewUrl: string;
    };
    expect(evaluationBody.approval).toMatchObject({ decision: "pending" });
    expect(evaluationBody.reviewUrl).toContain("/approval-review.html?");
    const reviewUrl = new URL(evaluationBody.reviewUrl, base);
    const apiReviewUrl = `${base}/api/approvals/${evaluationBody.approval.id}/review?token=${encodeURIComponent(reviewUrl.searchParams.get("token") ?? "")}`;
    const review = await fetch(apiReviewUrl);
    expect(review.status).toBe(200);
    const reviewBody = (await review.json()) as { approval: { id: string } };
    expect(reviewBody.approval.id).toBe(evaluationBody.approval.id);
    const decided = await fetch(`${base}/api/approvals/${evaluationBody.approval.id}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: reviewUrl.searchParams.get("token"), decision: "deny" }),
    });
    expect(decided.status).toBe(200);
    const replay = await fetch(`${base}/api/approvals/${evaluationBody.approval.id}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: reviewUrl.searchParams.get("token"), decision: "approve" }),
    });
    expect(replay.status).toBe(404);

    const directEvaluation = await fetch(`${base}/api/policy/evaluate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "project-local",
        action: "write",
        path: "/tmp/direct.txt",
      }),
    });
    const directEvaluationBody = (await directEvaluation.json()) as {
      approval: { id: string; decision: string };
    };
    const directApprove = await fetch(
      `${base}/api/approvals/${directEvaluationBody.approval.id}/approve`,
      { method: "POST", headers: { "content-type": "application/json" } },
    );
    expect(directApprove.status).toBe(200);
    await expect(directApprove.json()).resolves.toMatchObject({
      id: directEvaluationBody.approval.id,
      decision: "approved",
    });

    const linked = await fetch(`${base}/api/sessions/session-1/project`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "project-local" }),
    });
    expect(linked.status).toBe(200);
    await expect(linked.json()).resolves.toMatchObject({ projectId: "project-local" });

    const conversationPolicy = await fetch(`${base}/api/sessions/session-1/policy`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "autonomy" }),
    });
    expect(conversationPolicy.status).toBe(200);
    await expect(conversationPolicy.json()).resolves.toMatchObject({
      permissionModeOverride: "autonomy",
    });

    const conversationEvaluation = await fetch(`${base}/api/policy/evaluate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "session-1", projectId: "project-local", action: "write" }),
    });
    expect(conversationEvaluation.status).toBe(200);
    await expect(conversationEvaluation.json()).resolves.toMatchObject({
      evaluation: { decision: "allow" },
    });

    const audit = await fetch(`${base}/api/audit`);
    expect(audit.status).toBe(200);
    await expect(audit.json()).resolves.toMatchObject({
      audit: expect.arrayContaining([
        expect.objectContaining({
          type: "project.permission_mode.updated",
          projectId: "project-local",
        }),
        expect.objectContaining({
          type: "conversation.permission_mode.updated",
          sessionId: "session-1",
        }),
      ]),
    });

    const credential = await fetch(`${base}/api/projects/project-local/credentials`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Gospel SSH",
        provider: "bitwarden-secrets-manager",
        externalSecretId: "secret-reference-1",
        purpose: "Remote access",
        allowedHosts: ["gospel"],
        injectionMethod: "temporary_file",
      }),
    });
    expect(credential.status).toBe(201);
    await expect(credential.json()).resolves.toMatchObject({
      name: "Gospel SSH",
      externalSecretId: "secret-reference-1",
    });
    const credentials = await fetch(`${base}/api/projects/project-local/credentials`);
    const credentialBody = await credentials.text();
    expect(credentialBody).toContain("secret-reference-1");
    expect(credentialBody).not.toContain("secret-value");
  });

  it("expands a project boundary with an explicit audited action", async () => {
    const base = await start(makeAdapter());
    const pathExpansion = await fetch(`${base}/api/projects/project-local/boundary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "/tmp" }),
    });
    expect(pathExpansion.status).toBe(200);
    await expect(pathExpansion.json()).resolves.toMatchObject({
      id: "project-local",
      paths: expect.arrayContaining(["/tmp"]),
    });

    const hostExpansion = await fetch(`${base}/api/projects/project-local/boundary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ host: "gospel" }),
    });
    expect(hostExpansion.status).toBe(200);
    await expect(hostExpansion.json()).resolves.toMatchObject({
      hosts: expect.arrayContaining(["gospel"]),
    });
    await expect(
      fetch(`${base}/api/audit`).then((response) => response.json()),
    ).resolves.toMatchObject({
      audit: expect.arrayContaining([
        expect.objectContaining({
          type: "project.boundary.expanded",
          projectId: "project-local",
          path: "/tmp",
        }),
        expect.objectContaining({
          type: "project.boundary.expanded",
          projectId: "project-local",
          host: "gospel",
        }),
      ]),
    });
  });

  it("stores the original prompt and duplicates a completed job", async () => {
    const adapter = makeAdapter([
      {
        type: "run.started",
        runId: "run-job",
        sessionId: "session-1",
        at: "2026-01-01T00:00:00.000Z",
      },
      { type: "run.completed", runId: "run-job", sessionId: "session-1" },
    ]);
    const base = await start(adapter);
    const response = await fetch(`${base}/api/sessions/session-1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Build a useful thing" }),
    });
    await response.text();

    const jobs = (await fetch(`${base}/api/jobs`).then((result) => result.json())) as {
      jobs: Array<{ id: string; title: string; prompt: string; status: string; sessionId: string }>;
    };
    expect(jobs.jobs[0]).toMatchObject({
      title: "Build a useful thing",
      prompt: "Build a useful thing",
      status: "completed",
    });

    const connectsBeforeDuplicate = adapter.connects;
    const duplicated = await fetch(`${base}/api/jobs/${jobs.jobs[0]!.id}/duplicate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    expect(duplicated.status).toBe(202);
    const duplicateJob = (await duplicated.json()) as { id: string };
    expect(duplicateJob).toMatchObject({
      title: "Build a useful thing",
      prompt: "Build a useful thing",
      sessionId: "session-1",
    });
    for (let attempt = 0; attempt < 20 && adapter.sent.length < 2; attempt += 1)
      await new Promise((resolve) => setTimeout(resolve, 10));
    expect(adapter.sent).toEqual(["Build a useful thing", "Build a useful thing"]);
    expect(adapter.connects).toBe(connectsBeforeDuplicate + 2);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const current = (await fetch(`${base}/api/jobs`).then((result) => result.json())) as {
        jobs: Array<{ id: string; status: string }>;
      };
      if (current.jobs.some((job) => job.id === duplicateJob.id && job.status === "completed"))
        break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await expect(fetch(`${base}/api/jobs`).then((result) => result.json())).resolves.toMatchObject({
      jobs: expect.arrayContaining([
        expect.objectContaining({ id: duplicateJob.id, status: "completed" }),
      ]),
    });
  });

  it("resumes a populated session when the browser reconnects", async () => {
    const adapter = makeAdapter([
      {
        type: "run.started",
        runId: "run-reconnect",
        sessionId: "session-1",
        at: "2026-01-01T00:00:00.000Z",
      },
      { type: "run.completed", runId: "run-reconnect", sessionId: "session-1" },
    ]);
    const base = await start(adapter);
    const message = await fetch(`${base}/api/sessions/session-1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "A message before reconnect" }),
    });
    await message.text();
    expect(adapter.resumed).toEqual(["session-1"]);

    const reconnect = await fetch(`${base}/api/sessions/session-1/reconnect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    expect(reconnect.status).toBe(200);
    await expect(reconnect.json()).resolves.toMatchObject({
      reconnect: { historyRestored: true },
      messages: [
        { role: "user", text: "Restored question" },
        { role: "assistant", text: "Restored answer" },
      ],
    });
    expect(adapter.resumed).toEqual(["session-1", "session-1"]);
  });

  it("returns buffered run events after a reconnect cursor", async () => {
    const adapter = makeAdapter([
      {
        type: "run.started",
        runId: "run-replay",
        sessionId: "session-1",
        at: "2026-01-01T00:00:00.000Z",
      },
      { type: "message.delta", runId: "run-replay", sessionId: "session-1", text: "caught up" },
      { type: "run.completed", runId: "run-replay", sessionId: "session-1" },
    ]);
    const base = await start(adapter);
    const message = await fetch(`${base}/api/sessions/session-1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Replay this run" }),
    });
    await message.text();

    const reconnect = await fetch(`${base}/api/sessions/session-1/reconnect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ after: 1 }),
    });
    expect(reconnect.status).toBe(200);
    await expect(reconnect.json()).resolves.toMatchObject({
      replay: [{ type: "message.delta", text: "caught up" }, { type: "run.completed" }],
    });
  });

  it("restores the replay ledger after an API restart", async () => {
    const metadataRoot = await mkdtemp(join(tmpdir(), "flancommand-replay-restart-"));
    tempRoots.push(metadataRoot);
    const metadataPath = join(metadataRoot, "state.json");
    const adapter = makeAdapter([
      {
        type: "run.started",
        runId: "run-durable-replay",
        sessionId: "session-1",
        at: "2026-01-01T00:00:00.000Z",
      },
      {
        type: "message.delta",
        runId: "run-durable-replay",
        sessionId: "session-1",
        text: "after restart",
      },
      { type: "run.completed", runId: "run-durable-replay", sessionId: "session-1" },
    ]);
    const base = await start(adapter, undefined, undefined, metadataPath);
    const message = await fetch(`${base}/api/sessions/session-1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Persist this replay" }),
    });
    await message.text();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;

    const restarted = await start(makeAdapter(), undefined, undefined, metadataPath);
    const reconnect = await fetch(`${restarted}/api/sessions/session-1/reconnect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ after: 1 }),
    });
    expect(reconnect.status).toBe(200);
    await expect(reconnect.json()).resolves.toMatchObject({
      replay: [{ type: "message.delta", text: "after restart" }, { type: "run.completed" }],
    });
  });

  it("reconciles a paused job from Hermes history after an API restart", async () => {
    const metadataRoot = await mkdtemp(join(tmpdir(), "flancommand-recovery-restart-"));
    tempRoots.push(metadataRoot);
    const metadataPath = join(metadataRoot, "state.json");
    await writeFile(
      metadataPath,
      JSON.stringify({
        version: 1,
        projects: [],
        approvals: [],
        artifacts: [],
        audit: [],
        jobs: [
          {
            id: "job-recovered",
            title: "Restored question",
            prompt: "Restored question",
            status: "running",
            sessionId: "session-1",
            runId: "run-recovered",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        runEvents: {
          "job-recovered": [
            {
              type: "run.started",
              runId: "run-recovered",
              sessionId: "session-1",
              at: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
        notifications: [],
        credentialReferences: [],
        folders: [],
        editProposals: [],
        settings: {},
        sessions: {
          "session-1": {
            messages: [
              {
                id: "message-user",
                role: "user",
                text: "Recover this job",
                at: "2026-01-01T00:00:00.000Z",
                status: "complete",
              },
              {
                id: "message-working",
                role: "assistant",
                text: "",
                at: "2026-01-01T00:00:00.000Z",
                runId: "run-recovered",
                status: "working",
              },
            ],
          },
        },
      }),
    );

    const base = await start(makeAdapter(), undefined, undefined, metadataPath);
    const jobs = (await fetch(`${base}/api/jobs`).then((response) => response.json())) as {
      jobs: Array<{ id: string; status: string }>;
    };
    expect(jobs.jobs).toEqual([
      expect.objectContaining({ id: "job-recovered", status: "completed" }),
    ]);
    await expect(
      fetch(`${base}/api/sessions/session-1`).then((response) => response.json()),
    ).resolves.toMatchObject({
      status: "idle",
      messages: [
        { role: "user", text: "Restored question" },
        { role: "assistant", text: "Restored answer", status: "complete" },
      ],
    });
  });

  it("retries a failed background job from its saved prompt", async () => {
    const adapter = makeAdapter([
      {
        type: "run.started",
        runId: "run-failed-job",
        sessionId: "session-1",
        at: "2026-01-01T00:00:00.000Z",
      },
      {
        type: "run.failed",
        runId: "run-failed-job",
        sessionId: "session-1",
        error: { code: "FAILED", message: "temporary failure" },
      },
    ]);
    const base = await start(adapter);
    const response = await fetch(`${base}/api/sessions/session-1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Retry this work" }),
    });
    await response.text();
    const jobs = (await fetch(`${base}/api/jobs`).then((result) => result.json())) as {
      jobs: Array<{ id: string; status: string }>;
    };
    expect(jobs.jobs[0]!.status).toBe("failed");

    const retried = await fetch(`${base}/api/jobs/${jobs.jobs[0]!.id}/retry`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    expect(retried.status).toBe(202);
    await retried.json();
    for (let attempt = 0; attempt < 20 && adapter.sent.length < 2; attempt += 1)
      await new Promise((resolve) => setTimeout(resolve, 10));
    expect(adapter.sent).toEqual(["Retry this work", "Retry this work"]);
  });

  it("reports Hermes memory status through the native slash command", async () => {
    const adapter = makeAdapter([
      {
        type: "run.started",
        runId: "memory-command",
        sessionId: "session-1",
        at: "2026-01-01T00:00:00.000Z",
      },
      {
        type: "message.delta",
        runId: "memory-command",
        sessionId: "session-1",
        text: "memory.write_approval = off\n\nNo pending memory writes.",
      },
      {
        type: "run.completed",
        runId: "memory-command",
        sessionId: "session-1",
        summary: { text: "memory status" },
      },
    ]);
    const base = await start(adapter);

    const response = await fetch(`${base}/api/sessions/session-1/memory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command: "/memory" }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      source: "hermes",
      command: "/memory",
      output: "memory.write_approval = off\n\nNo pending memory writes.",
    });
  });

  it("uses a fresh Hermes session when its durable resume ID is not ready", async () => {
    const adapter = makeAdapter([
      {
        type: "message.delta",
        runId: "memory-command",
        sessionId: "session-1",
        text: "fresh session memory status",
      },
    ]);
    adapter.resumeSession = async () => {
      throw new Error("ephemeral session has no durable resume ID");
    };
    const base = await start(adapter);

    const response = await fetch(`${base}/api/sessions/session-1/memory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command: "/memory" }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ output: "fresh session memory status" });
  });

  it("streams message events as typed SSE frames", async () => {
    const adapter = makeAdapter([
      {
        type: "run.started",
        runId: "run-1",
        sessionId: "session-1",
        at: "2026-01-01T00:00:00.000Z",
      },
      { type: "message.delta", runId: "run-1", sessionId: "session-1", text: "hello" },
      {
        type: "message.completed",
        runId: "run-1",
        sessionId: "session-1",
        messageId: "turn-1",
      },
      { type: "run.completed", runId: "run-1", sessionId: "session-1", summary: { text: "hello" } },
    ]);
    const base = await start(adapter);

    const response = await fetch(`${base}/api/sessions/session-1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hi" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/event-stream/);
    const body = await response.text();
    expect(body).toContain('event: agent\ndata: {"type":"run.started"');
    expect(body).toContain('event: agent\ndata: {"type":"message.delta"');
    expect(body).toContain('event: agent\ndata: {"type":"run.completed"');
    const session = (await fetch(`${base}/api/sessions/session-1`).then((value) =>
      value.json(),
    )) as {
      messages: unknown[];
    };
    expect(session.messages).toContainEqual(expect.objectContaining({ turnId: "turn-1" }));
    const jobs = await fetch(`${base}/api/jobs`);
    expect(jobs.status).toBe(200);
    await expect(jobs.json()).resolves.toMatchObject({
      jobs: [{ status: "completed", sessionId: "session-1" }],
    });
  });

  it("returns validation errors and forwards stop requests", async () => {
    const adapter = makeAdapter();
    const base = await start(adapter);

    const invalid = await fetch(`${base}/api/sessions/session-1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(invalid.status).toBe(400);

    const stopped = await fetch(`${base}/api/sessions/session-1/stop`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId: "run-1" }),
    });
    expect(stopped.status).toBe(202);
    expect(adapter.stopped).toEqual(["run-1"]);
  });

  it("returns the original prompt after undoing a failed turn for retry", async () => {
    const adapter = makeAdapter([
      {
        type: "run.started",
        runId: "run-failed",
        sessionId: "session-1",
        at: "2026-01-01T00:00:00.000Z",
      },
      { type: "message.delta", runId: "run-failed", sessionId: "session-1", text: "partial" },
      {
        type: "message.completed",
        runId: "run-failed",
        sessionId: "session-1",
        messageId: "turn-1",
      },
      {
        type: "run.failed",
        runId: "run-failed",
        sessionId: "session-1",
        error: { code: "FAILED", message: "temporary failure" },
      },
    ]);
    const base = await start(adapter);
    const messageResponse = await fetch(`${base}/api/sessions/session-1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "try this again" }),
    });
    await messageResponse.text();

    const retry = await fetch(`${base}/api/sessions/session-1/retry`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ turnId: "turn-1" }),
    });
    expect(retry.status).toBe(202);
    await expect(retry.json()).resolves.toEqual({ ok: true, text: "try this again" });
    expect(adapter.retried).toEqual(["turn-1"]);
    const session = (await fetch(`${base}/api/sessions/session-1`).then((response) =>
      response.json(),
    )) as {
      messages: unknown[];
    };
    expect(session.messages).toEqual([]);
  });

  it("pauses a background job when Hermes requests a credential", async () => {
    const adapter = makeAdapter([
      {
        type: "run.started",
        runId: "run-credential",
        sessionId: "session-1",
        at: "2026-01-01T00:00:00.000Z",
      },
      {
        type: "credential.requested",
        runId: "run-credential",
        sessionId: "session-1",
        credential: { id: "ssh-gospel", name: "Gospel SSH", purpose: "Remote access" },
      },
    ]);
    const base = await start(adapter);
    const response = await fetch(`${base}/api/sessions/session-1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "check the remote host" }),
    });
    expect(response.status).toBe(200);
    await response.text();
    const jobs = await fetch(`${base}/api/jobs`);
    await expect(jobs.json()).resolves.toMatchObject({
      jobs: [{ status: "waiting_for_credential" }],
    });
    const notifications = await fetch(`${base}/api/notifications`);
    const notificationData = (await notifications.json()) as {
      notifications: Array<{ id: string; title: string }>;
    };
    expect(notificationData.notifications).toEqual([
      expect.objectContaining({ title: "Hermes needs a credential" }),
    ]);
    const deleted = await fetch(
      `${base}/api/notifications/${encodeURIComponent(notificationData.notifications[0]!.id)}`,
      { method: "DELETE" },
    );
    expect(deleted.status).toBe(204);
    await expect(
      fetch(`${base}/api/notifications`).then((result) => result.json()),
    ).resolves.toEqual({
      notifications: [],
    });
  });

  it("resolves a credential reference server-side for a native Hermes secret request", async () => {
    const adapter = makeAdapter([
      {
        type: "run.started",
        runId: "run-secret",
        sessionId: "session-1",
        at: "2026-01-01T00:00:00.000Z",
      },
      {
        type: "credential.requested",
        runId: "run-secret",
        sessionId: "session-1",
        credential: {
          id: "request-1",
          requestId: "request-1",
          name: "OPENAI_API_KEY",
          purpose: "API access",
        },
      },
    ]);
    const base = await start(adapter, undefined, undefined, undefined, [
      { name: "test", resolve: async () => "server-only-secret" },
    ]);
    const created = await fetch(`${base}/api/projects/project-local/credentials`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "OpenAI",
        provider: "test",
        externalSecretId: "openai-key",
        purpose: "API access",
        injectionMethod: "environment",
      }),
    });
    const reference = (await created.json()) as { id: string };
    await (
      await fetch(`${base}/api/sessions/session-1/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "use the API" }),
      })
    ).text();
    const jobs = (await fetch(`${base}/api/jobs`).then((response) => response.json())) as {
      jobs: Array<{ id: string }>;
    };
    const response = await fetch(`${base}/api/jobs/${jobs.jobs[0]!.id}/provide-credential`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credentialId: reference.id }),
    });
    expect(response.status).toBe(202);
    expect(await response.text()).not.toContain("server-only-secret");
    expect(adapter.provided).toEqual([
      { sessionId: "session-1", requestId: "request-1", value: "server-only-secret" },
    ]);
    await expect(fetch(`${base}/api/audit`).then((result) => result.json())).resolves.toMatchObject(
      {
        audit: expect.arrayContaining([
          expect.objectContaining({
            type: "credential.used",
            credentialId: reference.id,
            injectionMethod: "native_secret_request",
          }),
        ]),
      },
    );
  });

  it("reports credential health and injects a temporary file into a local terminal", async () => {
    const root = await mkdtemp(join(tmpdir(), "flancommand-terminal-credential-"));
    tempRoots.push(root);
    let environment: NodeJS.ProcessEnv | undefined;
    const manager = new TerminalManager({
      shell: "/bin/sh",
      shellArgs: ["-i"],
      spawnProcess: (_shell, _shellArgs, cwd, _host, processEnvironment) => {
        environment = processEnvironment;
        return spawn("/bin/sh", ["-i"], { cwd, env: processEnvironment, stdio: "pipe" });
      },
    });
    const base = await start(makeAdapter(), undefined, manager, undefined, [
      { name: "test", resolve: async () => "terminal-secret" },
    ]);
    const created = await fetch(`${base}/api/projects/project-local/credentials`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Local terminal credential",
        provider: "test",
        externalSecretId: "terminal-secret",
        purpose: "Local terminal test",
        injectionMethod: "temporary_file",
      }),
    });
    const reference = (await created.json()) as { id: string };
    const health = await fetch(`${base}/api/credentials/health?projectId=project-local`);
    await expect(health.json()).resolves.toMatchObject({
      health: [{ id: reference.id, status: "healthy" }],
    });

    const terminalResponse = await fetch(`${base}/api/terminals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "project-local",
        cwd: process.cwd(),
        host: "local",
        credentialId: reference.id,
      }),
    });
    expect(terminalResponse.status).toBe(201);
    const terminal = (await terminalResponse.json()) as { id: string };
    const credentialPath = environment?.FLANCOMMAND_CREDENTIAL_FILE;
    expect(credentialPath).toBeTruthy();
    await expect(readFile(credentialPath!, "utf8")).resolves.toBe("terminal-secret");
    await expect(
      fetch(`${base}/api/audit`).then((response) => response.json()),
    ).resolves.toMatchObject({
      audit: expect.arrayContaining([
        expect.objectContaining({ type: "credential.used", credentialId: reference.id }),
      ]),
    });

    await expect(
      fetch(`${base}/api/terminals/${terminal.id}/close`, { method: "POST" }),
    ).resolves.toMatchObject({
      status: 200,
    });
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        await stat(credentialPath!);
      } catch {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await expect(stat(credentialPath!)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("uses the mock adapter when HERMES_TRANSPORT is absent", async () => {
    vi.stubEnv("HERMES_TRANSPORT", "");
    const base = await start();
    const response = await fetch(`${base}/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, transport: "mock" });
    vi.unstubAllEnvs();
  });

  it("retries adapter connection after an initial connection failure", async () => {
    const adapter = makeAdapter();
    let attempts = 0;
    adapter.connect = async () => {
      attempts += 1;
      if (attempts === 1 || attempts === 3) throw new Error("gateway is still starting");
    };
    const base = await start(adapter);

    const firstHealth = await fetch(`${base}/health`);
    expect(firstHealth.status).toBe(503);
    await expect(firstHealth.json()).resolves.toMatchObject({
      ok: false,
      checks: { api: { ok: true }, runtime: { ok: false } },
    });
    expect((await fetch(`${base}/health`)).status).toBe(200);
    expect((await fetch(`${base}/health`)).status).toBe(503);
    expect((await fetch(`${base}/health`)).status).toBe(200);
    expect(attempts).toBe(4);
  });

  it("uploads safe files, previews text, and registers artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "flancommand-api-files-"));
    tempRoots.push(root);
    const base = await start(makeAdapter(), new FileStore({ root }));
    const upload = await fetch(`${base}/api/files`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "notes.md",
        mimeType: "text/markdown",
        contentBase64: Buffer.from("# hello").toString("base64"),
        projectId: "project-local",
      }),
    });
    expect(upload.status).toBe(201);
    const file = (await upload.json()) as { id: string };
    const preview = await fetch(`${base}/api/files/${file.id}/preview`);
    expect(preview.status).toBe(200);
    await expect(preview.text()).resolves.toBe("# hello");
    const artifact = await fetch(`${base}/api/artifacts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileId: file.id, artifactType: "document" }),
    });
    expect(artifact.status).toBe(201);
    const artifactBody = (await artifact.json()) as { fileId: string };
    expect(artifactBody.fileId).toBe(file.id);
    const unsafe = await fetch(`${base}/api/files`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "page.html",
        mimeType: "text/html",
        contentBase64: Buffer.from("<script>alert(1)</script>").toString("base64"),
      }),
    });
    expect(unsafe.status).toBe(415);
  });

  it("imports Hermes artifacts only from declared project paths", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "flancommand-api-artifact-project-"));
    const outsideRoot = await mkdtemp(join(tmpdir(), "flancommand-api-artifact-outside-"));
    tempRoots.push(projectRoot, outsideRoot);
    const insidePath = join(projectRoot, "report.md");
    const outsidePath = join(outsideRoot, "secret.md");
    await writeFile(insidePath, "# Generated report\n");
    await writeFile(outsidePath, "outside boundary\n");
    const adapter = makeAdapter([
      { type: "run.started", runId: "run-artifact", sessionId: "session-1", at: "2026-01-01" },
      {
        type: "artifact.created",
        runId: "run-artifact",
        sessionId: "session-1",
        artifact: {
          id: "artifact-inside",
          name: "report.md",
          kind: "document",
          mimeType: "text/markdown",
          uri: insidePath,
        },
      },
      {
        type: "artifact.created",
        runId: "run-artifact",
        sessionId: "session-1",
        artifact: {
          id: "artifact-outside",
          name: "secret.md",
          kind: "document",
          mimeType: "text/markdown",
          uri: outsidePath,
        },
      },
      { type: "run.completed", runId: "run-artifact", sessionId: "session-1" },
    ]);
    const base = await start(adapter);
    const projectResponse = await fetch(`${base}/api/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Artifact project", paths: [projectRoot] }),
    });
    const project = (await projectResponse.json()) as { id: string };
    await fetch(`${base}/api/sessions/session-1/project`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: project.id }),
    });
    const message = await fetch(`${base}/api/sessions/session-1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "make a report" }),
    });
    expect(message.status).toBe(200);
    await message.text();

    await expect(
      fetch(`${base}/api/artifacts`).then((response) => response.json()),
    ).resolves.toMatchObject({
      artifacts: [expect.objectContaining({ name: "report.md" })],
    });
    await expect(
      fetch(`${base}/api/audit`).then((response) => response.json()),
    ).resolves.toMatchObject({
      audit: expect.arrayContaining([
        expect.objectContaining({ type: "artifact.created", path: insidePath }),
        expect.objectContaining({ type: "artifact.rejected", path: outsidePath }),
      ]),
    });
  });

  it("removes expired uploads when the API initializes", async () => {
    const root = await mkdtemp(join(tmpdir(), "flancommand-api-retention-"));
    tempRoots.push(root);
    const fileStore = new FileStore({ root, now: () => new Date("2026-07-23T00:00:00.000Z") });
    const expired = await fileStore.put({
      name: "expired.txt",
      mimeType: "text/plain",
      content: Buffer.from("old"),
      expiresAt: "2026-07-22T00:00:00.000Z",
    });
    const base = await start(makeAdapter(), fileStore);

    const files = await fetch(`${base}/api/files`);
    expect(files.status).toBe(200);
    await expect(files.json()).resolves.toMatchObject({ files: [] });
    await expect(
      fetch(`${base}/api/audit`).then((response) => response.json()),
    ).resolves.toMatchObject({
      audit: [expect.objectContaining({ type: "file.expired", fileId: expired.id })],
    });
  });

  it("stages selected files through Hermes before streaming a chat turn", async () => {
    const root = await mkdtemp(join(tmpdir(), "flancommand-api-attachments-"));
    tempRoots.push(root);
    const adapter = makeAdapter([
      {
        type: "run.started",
        runId: "run-attachment",
        sessionId: "session-1",
        at: "2026-01-01T00:00:00.000Z",
      },
      { type: "run.completed", runId: "run-attachment", sessionId: "session-1" },
    ]);
    const base = await start(adapter, new FileStore({ root }));
    const upload = await fetch(`${base}/api/files`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "notes.txt",
        mimeType: "text/plain",
        contentBase64: Buffer.from("hello from the browser").toString("base64"),
        projectId: "project-local",
        sessionId: "session-1",
      }),
    });
    const file = (await upload.json()) as { id: string };
    const response = await fetch(`${base}/api/sessions/session-1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Read this file", fileIds: [file.id] }),
    });
    expect(response.status).toBe(200);
    await response.text();
    expect(adapter.attached).toEqual([
      {
        kind: "file",
        sessionId: "session-1",
        name: "notes.txt",
        mimeType: "text/plain",
        contentBase64: Buffer.from("hello from the browser").toString("base64"),
      },
    ]);
    expect(adapter.sent).toEqual(["Read this file\n\n@file:notes.txt"]);
  });

  it("browses only declared workspace paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "flancommand-api-workspace-"));
    tempRoots.push(root);
    await writeFile(join(root, "README.txt"), "workspace hello");
    const base = await start(makeAdapter());
    const projectResponse = await fetch(`${base}/api/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Workspace", paths: [root] }),
    });
    const project = (await projectResponse.json()) as { id: string };
    const listing = await fetch(`${base}/api/workspace?projectId=${project.id}`);
    expect(listing.status).toBe(200);
    await expect(listing.json()).resolves.toMatchObject({
      listing: { entries: [{ name: "README.txt", type: "file" }] },
    });
    const search = await fetch(
      `${base}/api/workspace/search?projectId=${project.id}&q=${encodeURIComponent("workspace hello")}`,
    );
    expect(search.status).toBe(200);
    await expect(search.json()).resolves.toMatchObject({
      matches: [{ name: "README.txt", match: "content" }],
      truncated: false,
    });
    const file = await fetch(
      `${base}/api/workspace/file?projectId=${project.id}&path=${encodeURIComponent(join(root, "README.txt"))}`,
    );
    expect(file.status).toBe(200);
    await expect(file.text()).resolves.toBe("workspace hello");
    const proposalResponse = await fetch(`${base}/api/workspace/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: project.id,
        path: join(root, "README.txt"),
        afterText: "workspace changed\n",
      }),
    });
    expect(proposalResponse.status).toBe(201);
    const proposalBody = (await proposalResponse.json()) as {
      proposal: { id: string; status: string };
    };
    expect(proposalBody.proposal.status).toBe("pending");
    const approved = await fetch(`${base}/api/edit-proposals/${proposalBody.proposal.id}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    expect(approved.status).toBe(200);
    const updated = await fetch(
      `${base}/api/workspace/file?projectId=${project.id}&path=${encodeURIComponent(join(root, "README.txt"))}`,
    );
    await expect(updated.text()).resolves.toBe("workspace changed\n");
    const staleResponse = await fetch(`${base}/api/workspace/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: project.id,
        path: join(root, "README.txt"),
        afterText: "proposal that must not win\n",
      }),
    });
    const staleBody = (await staleResponse.json()) as { proposal: { id: string } };
    await writeFile(join(root, "README.txt"), "changed outside the proposal\n");
    const staleApprove = await fetch(
      `${base}/api/edit-proposals/${staleBody.proposal.id}/approve`,
      {
        method: "POST",
      },
    );
    expect(staleApprove.status).toBe(409);
    await expect(
      fetch(
        `${base}/api/workspace/file?projectId=${project.id}&path=${encodeURIComponent(join(root, "README.txt"))}`,
      ).then((response) => response.text()),
    ).resolves.toBe("changed outside the proposal\n");
    const outside = await fetch(
      `${base}/api/workspace/file?projectId=${project.id}&path=${encodeURIComponent(join(root, "..", "outside.txt"))}`,
    );
    expect(outside.status).toBe(403);
  });

  it("starts local and declared SSH terminals inside project boundaries", async () => {
    const manager = new TerminalManager({
      shell: "/bin/sh",
      shellArgs: ["-i"],
      spawnProcess: (_shell, _shellArgs, cwd) => spawn("/bin/sh", ["-i"], { cwd, stdio: "pipe" }),
    });
    const base = await start(makeAdapter(), undefined, manager);
    const created = await fetch(`${base}/api/terminals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "project-local", cwd: process.cwd(), host: "local" }),
    });
    expect(created.status).toBe(201);
    const terminal = (await created.json()) as { id: string; host: string; cwd: string };
    expect(terminal).toMatchObject({ host: "local", cwd: process.cwd() });
    const input = await fetch(`${base}/api/terminals/${terminal.id}/input`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "printf 'api-terminal-ok\\n'\n" }),
    });
    expect(input.status).toBe(202);
    const resized = await fetch(`${base}/api/terminals/${terminal.id}/resize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cols: 120, rows: 40 }),
    });
    expect(resized.status).toBe(202);
    const terminalAfterResize = await fetch(`${base}/api/terminals/${terminal.id}/stream`);
    expect(terminalAfterResize.status).toBe(200);
    const snapshotReader = terminalAfterResize.body!.getReader();
    const snapshotChunk = await snapshotReader.read();
    expect(new TextDecoder().decode(snapshotChunk?.value)).toContain("event: snapshot");
    await snapshotReader.cancel();
    const remote = await fetch(`${base}/api/terminals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "project-local", cwd: process.cwd(), host: "gospel" }),
    });
    expect(remote.status).toBe(403);
    const projectResponse = await fetch(`${base}/api/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Remote terminal project",
        paths: [process.cwd()],
        hosts: ["gospel"],
      }),
    });
    const project = (await projectResponse.json()) as { id: string };
    const allowedRemote = await fetch(`${base}/api/terminals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: project.id, cwd: process.cwd(), host: "gospel" }),
    });
    expect(allowedRemote.status).toBe(201);
    const remoteTerminal = (await allowedRemote.json()) as { id: string };
    expect(remoteTerminal).toMatchObject({ id: expect.any(String) });
    expect(
      (await fetch(`${base}/api/terminals/${remoteTerminal.id}/close`, { method: "POST" })).status,
    ).toBe(200);
    const closed = await fetch(`${base}/api/terminals/${terminal.id}/close`, { method: "POST" });
    expect(closed.status).toBe(200);
  });

  it("reports remote terminal launch failures in the stream", async () => {
    const manager = new TerminalManager({
      shell: "/bin/sh",
      shellArgs: ["-c", "exit 7"],
      spawnProcess: (_shell, shellArgs, cwd) => spawn("/bin/sh", shellArgs, { cwd, stdio: "pipe" }),
    });
    const base = await start(makeAdapter(), undefined, manager);
    const projectResponse = await fetch(`${base}/api/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "SSH failure project",
        paths: [process.cwd()],
        hosts: ["gospel"],
      }),
    });
    const project = (await projectResponse.json()) as { id: string };
    const created = await fetch(`${base}/api/terminals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: project.id, cwd: process.cwd(), host: "gospel" }),
    });
    const terminal = (await created.json()) as { id: string };
    const stream = await fetch(`${base}/api/terminals/${terminal.id}/stream`);
    expect(await stream.text()).toContain("SSH exited with status 7");
  });
});
