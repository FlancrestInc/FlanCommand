import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { HermesSession } from "@flancommand/event-schema";
import type { SendMessageInput } from "./adapter.js";
import { HermesAdapterError, UnsupportedOperationError } from "./errors.js";

interface MockFrame {
  jsonrpc: "2.0";
  method: "event";
  params: { type: string; session_id?: string; payload?: Record<string, unknown> };
}

const fixturePath = resolve(
  new URL("../../../tests/fixtures/hermes/mock-stream.jsonl", import.meta.url).pathname,
);

export class MockHermesTransport {
  private connected = false;
  private hasConnected = false;
  private handshakeReady = false;
  private gatewayReadyFrame: MockFrame | undefined;
  private readonly pendingGapSessions = new Set<string>();
  private sequence = 3;
  private readonly stopped = new Set<string>();
  private readonly sessions = new Map<string, HermesSession>([
    ["session-1", { id: "session-1", title: "Mock One", source: "hermes", status: "idle" }],
    ["session-2", { id: "session-2", title: "Mock Two", source: "hermes", status: "idle" }],
  ]);

  async connect(): Promise<void> {
    if (!this.connected) {
      if (this.hasConnected)
        for (const sessionId of [...this.sessions.keys()].sort())
          this.pendingGapSessions.add(sessionId);
      this.gatewayReadyFrame = {
        jsonrpc: "2.0",
        method: "event",
        params: { type: "gateway.ready", payload: { skin: "mock" } },
      };
    }
    this.hasConnected = true;
    this.handshakeReady = true;
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.handshakeReady = false;
    this.gatewayReadyFrame = undefined;
  }

  isHandshakeReady(): boolean {
    return this.handshakeReady;
  }

  peekGatewayReadyFrame(): MockFrame | undefined {
    return this.gatewayReadyFrame;
  }

  async call(operation: string, input: unknown): Promise<unknown> {
    this.ensureConnected(operation);
    const value = (input ?? {}) as Record<string, unknown>;
    if (operation === "listSessions") return [...this.sessions.values()];
    if (operation === "listModels")
      return [
        { id: "mock-model", name: "Mock model", provider: "fixture", reasoning: true },
        { id: "mock-model-fast", name: "Mock model fast", provider: "fixture", reasoning: false },
      ];
    if (operation === "listCommands")
      return {
        pairs: [
          ["/status", "Show mock session status."],
          ["/sessions", "List mock sessions."],
          ["/models", "List available models."],
          ["/files", "List attached files."],
          ["/history", "Show recent session history."],
          ["/memory", "Show saved session memory."],
          ["/projects", "List workspace projects."],
          ["/workspace", "Show workspace details."],
        ],
      };
    if (operation === "setSessionModel") {
      const sessionId = String(value.sessionId);
      const session = this.getSession(sessionId);
      if (typeof value.modelId === "string") session.modelId = value.modelId;
      return undefined;
    }
    if (operation === "createSession") {
      const id = `session-${this.sequence++}`;
      const session: HermesSession = {
        id,
        title: typeof value.title === "string" ? value.title : "Mock Session",
        source: "hermes",
        status: "idle",
      };
      this.sessions.set(id, session);
      return session;
    }
    if (operation === "getSession" || operation === "resumeSession")
      return this.getSession(String(value.sessionId));
    if (operation === "stopRun") {
      this.stopped.add(String(value.runId));
      return undefined;
    }
    if (operation === "attachFile" || operation === "attachImage") {
      const name = typeof value.name === "string" ? value.name : "attachment";
      return {
        attached: true,
        name,
        ref_text: operation === "attachFile" ? `@file:${name}` : `@image:${name}`,
      };
    }
    if (operation === "approveAction" || operation === "denyAction") return { ok: true };
    throw new UnsupportedOperationError(operation);
  }

  stream(operation: string, input: unknown): AsyncIterable<unknown> {
    this.ensureConnected(operation);
    const value = (input ?? {}) as { sessionId?: string; input?: SendMessageInput };
    const sessionId = value.sessionId ?? "";
    const tableReply = value.input?.text.toLowerCase().includes("table")
      ? "Mock reply\n\n| Name | State |\n| --- | --- |\n| Hermes | Ready |\n\n- [x] Connected\n- [ ] Waiting"
      : undefined;
    const credentialReply = value.input?.text.toLowerCase().includes("request a credential");
    this.getSession(sessionId);
    const runId = `run-${sessionId}`;
    const gap = this.pendingGapSessions.delete(sessionId);
    const gatewayReady = this.gatewayReadyFrame;
    this.gatewayReadyFrame = undefined;
    const stoppedRuns = this.stopped;
    return {
      [Symbol.asyncIterator]: async function* () {
        if (gatewayReady) yield gatewayReady;
        if (gap)
          yield {
            type: "reconnect.gap",
            sessionId,
            runId,
            reason: "Mock transport has no supported stream replay method; call session.resume.",
          };
        if (credentialReply) {
          yield {
            jsonrpc: "2.0",
            method: "event",
            params: { type: "message.start", session_id: sessionId, payload: {} },
          };
          yield {
            jsonrpc: "2.0",
            method: "event",
            params: {
              type: "credential.requested",
              session_id: sessionId,
              payload: {
                run_id: runId,
                request_id: "credential-request-1",
                credential_id: "ssh-gospel",
                name: "Gospel SSH",
                purpose: "Remote access",
              },
            },
          };
          return;
        }
        const lines = readFileSync(fixturePath, "utf8").trim().split("\n");
        for (const line of lines) {
          if (stoppedRuns.has(runId)) {
            stoppedRuns.delete(runId);
            yield { type: "run.stopped", sessionId, runId };
            return;
          }
          const frame = JSON.parse(line) as MockFrame;
          if (frame.params.type === "gateway.ready") continue;
          if (frame.params.session_id) frame.params.session_id = sessionId;
          if (
            tableReply &&
            (frame.params.type === "message.delta" || frame.params.type === "message.complete") &&
            frame.params.payload
          )
            frame.params.payload.text = tableReply;
          yield frame;
        }
      },
    };
  }

  private getSession(sessionId: string): HermesSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new HermesAdapterError({
        code: "MOCK_SESSION_NOT_FOUND",
        message: "The mock Hermes session was not found.",
        component: "mock-transport",
        operation: "session",
        likelyCause: "The requested mock session ID is unknown.",
        nextAction: "List mock sessions and retry with a known session ID.",
        retryable: false,
      });
    }
    return session;
  }

  private ensureConnected(operation: string): void {
    if (!this.connected) {
      throw new HermesAdapterError({
        code: "MOCK_NOT_CONNECTED",
        message: "The mock Hermes transport is not connected.",
        component: "mock-transport",
        operation,
        likelyCause: "The mock gateway connection is closed.",
        nextAction: "Call connect() and retry the operation.",
        retryable: true,
      });
    }
  }
}
