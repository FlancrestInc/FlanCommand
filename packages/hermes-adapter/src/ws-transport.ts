import { HermesAdapterError } from "./errors.js";
import { parseNativeFrame, type NativeHermesFrame } from "./native.js";
import { redactSafeText } from "@flancommand/event-schema";
import WebSocket from "ws";

interface SocketMessageEvent {
  data: unknown;
}

interface SocketCloseEvent {
  code?: number;
}

function isAuthCloseCode(code: number | undefined): boolean {
  return code === 1008 || code === 4401;
}

function closeDetail(code: number | undefined): string {
  return `WebSocket closed${code === undefined ? "" : ` with code ${code}`}.`;
}

export interface SocketLike {
  readyState: number;
  onopen: (() => void) | null | undefined;
  onmessage: ((event: SocketMessageEvent) => void) | null | undefined;
  onerror: (() => void) | null | undefined;
  onclose: ((event?: SocketCloseEvent) => void) | null | undefined;
  send(value: string): void;
  ping?(): void;
  close(): void;
}

export interface SocketFactory {
  (endpoint: string, options: { origin?: string }): SocketLike;
}

export interface HermesAuth {
  token?: string;
  ticket?: string;
  internal?: string;
}

export interface HermesDashboardAuth {
  username: string;
  password: string;
}

export type HttpRequest = (input: string, init?: RequestInit) => Promise<Response>;

export interface WebSocketTransportOptions {
  endpoint: string;
  origin?: string;
  auth?: HermesAuth;
  dashboardAuth?: HermesDashboardAuth;
  httpRequest?: HttpRequest;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
  idleTimeoutMs?: number;
  totalTimeoutMs?: number;
  heartbeatIntervalMs?: number;
  maxFrameBytes?: number;
  socketFactory?: SocketFactory;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(
  value: Record<string, unknown>,
  snakeKey: string,
  camelKey: string,
): string | undefined {
  const snakeValue = value[snakeKey];
  if (typeof snakeValue === "string") return snakeValue;
  const camelValue = value[camelKey];
  return typeof camelValue === "string" ? camelValue : undefined;
}

function rpcErrorDetail(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const code =
    typeof value.code === "string" || typeof value.code === "number"
      ? String(value.code)
      : undefined;
  const message = typeof value.message === "string" ? redactSafeText(value.message) : undefined;
  if (!code && !message) return undefined;
  return [code, message].filter(Boolean).join(": ");
}

interface PendingRequest {
  id: string;
  operation: string;
  stream?: StreamQueue;
  sessionId?: string;
  runId?: string;
  input?: unknown;
  awaitTerminal?: boolean;
  timer?: ReturnType<typeof setTimeout>;
  idleTimer?: ReturnType<typeof setTimeout>;
  resolve: (value: unknown) => void;
  reject: (error: HermesAdapterError) => void;
}

const wireMethods: Record<string, string> = {
  listSessions: "session.list",
  getSession: "session.resume",
  createSession: "session.create",
  resumeSession: "session.resume",
  listCommands: "commands.catalog",
  listModels: "model.options",
  setSessionModel: "config.set",
  sendMessage: "prompt.submit",
  dispatchCommand: "slash.exec",
  stopRun: "session.interrupt",
  retryTurn: "session.undo",
  approveAction: "approval.respond",
  denyAction: "approval.respond",
  provideCredential: "secret.respond",
  attachFile: "file.attach",
  attachImage: "image.attach_bytes",
};
const attachmentFrameBytes = 16 * 1024 * 1024;

function wireMethodForOperation(operation: string): string {
  return wireMethods[operation] ?? operation;
}

function wireParamsForOperation(operation: string, input: unknown): unknown {
  if (operation === "listModels") return { include_unconfigured: false };
  if (!isRecord(input)) return input;
  if (operation === "getSession" || operation === "resumeSession") {
    return { session_id: input.sessionId };
  }
  if (operation === "createSession") {
    return {
      ...(typeof input.title === "string" ? { title: input.title } : {}),
      ...(typeof input.modelId === "string" ? { model: input.modelId } : {}),
    };
  }
  if (operation === "setSessionModel") {
    return {
      session_id: input.sessionId,
      key: "model",
      value: input.modelId,
    };
  }
  if (operation === "sendMessage") {
    const nested = isRecord(input.input) ? input.input : {};
    return {
      session_id: input.sessionId,
      text: nested.text,
      ...(typeof nested.modelId === "string" ? { model: nested.modelId } : {}),
    };
  }
  if (operation === "dispatchCommand") {
    return { session_id: input.sessionId, command: input.command };
  }
  if (operation === "stopRun") {
    return { session_id: input.sessionId };
  }
  if (operation === "retryTurn") {
    return { session_id: input.sessionId };
  }
  if (operation === "approveAction" || operation === "denyAction") {
    return {
      session_id: input.sessionId,
      choice: operation === "approveAction" ? "approve" : "deny",
    };
  }
  if (operation === "provideCredential") {
    return {
      session_id: input.sessionId,
      request_id: input.requestId,
      value: input.value,
    };
  }
  if (operation === "attachFile") {
    return {
      session_id: input.sessionId,
      path: input.name,
      name: input.name,
      data_url: `data:${input.mimeType};base64,${input.contentBase64}`,
    };
  }
  if (operation === "attachImage") {
    return {
      session_id: input.sessionId,
      filename: input.name,
      content_base64: input.contentBase64,
    };
  }
  return input;
}

class StreamQueue {
  private readonly values: unknown[] = [];
  private readonly waiters: Array<{
    resolve: (result: IteratorResult<unknown>) => void;
    reject: (error: HermesAdapterError) => void;
  }> = [];
  private ended = false;
  private failure: HermesAdapterError | undefined;

  push(value: unknown): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter.resolve({ value, done: false });
    else this.values.push(value);
  }

  end(error?: HermesAdapterError): void {
    this.ended = true;
    this.failure = error;
    while (this.waiters.length) {
      const waiter = this.waiters.shift();
      if (!waiter) continue;
      if (error) waiter.reject(error);
      else waiter.resolve({ value: undefined, done: true });
    }
  }

  next(): Promise<IteratorResult<unknown>> {
    if (this.values.length) return Promise.resolve({ value: this.values.shift(), done: false });
    if (this.ended) return this.finish(undefined);
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  private finish(
    waiter:
      | {
          resolve: (result: IteratorResult<unknown>) => void;
          reject: (error: HermesAdapterError) => void;
        }
      | undefined,
  ) {
    if (this.failure) return Promise.reject(this.failure);
    const result = { value: undefined, done: true } as const;
    if (waiter) waiter.resolve(result);
    return Promise.resolve(result);
  }
}

class WsSocketAdapter implements SocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((event: SocketMessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event?: SocketCloseEvent) => void) | null = null;

  constructor(private readonly socket: WebSocket) {
    socket.on("open", () => this.onopen?.());
    socket.on("message", (data) => {
      const value = Buffer.isBuffer(data) ? data.toString("utf8") : data;
      this.onmessage?.({ data: value });
    });
    socket.on("error", () => this.onerror?.());
    socket.on("close", (code) => this.onclose?.({ code }));
  }

  get readyState(): number {
    return this.socket.readyState;
  }

  send(value: string): void {
    this.socket.send(value);
  }

  ping(): void {
    this.socket.ping();
  }

  close(): void {
    this.socket.close();
  }
}

const defaultSocketFactory: SocketFactory = (endpoint, options) =>
  new WsSocketAdapter(
    new WebSocket(endpoint, options.origin ? { headers: { Origin: options.origin } } : undefined),
  );

export class WebSocketHermesTransport {
  private socket: SocketLike | undefined;
  private connected = false;
  private connecting = false;
  private reconnecting = false;
  private hasConnectedBefore = false;
  private socketGeneration = 0;
  private readonly uncorrelatedBySession = new Map<string, NativeHermesFrame[]>();
  private readonly diagnosticEvents: NativeHermesFrame[] = [];
  private pending = new Map<string, PendingRequest>();
  private readonly sessionAliases = new Map<string, string>();
  private sequence = 0;
  private readonly cookies = new Map<string, string>();
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private readonly options: Required<
    Pick<
      WebSocketTransportOptions,
      | "connectTimeoutMs"
      | "requestTimeoutMs"
      | "idleTimeoutMs"
      | "totalTimeoutMs"
      | "heartbeatIntervalMs"
      | "maxFrameBytes"
    >
  > &
    WebSocketTransportOptions;

  constructor(options: WebSocketTransportOptions) {
    this.validateOptions(options);
    this.options = {
      connectTimeoutMs: 5_000,
      requestTimeoutMs: 10_000,
      idleTimeoutMs: 0,
      totalTimeoutMs: 0,
      heartbeatIntervalMs: 20_000,
      maxFrameBytes: 1_048_576,
      ...options,
    };
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    if (this.connecting) {
      await new Promise<void>((resolve, reject) => {
        const check = () => {
          if (this.connected) resolve();
          else if (!this.connecting) reject(this.error("TRANSPORT_CONNECT_FAILED", "connect"));
          else setTimeout(check, 0);
        };
        check();
      });
      return;
    }
    this.connecting = true;
    this.reconnecting = this.hasConnectedBefore;
    if (this.socket) this.detachSocket(this.socket);
    const generation = ++this.socketGeneration;
    const endpoint = this.options.dashboardAuth
      ? await this.dashboardAuthenticatedEndpoint()
      : this.authenticatedEndpoint();
    const socket = (this.options.socketFactory ?? defaultSocketFactory)(endpoint, {
      ...(this.options.origin ? { origin: this.options.origin } : {}),
    });
    this.socket = socket;
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(this.error("TRANSPORT_CONNECT_TIMEOUT", "connect")),
          this.options.connectTimeoutMs,
        );
        const ready = () => {
          if (!this.isCurrentSocket(socket, generation)) return;
          clearTimeout(timer);
          this.connected = true;
          this.hasConnectedBefore = true;
          this.startHeartbeat(socket, generation);
          this.reconnectStreams();
          resolve();
        };
        socket.onopen = () => {
          if (!this.isCurrentSocket(socket, generation)) return;
        };
        socket.onerror = () => {
          if (this.isCurrentSocket(socket, generation))
            reject(this.error("TRANSPORT_HANDSHAKE_FAILED", "connect"));
        };
        socket.onmessage = (event) => {
          if (this.isCurrentSocket(socket, generation)) void this.handleMessage(event.data, ready);
        };
        socket.onclose = (event) => {
          if (!this.isCurrentSocket(socket, generation)) return;
          const error = isAuthCloseCode(event?.code)
            ? this.error("TRANSPORT_AUTH_FAILED", "close", closeDetail(event?.code))
            : this.error("TRANSPORT_HANDSHAKE_FAILED", "close", closeDetail(event?.code));
          if (!this.connected) reject(error);
          this.handleClose(event);
        };
      });
    } catch (error) {
      this.closeState(
        error instanceof HermesAdapterError
          ? error
          : this.error("TRANSPORT_CONNECT_FAILED", "connect"),
        this.reconnecting,
      );
      this.detachSocket(socket);
      if (this.socket === socket) this.socket = undefined;
      socket.close();
      throw error;
    } finally {
      this.connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    this.socketGeneration += 1;
    this.stopHeartbeat();
    this.closeState(this.error("TRANSPORT_CLOSED", "disconnect"), false);
    if (this.socket) this.detachSocket(this.socket);
    this.socket?.close();
    this.socket = undefined;
  }

  async call(operation: string, input: unknown): Promise<unknown> {
    this.ensureConnected(operation);
    const id = this.nextId();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => this.fail(id, this.error("TRANSPORT_TIMEOUT", operation)),
        this.options.requestTimeoutMs,
      );
      this.pending.set(id, { id, operation, input, timer, resolve, reject });
      try {
        this.send(
          wireMethodForOperation(operation),
          this.wireParams(operation, input),
          id,
          operation,
        );
      } catch (error) {
        this.fail(
          id,
          error instanceof HermesAdapterError
            ? error
            : this.error("TRANSPORT_SEND_FAILED", operation),
        );
      }
    });
  }

  stream(operation: string, input: unknown): AsyncIterable<unknown> {
    this.ensureConnected(operation);
    const id = this.nextId();
    const queue = new StreamQueue();
    const sessionId =
      isRecord(input) && typeof input.sessionId === "string" ? input.sessionId : undefined;
    const runId = isRecord(input) && typeof input.runId === "string" ? input.runId : undefined;
    const timer =
      this.options.totalTimeoutMs > 0
        ? setTimeout(
            () => this.fail(id, this.error("TRANSPORT_TIMEOUT", operation)),
            this.options.totalTimeoutMs,
          )
        : undefined;
    this.pending.set(id, {
      id,
      operation,
      stream: queue,
      sessionId,
      runId,
      input,
      awaitTerminal: operation === "sendMessage",
      timer,
      resolve: () => undefined,
      reject: () => undefined,
    });
    if (this.options.idleTimeoutMs > 0) {
      this.pending.get(id)!.idleTimer = setTimeout(
        () => this.fail(id, this.error("TRANSPORT_IDLE_TIMEOUT", operation)),
        this.options.idleTimeoutMs,
      );
    }
    try {
      this.send(
        wireMethodForOperation(operation),
        this.wireParams(operation, input),
        id,
        operation,
      );
    } catch (error) {
      this.fail(
        id,
        error instanceof HermesAdapterError
          ? error
          : this.error("TRANSPORT_SEND_FAILED", operation),
      );
    }
    return { [Symbol.asyncIterator]: () => ({ next: () => queue.next() }) };
  }

  async safeState(): Promise<unknown> {
    return {
      connected: this.connected,
      endpoint: redactSafeText(this.options.endpoint),
      pending: this.pending.size,
    };
  }

  private send(method: string, params: unknown, id?: string, operation?: string): void {
    const socket = this.socket;
    if (!socket) throw this.error("TRANSPORT_CLOSED", method);
    const value = JSON.stringify({
      jsonrpc: "2.0",
      ...(id ? { id } : {}),
      method,
      ...(params !== undefined ? { params } : {}),
    });
    const maxBytes =
      operation === "attachFile" || operation === "attachImage"
        ? Math.max(this.options.maxFrameBytes, attachmentFrameBytes)
        : this.options.maxFrameBytes;
    if (new TextEncoder().encode(value).byteLength > maxBytes)
      throw this.error("TRANSPORT_FRAME_TOO_LARGE", "send");
    socket.send(value);
  }

  private wireParams(operation: string, input: unknown): unknown {
    const params = wireParamsForOperation(operation, input);
    if (!isRecord(params) || typeof params.session_id !== "string") return params;
    const alias = this.sessionAliases.get(params.session_id);
    return alias ? { ...params, session_id: alias } : params;
  }

  private async handleMessage(data: unknown, onReady?: () => void): Promise<void> {
    if (
      (data instanceof ArrayBuffer && data.byteLength > this.options.maxFrameBytes) ||
      (typeof Blob !== "undefined" &&
        data instanceof Blob &&
        data.size > this.options.maxFrameBytes)
    ) {
      this.failAll(this.error("TRANSPORT_FRAME_TOO_LARGE", "receive"));
      return;
    }
    const text = await this.decode(data);
    if (text === undefined) return;
    if (new TextEncoder().encode(text).byteLength > this.options.maxFrameBytes) {
      this.failAll(this.error("TRANSPORT_FRAME_TOO_LARGE", "receive"));
      return;
    }
    let frame: unknown;
    try {
      frame = JSON.parse(text) as unknown;
    } catch {
      this.failAll(this.error("TRANSPORT_PARSE_FAILED", "receive"));
      return;
    }
    if (!isRecord(frame) || frame.jsonrpc !== "2.0") {
      this.failAll(this.error("TRANSPORT_PARSE_FAILED", "receive"));
      return;
    }
    if (frame.method === "event") {
      if (this.isReadyEvent(frame)) onReady?.();
      this.deliverEvent(frame as unknown as NativeHermesFrame);
      return;
    }
    if (frame.id === undefined) return;
    const id = String(frame.id);
    const request = this.pending.get(id);
    if (!request) return;
    const hasResult = Object.prototype.hasOwnProperty.call(frame, "result");
    const hasError = Object.prototype.hasOwnProperty.call(frame, "error");
    if (hasResult === hasError) {
      this.fail(id, this.error("TRANSPORT_MALFORMED_RESPONSE", request.operation));
      return;
    }
    if (
      (request.operation === "resumeSession" || request.operation === "getSession") &&
      isRecord(frame.result)
    ) {
      const requested = isRecord(request.input) ? request.input.sessionId : undefined;
      const live = frame.result.session_id;
      if (typeof requested === "string" && typeof live === "string" && requested !== live)
        this.sessionAliases.set(requested, live);
    }
    if (request.stream) {
      if (hasError) {
        clearTimeout(request.timer);
        if (request.idleTimer) clearTimeout(request.idleTimer);
        this.pending.delete(id);
        request.stream.end(
          this.error("TRANSPORT_REQUEST_FAILED", request.operation, rpcErrorDetail(frame.error)),
        );
        return;
      }
      if (Array.isArray(frame.result)) frame.result.forEach((value) => request.stream?.push(value));
      const streamingAcknowledged =
        request.awaitTerminal && isRecord(frame.result) && frame.result.status === "streaming";
      if (streamingAcknowledged) {
        if (this.options.idleTimeoutMs > 0) {
          request.idleTimer = setTimeout(
            () => this.fail(id, this.error("TRANSPORT_IDLE_TIMEOUT", request.operation)),
            this.options.idleTimeoutMs,
          );
        }
        return;
      }
      clearTimeout(request.timer);
      if (request.idleTimer) clearTimeout(request.idleTimer);
      this.pending.delete(id);
      request.stream.end();
      return;
    }
    clearTimeout(request.timer);
    if (request.idleTimer) clearTimeout(request.idleTimer);
    this.pending.delete(id);
    if (hasError)
      request.reject(
        this.error("TRANSPORT_REQUEST_FAILED", request.operation, rpcErrorDetail(frame.error)),
      );
    else request.resolve(frame.result);
  }

  private deliverEvent(frame: NativeHermesFrame): void {
    const params = isRecord(frame.params) ? frame.params : {};
    const payload = isRecord(params.payload) ? params.payload : {};
    const requestId =
      stringValue(params, "request_id", "requestId") ??
      stringValue(payload, "request_id", "requestId");
    const sessionId =
      stringValue(params, "session_id", "sessionId") ??
      stringValue(payload, "session_id", "sessionId");
    const runId = stringValue(params, "run_id", "runId") ?? stringValue(payload, "run_id", "runId");
    const eventType = typeof params.type === "string" ? params.type : undefined;
    const terminal = new Set(["message.complete", "error", "session.interrupt", "turn.interrupt"]);
    const targets = [...this.pending.values()].filter((request) => {
      if (!request.stream) return false;
      if (requestId !== undefined) return String(requestId) === request.id;
      if (sessionId === undefined) return false;
      const liveSessionId = request.sessionId
        ? this.sessionAliases.get(request.sessionId)
        : undefined;
      return (
        (request.sessionId === sessionId || liveSessionId === sessionId) &&
        (runId === undefined || request.runId === undefined || request.runId === runId)
      );
    });
    if (!targets.length) {
      if (sessionId) {
        const events = this.uncorrelatedBySession.get(sessionId) ?? [];
        events.push(frame);
        this.uncorrelatedBySession.set(sessionId, events.slice(-64));
      } else {
        this.diagnosticEvents.push(frame);
        if (this.diagnosticEvents.length > 64) this.diagnosticEvents.shift();
      }
      return;
    }
    for (const target of targets) {
      if (target.idleTimer) clearTimeout(target.idleTimer);
      if (this.options.idleTimeoutMs > 0) {
        target.idleTimer = setTimeout(
          () => this.fail(target.id, this.error("TRANSPORT_IDLE_TIMEOUT", target.operation)),
          this.options.idleTimeoutMs,
        );
      }
      target.stream?.push(frame);
      if (target.awaitTerminal && terminal.has(eventType ?? "")) {
        clearTimeout(target.timer);
        if (target.idleTimer) clearTimeout(target.idleTimer);
        this.pending.delete(target.id);
        target.stream?.end();
      }
    }
  }

  private async decode(data: unknown): Promise<string | undefined> {
    if (typeof data === "string") return data;
    if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
    if (typeof Blob !== "undefined" && data instanceof Blob) return data.text();
    this.failAll(this.error("TRANSPORT_PARSE_FAILED", "receive"));
    return undefined;
  }

  private handleClose(event?: SocketCloseEvent): void {
    this.stopHeartbeat();
    if (this.socket) this.detachSocket(this.socket);
    const error = isAuthCloseCode(event?.code)
      ? this.error("TRANSPORT_AUTH_FAILED", "close", closeDetail(event?.code))
      : this.error("TRANSPORT_CLOSED", "close", closeDetail(event?.code));
    // A Hermes v0.19 stream cannot be replayed by the transport. Leaving
    // pending streams alive here makes the API wait until the idle timeout
    // and leaves the conversation looking permanently busy. Fail them now;
    // the API can mark the run terminal and the user can retry safely.
    this.closeState(error, false);
  }

  private detachSocket(socket: SocketLike): void {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
  }

  private startHeartbeat(socket: SocketLike, generation: number): void {
    this.stopHeartbeat();
    const interval = this.options.heartbeatIntervalMs;
    if (interval <= 0 || !socket.ping) return;
    const timer = setInterval(() => {
      if (!this.isCurrentSocket(socket, generation) || !this.connected) return;
      try {
        socket.ping?.();
      } catch {
        this.handleClose({ code: 1006 });
      }
    }, interval);
    timer.unref?.();
    this.heartbeatTimer = timer;
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  private isReadyEvent(frame: unknown): boolean {
    if (!isRecord(frame) || frame.method !== "event" || !isRecord(frame.params)) return false;
    if (frame.params.type !== "gateway.ready" || !isRecord(frame.params.payload)) return false;
    try {
      parseNativeFrame(frame);
      return true;
    } catch {
      return false;
    }
  }

  private closeState(error: HermesAdapterError, preserveStreams: boolean): void {
    this.connected = false;
    this.connecting = false;
    this.failAll(error, !preserveStreams);
  }

  private failAll(error: HermesAdapterError, includeStreams = true): void {
    for (const [id, request] of [...this.pending.entries()]) {
      if (!includeStreams && request.stream) continue;
      this.fail(id, error);
    }
  }

  private reconnectStreams(): void {
    if (!this.reconnecting) return;
    const streams = [...this.pending.values()].filter((request) => request.stream);
    // Hermes v0.19 has no supported stream replay RPC. The caller owns
    // session.resume after this gap event.
    for (const request of streams) {
      request.stream?.push({
        type: "reconnect.gap",
        ...(request.sessionId ? { sessionId: request.sessionId } : {}),
        ...(request.runId ? { runId: request.runId } : {}),
        reason: "Hermes v0.19 has no supported stream replay method; call session.resume.",
      });
    }
  }

  private authenticatedEndpoint(): string {
    const endpoint = new URL(this.options.endpoint);
    const auth = this.options.auth;
    if (auth) {
      const entries = Object.entries(auth).filter(([, value]) => value !== undefined);
      if (entries.length === 1) endpoint.searchParams.set(entries[0]![0], entries[0]![1]!);
    }
    return endpoint.toString();
  }

  private async dashboardAuthenticatedEndpoint(): Promise<string> {
    const endpoint = new URL(this.options.endpoint);
    const dashboardAuth = this.options.dashboardAuth;
    if (!dashboardAuth) return endpoint.toString();
    const request = this.options.httpRequest ?? fetch;
    const base = `${endpoint.protocol === "wss:" ? "https:" : "http:"}//${endpoint.host}`;
    const login = await request(`${base}/auth/password-login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "basic",
        username: dashboardAuth.username,
        password: dashboardAuth.password,
        next: "/",
      }),
    });
    if (!login.ok) throw this.error("TRANSPORT_AUTH_FAILED", "login");
    this.captureCookies(login.headers);
    const ticket = await request(`${base}/api/auth/ws-ticket`, {
      method: "POST",
      headers: this.cookies.size ? { Cookie: this.cookieHeader() } : undefined,
    });
    if (!ticket.ok) throw this.error("TRANSPORT_AUTH_FAILED", "ticket");
    const payload = (await ticket.json()) as unknown;
    if (!isRecord(payload) || typeof payload.ticket !== "string" || !payload.ticket) {
      throw this.error("TRANSPORT_AUTH_FAILED", "ticket");
    }
    endpoint.searchParams.set("ticket", payload.ticket);
    return endpoint.toString();
  }

  private captureCookies(headers: Headers): void {
    const extended = headers as Headers & { getSetCookie?: () => string[] };
    const values =
      extended.getSetCookie?.() ?? headers.get("set-cookie")?.split(/,(?=\s*[^;,=]+=)/) ?? [];
    for (const value of values) {
      const pair = value.split(";", 1)[0] ?? "";
      const separator = pair.indexOf("=");
      if (separator > 0) this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }

  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  private isCurrentSocket(socket: SocketLike, generation: number): boolean {
    return this.socket === socket && this.socketGeneration === generation;
  }

  private validateOptions(options: WebSocketTransportOptions): void {
    let origin: URL;
    try {
      origin = new URL(options.origin ?? "");
    } catch {
      throw this.error("TRANSPORT_CONFIG_INVALID", "constructor");
    }
    if (
      !origin ||
      !["http:", "https:"].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    )
      throw this.error("TRANSPORT_CONFIG_INVALID", "constructor");
    if (options.auth !== undefined) {
      if (!isRecord(options.auth)) throw this.error("TRANSPORT_CONFIG_INVALID", "constructor");
      const entries = Object.entries(options.auth);
      if (
        entries.length !== 1 ||
        !["token", "ticket", "internal"].includes(entries[0]![0]) ||
        typeof entries[0]![1] !== "string" ||
        !entries[0]![1]
      )
        throw this.error("TRANSPORT_CONFIG_INVALID", "constructor");
    }
    if (options.dashboardAuth !== undefined) {
      if (
        !isRecord(options.dashboardAuth) ||
        typeof options.dashboardAuth.username !== "string" ||
        !options.dashboardAuth.username ||
        typeof options.dashboardAuth.password !== "string" ||
        !options.dashboardAuth.password
      )
        throw this.error("TRANSPORT_CONFIG_INVALID", "constructor");
      if (options.auth !== undefined) throw this.error("TRANSPORT_CONFIG_INVALID", "constructor");
    }
  }

  private fail(id: string, error: HermesAdapterError): void {
    const request = this.pending.get(id);
    if (!request) return;
    clearTimeout(request.timer);
    if (request.idleTimer) clearTimeout(request.idleTimer);
    this.pending.delete(id);
    if (request.stream) request.stream.end(error);
    else request.reject(error);
  }

  private ensureConnected(operation: string): void {
    if (!this.connected || !this.socket) throw this.error("TRANSPORT_CLOSED", operation);
  }

  private nextId(): string {
    this.sequence += 1;
    return `hermes-${this.sequence}`;
  }

  private error(code: string, operation: string, detail?: string): HermesAdapterError {
    return new HermesAdapterError({
      code,
      message: detail
        ? `Hermes WebSocket transport failed: ${detail}`
        : "Hermes WebSocket transport failed.",
      component: "hermes-websocket",
      operation,
      likelyCause:
        "The Hermes gateway connection did not complete the requested transport operation.",
      nextAction: "Check the gateway endpoint, origin, query authentication, and connection state.",
      retryable:
        code !== "TRANSPORT_PARSE_FAILED" &&
        code !== "TRANSPORT_FRAME_TOO_LARGE" &&
        code !== "TRANSPORT_AUTH_FAILED" &&
        code !== "TRANSPORT_CONFIG_INVALID" &&
        code !== "TRANSPORT_MALFORMED_RESPONSE",
    });
  }
}
