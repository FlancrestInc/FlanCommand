import {
  hermesCapabilitiesSchema,
  hermesSessionSchema,
  modelInfoSchema,
  slashCommandSchema,
  redactSafeText,
  type AgentEvent,
  type HermesCapabilities,
  type HermesSession,
  type ModelInfo,
  type SlashCommand,
} from "@flancommand/event-schema";
import type {
  CreateSessionInput,
  AttachmentResult,
  FileAttachmentInput,
  HermesAdapter,
  ListSessionsInput,
  SendMessageInput,
} from "./adapter.js";
import { createDefaultCapabilities } from "./capabilities.js";
import {
  HermesAdapterError,
  InvalidAdapterStateError,
  UnsupportedOperationError,
} from "./errors.js";
import { normalizeFlushedFrame, normalizeStreamFrame, StreamRedactor } from "./normalize.js";

interface AdapterTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  call(operation: string, input: unknown): Promise<unknown>;
  stream(operation: string, input: unknown): AsyncIterable<unknown>;
}

class CapabilityRegistry {
  private readonly capabilities: HermesCapabilities;

  constructor(capabilities: HermesCapabilities) {
    this.capabilities = hermesCapabilitiesSchema.parse(capabilities);
  }

  snapshot(): HermesCapabilities {
    return hermesCapabilitiesSchema.parse(this.capabilities);
  }
}

const operationCapabilities: Record<string, keyof HermesCapabilities> = {
  listSessions: "sessions",
  getSession: "sessions",
  createSession: "sessions",
  resumeSession: "sessions",
  renameSession: "rename",
  sendMessage: "streaming",
  stopRun: "stop",
  retryTurn: "retry",
  dispatchCommand: "commands",
  listCommands: "commands",
  listModels: "models",
  setSessionModel: "modelSelection",
  approveAction: "approvals",
  denyAction: "approvals",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSessionListResponse(response: unknown): unknown[] {
  const rows = Array.isArray(response)
    ? response
    : isRecord(response) && Array.isArray(response.sessions)
      ? response.sessions
      : [];
  return rows.map((row) => {
    if (!isRecord(row)) return row;
    const source = row.source === "telegram" ? "telegram" : row.source ? "hermes" : "unknown";
    const startedAt =
      typeof row.started_at === "number"
        ? new Date(row.started_at * 1000).toISOString()
        : undefined;
    return {
      id: typeof row.id === "string" ? row.id : row.session_id,
      ...(typeof row.title === "string" ? { title: row.title } : {}),
      ...(startedAt ? { createdAt: startedAt, updatedAt: startedAt } : {}),
      source,
      status: "idle",
    };
  });
}

function normalizeSessionResponse(response: unknown): unknown {
  if (!isRecord(response)) return response;
  const info = isRecord(response.info) ? response.info : {};
  const id = response.session_id ?? response.session_key ?? response.id;
  const startedAt =
    typeof response.started_at === "number"
      ? new Date(response.started_at * 1000).toISOString()
      : undefined;
  const history = Array.isArray(response.messages)
    ? response.messages.flatMap((message) => {
        if (!isRecord(message)) return [];
        const role = message.role;
        const text =
          typeof message.text === "string"
            ? message.text
            : typeof message.content === "string"
              ? message.content
              : undefined;
        return (role === "user" || role === "assistant" || role === "system") && text
          ? [{ role, text }]
          : [];
      })
    : undefined;
  return {
    id,
    ...(typeof info.title === "string"
      ? { title: info.title }
      : typeof response.title === "string"
        ? { title: response.title }
        : {}),
    ...(typeof info.model === "string"
      ? { modelId: info.model }
      : typeof response.modelId === "string"
        ? { modelId: response.modelId }
        : {}),
    ...(startedAt ? { createdAt: startedAt, updatedAt: startedAt } : {}),
    ...(history?.length ? { history } : {}),
    status: response.running ? "running" : "idle",
  };
}

function normalizeCommandCatalogResponse(response: unknown): unknown[] {
  if (!isRecord(response) || !Array.isArray(response.pairs)) return [];
  return response.pairs.flatMap((pair) => {
    if (!Array.isArray(pair) || typeof pair[0] !== "string") return [];
    return [{ name: pair[0], ...(typeof pair[1] === "string" ? { description: pair[1] } : {}) }];
  });
}

function normalizeModelOptionsResponse(response: unknown): unknown[] {
  if (Array.isArray(response)) return response;
  if (!isRecord(response) || !Array.isArray(response.providers)) return [];
  return response.providers.flatMap((provider) => {
    if (!isRecord(provider) || typeof provider.slug !== "string" || !Array.isArray(provider.models))
      return [];
    const capabilities = isRecord(provider.capabilities) ? provider.capabilities : {};
    return provider.models.flatMap((model) => {
      if (typeof model !== "string") return [];
      const modelCapabilities = isRecord(capabilities[model]) ? capabilities[model] : {};
      return [
        {
          id: model,
          name: model,
          provider: provider.slug,
          ...(typeof modelCapabilities.reasoning === "boolean"
            ? { reasoning: modelCapabilities.reasoning }
            : {}),
          ...(typeof modelCapabilities.contextWindow === "number"
            ? { contextWindow: modelCapabilities.contextWindow }
            : typeof modelCapabilities.context_window === "number"
              ? { contextWindow: modelCapabilities.context_window }
              : typeof modelCapabilities.context_max === "number"
                ? { contextWindow: modelCapabilities.context_max }
                : {}),
        },
      ];
    });
  });
}

export class HermesAdapterImplementation implements HermesAdapter {
  private connected = false;
  private readonly activeSecrets = new Set<string>();
  private readonly capabilityRegistry: CapabilityRegistry;

  constructor(
    private readonly transport: AdapterTransport,
    capabilities?: HermesCapabilities,
  ) {
    this.capabilityRegistry = new CapabilityRegistry(capabilities ?? createDefaultCapabilities());
  }

  async connect(): Promise<void> {
    this.connected = false;
    try {
      await this.transport.connect();
      this.connected = true;
    } catch (error) {
      if (error instanceof HermesAdapterError) throw error;
      throw new HermesAdapterError({
        code: "TRANSPORT_CONNECT_FAILED",
        message: "Hermes transport connect failed.",
        component: "hermes-adapter",
        operation: "connect",
        likelyCause: "The Hermes transport failed while connecting.",
        nextAction: "Check the Hermes gateway connection and retry connect().",
        retryable: true,
      });
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.transport.disconnect();
    } catch (error) {
      if (error instanceof HermesAdapterError) throw error;
      throw new HermesAdapterError({
        code: "TRANSPORT_DISCONNECT_FAILED",
        message: "Hermes transport disconnect failed.",
        component: "hermes-adapter",
        operation: "disconnect",
        likelyCause: "The Hermes transport failed while disconnecting.",
        nextAction: "Check the Hermes gateway connection and retry disconnect().",
        retryable: true,
      });
    } finally {
      this.connected = false;
    }
  }

  async getCapabilities(): Promise<HermesCapabilities> {
    return this.capabilityRegistry.snapshot();
  }

  async listSessions(input?: ListSessionsInput): Promise<HermesSession[]> {
    const response = await this.call("listSessions", input);
    return this.parseResponse("listSessions", () =>
      hermesSessionSchema.array().parse(normalizeSessionListResponse(response)),
    );
  }

  async getSession(sessionId: string): Promise<HermesSession> {
    const response = await this.call("getSession", { sessionId });
    return this.parseResponse("getSession", () =>
      hermesSessionSchema.parse(normalizeSessionResponse(response)),
    );
  }

  async createSession(input?: CreateSessionInput): Promise<HermesSession> {
    const response = await this.call("createSession", input);
    return this.parseResponse("createSession", () =>
      hermesSessionSchema.parse(normalizeSessionResponse(response)),
    );
  }

  async resumeSession(sessionId: string): Promise<HermesSession> {
    const response = await this.call("resumeSession", { sessionId });
    return this.parseResponse("resumeSession", () =>
      hermesSessionSchema.parse(normalizeSessionResponse(response)),
    );
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    await this.call("renameSession", { sessionId, title });
  }

  sendMessage(sessionId: string, input: SendMessageInput): AsyncIterable<AgentEvent> {
    return this.delegateStream("sendMessage", { sessionId, input });
  }

  async stopRun(runId: string, sessionId?: string): Promise<void> {
    await this.call("stopRun", { runId, ...(sessionId ? { sessionId } : {}) });
  }

  async retryTurn(sessionId: string, turnId: string): Promise<void> {
    await this.call("retryTurn", { sessionId, turnId });
  }

  async *dispatchCommand(sessionId: string, command: string): AsyncIterable<AgentEvent> {
    const response = await this.call("dispatchCommand", { sessionId, command });
    const runId = `command-${sessionId}-${Date.now()}`;
    const output =
      isRecord(response) && typeof response.output === "string"
        ? redactSafeText(response.output)
        : "(no output)";
    yield {
      type: "run.started",
      runId,
      sessionId,
      at: new Date().toISOString(),
    };
    yield { type: "message.delta", runId, sessionId, text: output };
    yield { type: "message.completed", runId, sessionId, messageId: `${runId}-message` };
    yield {
      type: "run.completed",
      runId,
      sessionId,
      summary: { text: output },
    };
  }

  async listCommands(sessionId?: string): Promise<SlashCommand[]> {
    const response = await this.call("listCommands", { sessionId });
    return this.parseResponse("listCommands", () =>
      slashCommandSchema.array().parse(normalizeCommandCatalogResponse(response)),
    );
  }

  async listModels(): Promise<ModelInfo[]> {
    const response = await this.call("listModels", undefined);
    return this.parseResponse("listModels", () =>
      modelInfoSchema.array().parse(normalizeModelOptionsResponse(response)),
    );
  }

  async setSessionModel(sessionId: string, modelId: string): Promise<void> {
    await this.call("setSessionModel", { sessionId, modelId });
  }

  async approveAction(actionId: string, sessionId?: string): Promise<void> {
    await this.call("approveAction", { actionId, ...(sessionId ? { sessionId } : {}) });
  }

  async denyAction(actionId: string, reason?: string, sessionId?: string): Promise<void> {
    await this.call("denyAction", {
      actionId,
      reason,
      ...(sessionId ? { sessionId } : {}),
    });
  }

  async provideCredential(sessionId: string, requestId: string, value: string): Promise<void> {
    if (value) {
      this.activeSecrets.delete(value);
      this.activeSecrets.add(value);
      while (this.activeSecrets.size > 128) {
        const oldest = this.activeSecrets.values().next().value;
        if (oldest === undefined) break;
        this.activeSecrets.delete(oldest);
      }
    }
    await this.call("provideCredential", { sessionId, requestId, value });
  }

  async attachFile(sessionId: string, input: FileAttachmentInput): Promise<AttachmentResult> {
    return this.parseAttachmentResult(
      await this.call("attachFile", { sessionId, ...input }),
      "attachFile",
    );
  }

  async attachImage(sessionId: string, input: FileAttachmentInput): Promise<AttachmentResult> {
    return this.parseAttachmentResult(
      await this.call("attachImage", { sessionId, ...input }),
      "attachImage",
    );
  }

  private parseAttachmentResult(response: unknown, operation: string): AttachmentResult {
    if (!isRecord(response) || typeof response.attached !== "boolean")
      throw new HermesAdapterError({
        code: "INVALID_ATTACHMENT_RESPONSE",
        message: "Hermes returned an invalid attachment response.",
        component: "hermes-adapter",
        operation,
        likelyCause: "The Hermes gateway attachment contract changed.",
        nextAction: "Check the Hermes gateway version and retry.",
        retryable: false,
      });
    const refText =
      typeof response.ref_text === "string"
        ? response.ref_text
        : typeof response.refText === "string"
          ? response.refText
          : undefined;
    return {
      attached: response.attached,
      ...(typeof response.name === "string" ? { name: response.name } : {}),
      ...(refText ? { refText } : {}),
    };
  }

  private async call(operation: string, input: unknown): Promise<unknown> {
    this.ensureConnected(operation);
    this.ensureCapability(operation);
    try {
      return await this.transport.call(operation, input);
    } catch (error) {
      if (error instanceof HermesAdapterError) throw error;
      throw new HermesAdapterError({
        code: "TRANSPORT_CALL_FAILED",
        message: "Hermes transport call failed.",
        component: "hermes-adapter",
        operation,
        likelyCause: "The Hermes transport failed while handling the operation.",
        nextAction: "Check the Hermes gateway connection and retry the operation.",
        retryable: true,
      });
    }
  }

  private parseResponse<T>(operation: string, parse: () => T): T {
    try {
      return parse();
    } catch {
      throw new HermesAdapterError({
        code: "INVALID_RESPONSE",
        message: "Hermes returned an invalid response.",
        component: "hermes-adapter",
        operation,
        likelyCause: "The Hermes gateway returned data that does not match the adapter contract.",
        nextAction: "Check the gateway version and adapter compatibility.",
        retryable: false,
      });
    }
  }

  private delegateStream(operation: string, input: unknown): AsyncIterable<AgentEvent> {
    this.ensureConnected(operation);
    this.ensureCapability(operation);
    let source: AsyncIterable<unknown>;
    try {
      source = this.transport.stream(operation, input);
    } catch {
      throw this.streamError(operation);
    }
    const activeSecrets = this.activeSecrets;
    return {
      [Symbol.asyncIterator]: async function* () {
        const redactor = new StreamRedactor(activeSecrets);
        try {
          for await (const frame of source) {
            yield* normalizeStreamFrame(frame, redactor);
          }
          for (const frame of redactor.flushAll()) {
            yield* normalizeFlushedFrame(frame);
          }
        } catch (error) {
          for (const frame of redactor.flushAll()) {
            yield* normalizeFlushedFrame(frame);
          }
          if (error instanceof HermesAdapterError) throw error;
          throw new HermesAdapterError({
            code: "TRANSPORT_STREAM_FAILED",
            message: "Hermes transport stream failed.",
            component: "hermes-adapter",
            operation,
            likelyCause: "The Hermes transport failed while streaming the operation.",
            nextAction: "Check the Hermes gateway connection and retry the operation.",
            retryable: true,
          });
        }
      },
    };
  }

  private streamError(operation: string): HermesAdapterError {
    return new HermesAdapterError({
      code: "TRANSPORT_STREAM_FAILED",
      message: "Hermes transport stream failed.",
      component: "hermes-adapter",
      operation,
      likelyCause: "The Hermes transport failed while starting the operation.",
      nextAction: "Check the Hermes gateway connection and retry the operation.",
      retryable: true,
    });
  }

  private ensureConnected(operation: string): void {
    if (!this.connected) throw new InvalidAdapterStateError(operation);
  }

  private ensureCapability(operation: string): void {
    const capability = operationCapabilities[operation];
    if (
      capability &&
      !["observed", "source-inferred"].includes(
        this.capabilityRegistry.snapshot()[capability].status,
      )
    )
      throw new UnsupportedOperationError(operation);
  }
}

export function unavailableTransportError(code: string): HermesAdapterError {
  return new HermesAdapterError({
    code,
    message: "This adapter transport is only a placeholder.",
    component: "hermes-adapter",
    operation: "transport",
    likelyCause: "The selected transport implementation belongs to a later task.",
    nextAction: "Inject a transport implementation or complete the transport task.",
  });
}
