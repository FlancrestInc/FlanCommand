import { describe, expect, it, vi } from "vitest";

const DefaultWebSocket = vi.hoisted(() => {
  class MockWebSocket {
    static readonly instances: MockWebSocket[] = [];
    private readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    readonly readyState = 0;

    constructor(
      readonly endpoint: string,
      readonly options: Record<string, unknown>,
    ) {
      MockWebSocket.instances.push(this);
    }

    on(event: string, listener: (...args: unknown[]) => void): void {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    }

    emit(event: string, ...args: unknown[]): void {
      for (const listener of this.listeners.get(event) ?? []) listener(...args);
    }

    send(): void {}

    close(): void {}
  }

  return MockWebSocket;
});

vi.mock("ws", () => ({ default: DefaultWebSocket }));

import { WebSocketHermesTransport, type SocketFactory, type SocketLike } from "./ws-transport.js";

class FakeSocket implements SocketLike {
  static readonly instances: FakeSocket[] = [];
  readonly sent: string[] = [];
  onopen: (() => void) | undefined;
  onmessage: ((event: { data: unknown }) => void) | undefined;
  onerror: (() => void) | undefined;
  onclose: ((event?: { code?: number }) => void) | undefined;
  readyState = 0;

  constructor(
    readonly endpoint: string,
    readonly options: Record<string, unknown>,
  ) {
    FakeSocket.instances.push(this);
  }

  send(value: string): void {
    this.sent.push(value);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(value: unknown): void {
    this.onmessage?.({ data: value });
  }

  closeFromPeer(event?: { code?: number }): void {
    this.readyState = 3;
    this.onclose?.(event);
  }
}

const factory: SocketFactory = (endpoint, options) => new FakeSocket(endpoint, options);

function request(socket: FakeSocket): Record<string, unknown> {
  return JSON.parse(socket.sent.at(-1) ?? "{}") as Record<string, unknown>;
}

function openReady(socket: FakeSocket): void {
  socket.open();
  socket.receive(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "event",
      params: { type: "gateway.ready", payload: {} },
    }),
  );
}

describe("WebSocket Hermes transport", () => {
  it("logs in and uses a fresh Hermes dashboard ticket for each connection", async () => {
    FakeSocket.instances.length = 0;
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    let ticketNumber = 0;
    const httpRequest = async (url: string, init?: RequestInit): Promise<Response> => {
      requests.push({ url, init });
      if (url.endsWith("/auth/password-login")) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "set-cookie": "session=one; Path=/" },
        });
      }
      ticketNumber += 1;
      return new Response(JSON.stringify({ ticket: `ticket-${ticketNumber}` }), { status: 200 });
    };
    const transport = new WebSocketHermesTransport({
      endpoint: "ws://gospel.test:9119/api/ws",
      origin: "http://gospel.test:9119",
      dashboardAuth: { username: "flan", password: "password" },
      httpRequest,
      socketFactory: factory,
    });

    const first = transport.connect();
    await new Promise<void>((resolve) => setImmediate(resolve));
    const firstSocket = FakeSocket.instances[0]!;
    expect(requests[0]).toMatchObject({
      url: "http://gospel.test:9119/auth/password-login",
      init: expect.objectContaining({ method: "POST" }),
    });
    openReady(firstSocket);
    await first;
    expect(firstSocket.endpoint).toBe("ws://gospel.test:9119/api/ws?ticket=ticket-1");

    await transport.disconnect();
    const second = transport.connect();
    await new Promise<void>((resolve) => setImmediate(resolve));
    const secondSocket = FakeSocket.instances[1]!;
    openReady(secondSocket);
    await second;
    expect(secondSocket.endpoint).toBe("ws://gospel.test:9119/api/ws?ticket=ticket-2");
    expect(requests.filter((request) => request.url.endsWith("/api/auth/ws-ticket"))).toHaveLength(2);
    expect(requests[1]?.init).toEqual(
      expect.objectContaining({ headers: { Cookie: "session=one" } }),
    );
    expect(JSON.stringify(await transport.safeState())).not.toContain("password");
    expect(JSON.stringify(await transport.safeState())).not.toContain("ticket-1");
  });

  it("configures the default server-side socket with the requested Origin header", async () => {
    DefaultWebSocket.instances.length = 0;
    const transport = new WebSocketHermesTransport({
      endpoint: "ws://hermes.test/api/ws",
      origin: "http://localhost:5173",
    });
    const connecting = transport.connect();
    const socket = DefaultWebSocket.instances[0]!;

    expect(socket.options).toEqual({ headers: { Origin: "http://localhost:5173" } });
    socket.emit("open");
    socket.emit(
      "message",
      JSON.stringify({
        jsonrpc: "2.0",
        method: "event",
        params: { type: "gateway.ready", payload: {} },
      }),
    );
    await expect(connecting).resolves.toBeUndefined();
  });

  it("opens with query auth and never leaks credentials into socket headers or safe state", async () => {
    FakeSocket.instances.length = 0;
    const transport = new WebSocketHermesTransport({
      endpoint: "ws://127.0.0.1:9119/api/ws",
      origin: "http://localhost:5173",
      auth: { token: "secret-value" },
      socketFactory: factory,
    });
    const connecting = transport.connect();
    const socket = FakeSocket.instances[0];
    openReady(socket!);
    await connecting;

    expect(socket?.endpoint).toBe("ws://127.0.0.1:9119/api/ws?token=secret-value");
    expect(socket?.options).toEqual({
      origin: "http://localhost:5173",
    });
    expect(JSON.stringify(await transport.safeState())).not.toContain("secret-value");
  });

  it.each([
    ["token", "token-value"],
    ["ticket", "ticket-value"],
    ["internal", "internal-value"],
  ] as const)("builds %s auth as a URL query", async (kind, value) => {
    FakeSocket.instances.length = 0;
    const transport = new WebSocketHermesTransport({
      endpoint: "ws://127.0.0.1:9119/api/ws?existing=value",
      origin: "http://localhost:5173",
      auth: { [kind]: value },
      socketFactory: factory,
    });
    const connecting = transport.connect();
    const socket = FakeSocket.instances[0]!;
    expect(new URL(socket.endpoint).searchParams.get(kind)).toBe(value);
    expect(new URL(socket.endpoint).searchParams.get("existing")).toBe("value");
    expect(socket.options).not.toHaveProperty("headers");
    openReady(socket);
    await connecting;
  });

  it("allows loopback connections without auth", async () => {
    FakeSocket.instances.length = 0;
    const transport = new WebSocketHermesTransport({
      endpoint: "ws://127.0.0.1:9119/api/ws",
      origin: "http://localhost:5173",
      socketFactory: factory,
    });
    const connecting = transport.connect();
    const socket = FakeSocket.instances[0]!;
    expect(socket.endpoint).toBe("ws://127.0.0.1:9119/api/ws");
    expect(socket.options).toEqual({ origin: "http://localhost:5173" });
    openReady(socket);
    await connecting;
  });

  it("does not resolve connect until Hermes sends a real gateway.ready event", async () => {
    FakeSocket.instances.length = 0;
    const transport = new WebSocketHermesTransport({
      endpoint: "ws://test",
      origin: "http://localhost:5173",
      socketFactory: factory,
    });
    const connecting = transport.connect();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    let settled = false;
    void connecting.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    socket.receive(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "event",
        params: { type: "gateway.ready", payload: {} },
      }),
    );
    await expect(connecting).resolves.toBeUndefined();
  });

  it("closes and detaches the socket after a connect timeout", async () => {
    FakeSocket.instances.length = 0;
    vi.useFakeTimers();
    const transport = new WebSocketHermesTransport({
      endpoint: "ws://test",
      origin: "http://localhost:5173",
      connectTimeoutMs: 20,
      socketFactory: factory,
    });
    const connecting = transport.connect();
    const socket = FakeSocket.instances[0]!;
    const rejection = expect(connecting).rejects.toMatchObject({
      code: "TRANSPORT_CONNECT_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(21);
    await rejection;
    expect(socket.readyState).toBe(3);
    expect(socket.onopen).toBeNull();
    expect(socket.onmessage).toBeNull();
    expect(socket.onerror).toBeNull();
    expect(socket.onclose).toBeNull();
    vi.useRealTimers();
  });

  it("routes real Hermes events using snake and camel IDs from params and payload", async () => {
    FakeSocket.instances.length = 0;
    const transport = new WebSocketHermesTransport({
      endpoint: "ws://test",
      origin: "http://localhost:5173",
      socketFactory: factory,
    });
    const connecting = transport.connect();
    const socket = FakeSocket.instances[0]!;
    openReady(socket);
    await connecting;
    const stream = transport
      .stream("sendMessage", { sessionId: "session-1", runId: "run-1" })
      [Symbol.asyncIterator]();
    socket.receive(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "event",
        params: {
          type: "message.delta",
          session_id: "session-1",
          payload: { run_id: "run-1", text: "hello" },
        },
      }),
    );
    await expect(stream.next()).resolves.toMatchObject({
      value: expect.objectContaining({ method: "event" }),
      done: false,
    });
  });

  it("matches concurrent responses by request id", async () => {
    FakeSocket.instances.length = 0;
    const transport = new WebSocketHermesTransport({
      endpoint: "ws://test",
      origin: "http://localhost:5173",
      socketFactory: factory,
    });
    const connected = transport.connect();
    const socket = FakeSocket.instances[0];
    openReady(socket!);
    await connected;

    const first = transport.call("first", { value: 1 });
    const firstRequest = request(socket!);
    const second = transport.call("second", { value: 2 });
    const secondRequest = request(socket!);
    socket?.receive(JSON.stringify({ jsonrpc: "2.0", id: secondRequest.id, result: "two" }));
    socket?.receive(JSON.stringify({ jsonrpc: "2.0", id: firstRequest.id, result: "one" }));

    await expect(first).resolves.toBe("one");
    await expect(second).resolves.toBe("two");
  });

  it("delivers native event frames to a stream and closes after its response", async () => {
    FakeSocket.instances.length = 0;
    const transport = new WebSocketHermesTransport({
      endpoint: "ws://test",
      origin: "http://localhost:5173",
      socketFactory: factory,
    });
    const connected = transport.connect();
    const socket = FakeSocket.instances[0];
    openReady(socket!);
    await connected;

    const stream = transport.stream("sendMessage", { sessionId: "s-1" })[Symbol.asyncIterator]();
    const streamRequest = request(socket!);
    socket?.receive(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "event",
        params: {
          type: "message.delta",
          sessionId: "s-1",
          payload: { runId: "r-1", text: "hello" },
        },
      }),
    );
    socket?.receive(JSON.stringify({ jsonrpc: "2.0", id: streamRequest.id, result: null }));

    await expect(stream.next()).resolves.toMatchObject({
      value: expect.objectContaining({ method: "event" }),
      done: false,
    });
    await expect(stream.next()).resolves.toEqual({ value: undefined, done: true });
  });

  it("keeps prompt streams open after Hermes returns its streaming acknowledgment", async () => {
    FakeSocket.instances.length = 0;
    const transport = new WebSocketHermesTransport({
      endpoint: "ws://test",
      origin: "http://localhost:5173",
      socketFactory: factory,
    });
    const connected = transport.connect();
    const socket = FakeSocket.instances[0]!;
    openReady(socket);
    await connected;

    const stream = transport
      .stream("sendMessage", { sessionId: "s-1", input: { text: "hello" } })
      [Symbol.asyncIterator]();
    const streamRequest = request(socket);
    socket.receive(
      JSON.stringify({
        jsonrpc: "2.0",
        id: streamRequest.id,
        result: { status: "streaming" },
      }),
    );

    let settled = false;
    const first = stream.next().then((value) => {
      settled = true;
      return value;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    socket.receive(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "event",
        params: {
          type: "message.delta",
          session_id: "s-1",
          payload: { run_id: "run-1", text: "hello" },
        },
      }),
    );
    socket.receive(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "event",
        params: {
          type: "message.complete",
          session_id: "s-1",
          payload: { run_id: "run-1", text: "hello" },
        },
      }),
    );

    await expect(first).resolves.toMatchObject({
      value: expect.objectContaining({ method: "event" }),
      done: false,
    });
    await expect(stream.next()).resolves.toMatchObject({
      value: expect.objectContaining({ method: "event" }),
      done: false,
    });
    await expect(stream.next()).resolves.toEqual({ value: undefined, done: true });
  });

  it("uses the live session id returned by resume for later prompts", async () => {
    FakeSocket.instances.length = 0;
    const transport = new WebSocketHermesTransport({
      endpoint: "ws://test",
      origin: "http://localhost:5173",
      socketFactory: factory,
    });
    const connected = transport.connect();
    const socket = FakeSocket.instances[0]!;
    openReady(socket);
    await connected;

    const resumed = transport.call("resumeSession", { sessionId: "stored-session" });
    const resumeRequest = request(socket);
    socket.receive(
      JSON.stringify({
        jsonrpc: "2.0",
        id: resumeRequest.id,
        result: { session_id: "live-session", message_count: 0, messages: [] },
      }),
    );
    await expect(resumed).resolves.toMatchObject({ session_id: "live-session" });

    transport.stream("sendMessage", { sessionId: "stored-session", input: { text: "hello" } });
    expect(request(socket).params).toMatchObject({ session_id: "live-session" });
  });

  it("maps retry requests to Hermes session.undo", async () => {
    FakeSocket.instances.length = 0;
    const transport = new WebSocketHermesTransport({
      endpoint: "ws://test",
      origin: "http://localhost:5173",
      socketFactory: factory,
    });
    const connected = transport.connect();
    const socket = FakeSocket.instances[0]!;
    openReady(socket);
    await connected;

    const retry = transport.call("retryTurn", { sessionId: "session-1", turnId: "turn-1" });
    const retryRequest = request(socket);
    expect(retryRequest).toMatchObject({
      method: "session.undo",
      params: { session_id: "session-1" },
    });
    socket.receive(JSON.stringify({ jsonrpc: "2.0", id: retryRequest.id, result: { removed: 2 } }));
    await expect(retry).resolves.toEqual({ removed: 2 });
  });

  it("maps session model changes to Hermes config.set", async () => {
    FakeSocket.instances.length = 0;
    const transport = new WebSocketHermesTransport({
      endpoint: "ws://test",
      origin: "http://localhost:5173",
      socketFactory: factory,
    });
    const connected = transport.connect();
    const socket = FakeSocket.instances[0]!;
    openReady(socket);
    await connected;
    const change = transport.call("setSessionModel", {
      sessionId: "session-1",
      modelId: "openai/gpt-5",
    });
    const modelRequest = request(socket);
    expect(modelRequest).toMatchObject({
      method: "config.set",
      params: { session_id: "session-1", key: "model", value: "openai/gpt-5" },
    });
    socket.receive(
      JSON.stringify({ jsonrpc: "2.0", id: modelRequest.id, result: { value: "openai/gpt-5" } }),
    );
    await expect(change).resolves.toEqual({ value: "openai/gpt-5" });
  });

  it("maps approval decisions to Hermes approval.respond", async () => {
    FakeSocket.instances.length = 0;
    const transport = new WebSocketHermesTransport({
      endpoint: "ws://test",
      origin: "http://localhost:5173",
      socketFactory: factory,
    });
    const connected = transport.connect();
    const socket = FakeSocket.instances[0]!;
    openReady(socket);
    await connected;

    const approve = transport.call("approveAction", {
      actionId: "approval-1",
      sessionId: "session-1",
    });
    const approveRequest = request(socket);
    expect(approveRequest).toMatchObject({
      method: "approval.respond",
      params: { session_id: "session-1", choice: "approve" },
    });
    socket.receive(
      JSON.stringify({ jsonrpc: "2.0", id: approveRequest.id, result: { status: "ok" } }),
    );
    await expect(approve).resolves.toEqual({ status: "ok" });
  });

  it("maps server-side credential responses to Hermes secret.respond", async () => {
    FakeSocket.instances.length = 0;
    const transport = new WebSocketHermesTransport({
      endpoint: "ws://test",
      origin: "http://localhost:5173",
      socketFactory: factory,
    });
    const connected = transport.connect();
    const socket = FakeSocket.instances[0]!;
    openReady(socket);
    await connected;

    const provide = transport.call("provideCredential", {
      sessionId: "session-1",
      requestId: "request-1",
      value: "server-only-secret",
    });
    const provideRequest = request(socket);
    expect(provideRequest).toMatchObject({
      method: "secret.respond",
      params: {
        session_id: "session-1",
        request_id: "request-1",
        value: "server-only-secret",
      },
    });
    socket.receive(
      JSON.stringify({ jsonrpc: "2.0", id: provideRequest.id, result: { resolved: true } }),
    );
    await expect(provide).resolves.toEqual({ resolved: true });
  });

  it("maps file and image attachments to Hermes upload RPCs", async () => {
    FakeSocket.instances.length = 0;
    const transport = new WebSocketHermesTransport({
      endpoint: "ws://test",
      origin: "http://localhost:5173",
      socketFactory: factory,
    });
    const connected = transport.connect();
    const socket = FakeSocket.instances[0]!;
    openReady(socket);
    await connected;

    const file = transport.call("attachFile", {
      sessionId: "session-1",
      name: "notes.txt",
      mimeType: "text/plain",
      contentBase64: "aGVsbG8=",
    });
    const fileRequest = request(socket);
    expect(fileRequest).toMatchObject({
      method: "file.attach",
      params: {
        session_id: "session-1",
        path: "notes.txt",
        name: "notes.txt",
        data_url: "data:text/plain;base64,aGVsbG8=",
      },
    });
    socket.receive(
      JSON.stringify({
        jsonrpc: "2.0",
        id: fileRequest.id,
        result: { attached: true, ref_text: "@file:notes.txt" },
      }),
    );
    await expect(file).resolves.toMatchObject({ attached: true });

    const image = transport.call("attachImage", {
      sessionId: "session-1",
      name: "screen.png",
      mimeType: "image/png",
      contentBase64: "iVBORw0KGgo=",
    });
    const imageRequest = request(socket);
    expect(imageRequest).toMatchObject({
      method: "image.attach_bytes",
      params: {
        session_id: "session-1",
        filename: "screen.png",
        content_base64: "iVBORw0KGgo=",
      },
    });
    socket.receive(
      JSON.stringify({ jsonrpc: "2.0", id: imageRequest.id, result: { attached: true } }),
    );
    await expect(image).resolves.toMatchObject({ attached: true });
  });

  it("rejects malformed and oversized frames with safe typed errors", async () => {
    FakeSocket.instances.length = 0;
    const transport = new WebSocketHermesTransport({
      endpoint: "ws://test",
      origin: "http://localhost:5173",
      maxFrameBytes: 100,
      socketFactory: factory,
    });
    const connected = transport.connect();
    const socket = FakeSocket.instances[0];
    openReady(socket!);
    await connected;
    const call = transport.call("ping", undefined);
    socket?.receive("not-json");
    await expect(call).rejects.toMatchObject({ code: "TRANSPORT_PARSE_FAILED" });

    const next = transport.call("ping", undefined);
    socket?.receive("x".repeat(101));
    await expect(next).rejects.toMatchObject({ code: "TRANSPORT_FRAME_TOO_LARGE" });
  });

  it("times out requests and rejects pending calls on disconnect", async () => {
    FakeSocket.instances.length = 0;
    vi.useFakeTimers();
    const transport = new WebSocketHermesTransport({
      endpoint: "ws://test",
      origin: "http://localhost:5173",
      requestTimeoutMs: 20,
      socketFactory: factory,
    });
    const connected = transport.connect();
    const socket = FakeSocket.instances[0];
    openReady(socket!);
    await connected;
    const timedOut = transport.call("slow", undefined);
    const timedOutExpectation = expect(timedOut).rejects.toMatchObject({
      code: "TRANSPORT_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(21);
    await timedOutExpectation;

    const disconnected = transport.call("disconnecting", undefined);
    socket?.closeFromPeer();
    await expect(disconnected).rejects.toMatchObject({ code: "TRANSPORT_CLOSED" });
    vi.useRealTimers();
  });

  it("waits for gateway.ready, emits reconnect gaps, and sends no replay RPC", async () => {
    FakeSocket.instances.length = 0;
    const transport = new WebSocketHermesTransport({
      endpoint: "ws://test",
      origin: "http://localhost:5173",
      socketFactory: factory,
    });
    let connecting = transport.connect();
    let socket = FakeSocket.instances[0]!;
    openReady(socket);
    await connecting;
    const stream = transport.stream("sendMessage", { sessionId: "s-1" })[Symbol.asyncIterator]();
    socket.receive(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "event",
        params: {
          type: "message.delta",
          sessionId: "s-1",
          cursor: "c-1",
          payload: { runId: "r", text: "x" },
        },
      }),
    );
    await stream.next();
    socket.closeFromPeer();

    connecting = transport.connect();
    socket = FakeSocket.instances[1]!;
    openReady(socket);
    await connecting;
    expect(socket.sent.map((value) => JSON.parse(value))).not.toContainEqual(
      expect.objectContaining({ method: "reconnect" }),
    );

    const gapTransport = new WebSocketHermesTransport({
      endpoint: "ws://test",
      origin: "http://localhost:5173",
      socketFactory: factory,
    });
    const gapConnecting = gapTransport.connect();
    const gapSocket = FakeSocket.instances[2]!;
    openReady(gapSocket);
    await gapConnecting;
    const gapStream = gapTransport
      .stream("sendMessage", { sessionId: "s-2" })
      [Symbol.asyncIterator]();
    gapSocket.closeFromPeer();
    const gapReconnect = gapTransport.connect();
    const gapReconnectSocket = FakeSocket.instances[3]!;
    openReady(gapReconnectSocket);
    await gapReconnect;
    await expect(gapStream.next()).resolves.toMatchObject({
      value: { type: "reconnect.gap", sessionId: "s-2" },
    });
  });

  it("rejects a failed stream without creating an unhandled rejection", async () => {
    FakeSocket.instances.length = 0;
    const transport = new WebSocketHermesTransport({
      endpoint: "ws://test",
      origin: "http://localhost:5173",
      socketFactory: factory,
    });
    const connecting = transport.connect();
    const socket = FakeSocket.instances[0]!;
    openReady(socket);
    await connecting;

    const iterator = transport.stream("sendMessage", { sessionId: "s-1" })[Symbol.asyncIterator]();
    const waiting = iterator.next();
    socket.receive(
      JSON.stringify({
        jsonrpc: "2.0",
        id: request(socket).id,
        error: { code: "PROMPT_FAILED", message: "The gateway rejected the prompt." },
      }),
    );

    await expect(waiting).rejects.toMatchObject({
      code: "TRANSPORT_REQUEST_FAILED",
      operation: "sendMessage",
    });
  });

  it("ignores duplicate responses after the first response", async () => {
    FakeSocket.instances.length = 0;
    const transport = new WebSocketHermesTransport({
      endpoint: "ws://test",
      origin: "http://localhost:5173",
      socketFactory: factory,
    });
    const connected = transport.connect();
    const socket = FakeSocket.instances[0];
    openReady(socket!);
    await connected;
    const call = transport.call("once", undefined);
    const callRequest = request(socket!);
    socket?.receive(JSON.stringify({ jsonrpc: "2.0", id: callRequest.id, result: "first" }));
    socket?.receive(JSON.stringify({ jsonrpc: "2.0", id: callRequest.id, result: "second" }));
    await expect(call).resolves.toBe("first");
  });

  it("requires a validated origin and validates query auth", () => {
    expect(
      () => new WebSocketHermesTransport({ endpoint: "ws://test", socketFactory: factory }),
    ).toThrowError(expect.objectContaining({ code: "TRANSPORT_CONFIG_INVALID" }));
    expect(
      () =>
        new WebSocketHermesTransport({
          endpoint: "ws://test",
          origin: "not-an-origin",
          socketFactory: factory,
        }),
    ).toThrowError(expect.objectContaining({ code: "TRANSPORT_CONFIG_INVALID" }));
    expect(
      () =>
        new WebSocketHermesTransport({
          endpoint: "ws://test",
          origin: "http://localhost:5173",
          auth: { token: 42 as unknown as string },
          socketFactory: factory,
        }),
    ).toThrowError(expect.objectContaining({ code: "TRANSPORT_CONFIG_INVALID" }));
    expect(
      () =>
        new WebSocketHermesTransport({
          endpoint: "ws://test",
          origin: "http://localhost:5173",
          auth: { token: "one", ticket: "two" },
          socketFactory: factory,
        }),
    ).toThrowError(expect.objectContaining({ code: "TRANSPORT_CONFIG_INVALID" }));
    expect(
      () =>
        new WebSocketHermesTransport({
          endpoint: "ws://test",
          origin: "http://localhost:5173",
          auth: { token: "" },
          socketFactory: factory,
        }),
    ).toThrowError(expect.objectContaining({ code: "TRANSPORT_CONFIG_INVALID" }));
  });

  it.each([1008, 4401])(
    "distinguishes authentication rejection from handshake failure during the initial handshake (%s)",
    async (code) => {
      FakeSocket.instances.length = 0;
      const authTransport = new WebSocketHermesTransport({
        endpoint: "ws://test",
        origin: "http://localhost:5173",
        auth: { token: "initial-secret" },
        socketFactory: factory,
      });
      const authConnect = authTransport.connect();
      const authSocket = FakeSocket.instances[0]!;
      await Promise.resolve();
      authSocket.readyState = 3;
      authSocket.onclose?.({ code });
      await expect(authConnect).rejects.toMatchObject({
        code: "TRANSPORT_AUTH_FAILED",
        message: "Hermes WebSocket transport failed.",
      });
      await expect(authConnect).rejects.not.toThrow("initial-secret");

      const handshakeTransport = new WebSocketHermesTransport({
        endpoint: "ws://test",
        origin: "http://localhost:5173",
        socketFactory: factory,
      });
      const handshakeConnect = handshakeTransport.connect();
      const handshakeSocket = FakeSocket.instances[1]!;
      await Promise.resolve();
      handshakeSocket.onerror?.();
      await expect(handshakeConnect).rejects.toMatchObject({ code: "TRANSPORT_HANDSHAKE_FAILED" });
      expect(handshakeSocket.readyState).toBe(3);
      expect(handshakeSocket.onopen).toBeNull();
      expect(handshakeSocket.onmessage).toBeNull();
      expect(handshakeSocket.onerror).toBeNull();
      expect(handshakeSocket.onclose).toBeNull();
    },
  );

  it("reports 4401 as an auth failure when reconnecting", async () => {
    FakeSocket.instances.length = 0;
    const transport = new WebSocketHermesTransport({
      endpoint: "ws://test",
      origin: "http://localhost:5173",
      auth: { token: "reconnect-secret" },
      socketFactory: factory,
    });
    const initialConnect = transport.connect();
    const initialSocket = FakeSocket.instances[0]!;
    openReady(initialSocket);
    await initialConnect;

    initialSocket.closeFromPeer({ code: 4401 });
    const reconnect = transport.connect();
    const reconnectSocket = FakeSocket.instances[1]!;
    await Promise.resolve();
    reconnectSocket.readyState = 3;
    reconnectSocket.onclose?.({ code: 4401 });

    await expect(reconnect).rejects.toMatchObject({
      code: "TRANSPORT_AUTH_FAILED",
      message: "Hermes WebSocket transport failed.",
    });
    await expect(reconnect).rejects.not.toThrow("reconnect-secret");
  });

  it("rejects response envelopes containing neither or both result and error", async () => {
    FakeSocket.instances.length = 0;
    const transport = new WebSocketHermesTransport({
      endpoint: "ws://test",
      origin: "http://localhost:5173",
      socketFactory: factory,
    });
    const connected = transport.connect();
    const socket = FakeSocket.instances[0]!;
    openReady(socket);
    await connected;
    const missing = transport.call("missing", undefined);
    const missingRequest = request(socket);
    socket.receive(JSON.stringify({ jsonrpc: "2.0", id: missingRequest.id }));
    await expect(missing).rejects.toMatchObject({ code: "TRANSPORT_MALFORMED_RESPONSE" });
    const both = transport.call("both", undefined);
    const bothRequest = request(socket);
    socket.receive(
      JSON.stringify({ jsonrpc: "2.0", id: bothRequest.id, result: true, error: { code: -1 } }),
    );
    await expect(both).rejects.toMatchObject({ code: "TRANSPORT_MALFORMED_RESPONSE" });
  });

  it("enforces the frame limit on outbound JSON", async () => {
    FakeSocket.instances.length = 0;
    const transport = new WebSocketHermesTransport({
      endpoint: "ws://test",
      origin: "http://localhost:5173",
      maxFrameBytes: 200,
      socketFactory: factory,
    });
    const connected = transport.connect();
    const socket = FakeSocket.instances[0]!;
    openReady(socket);
    await connected;
    await expect(transport.call("large", { text: "x".repeat(300) })).rejects.toMatchObject({
      code: "TRANSPORT_FRAME_TOO_LARGE",
    });
    expect(socket.sent).toHaveLength(0);
  });

  it("routes events only to their request or session and keeps uncorrelated events out", async () => {
    FakeSocket.instances.length = 0;
    const transport = new WebSocketHermesTransport({
      endpoint: "ws://test",
      origin: "http://localhost:5173",
      socketFactory: factory,
    });
    const connected = transport.connect();
    const socket = FakeSocket.instances[0]!;
    openReady(socket);
    await connected;
    const first = transport
      .stream("first", { sessionId: "s-1", runId: "r-1" })
      [Symbol.asyncIterator]();
    const firstRequest = request(socket);
    const second = transport
      .stream("second", { sessionId: "s-2", runId: "r-2" })
      [Symbol.asyncIterator]();
    const secondRequest = request(socket);
    socket.receive(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "event",
        params: {
          type: "x",
          sessionId: "s-1",
          runId: "r-1",
          requestId: firstRequest.id,
          payload: {},
        },
      }),
    );
    await expect(first.next()).resolves.toMatchObject({
      value: expect.objectContaining({ method: "event" }),
    });
    const secondResult = second.next();
    await Promise.resolve();
    expect(secondResult).toBeInstanceOf(Promise);
    socket.receive(
      JSON.stringify({ jsonrpc: "2.0", method: "event", params: { type: "x", payload: {} } }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(socket.sent).toContain(
      JSON.stringify({
        jsonrpc: "2.0",
        id: secondRequest.id,
        method: "second",
        params: { sessionId: "s-2", runId: "r-2" },
      }),
    );
  });

  it("emits a per-stream gap after reconnect because Hermes has no supported replay method", async () => {
    FakeSocket.instances.length = 0;
    const transport = new WebSocketHermesTransport({
      endpoint: "ws://test",
      origin: "http://localhost:5173",
      socketFactory: factory,
    });
    let connected = transport.connect();
    const firstSocket = FakeSocket.instances[0]!;
    openReady(firstSocket);
    await connected;
    const stream = transport
      .stream("sendMessage", { sessionId: "s-1", runId: "r-1" })
      [Symbol.asyncIterator]();
    const streamRequest = request(firstSocket);
    firstSocket.receive(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "event",
        params: {
          type: "x",
          requestId: streamRequest.id,
          sessionId: "s-1",
          runId: "r-1",
          cursor: "c-1",
          payload: {},
        },
      }),
    );
    await stream.next();
    firstSocket.closeFromPeer();
    connected = transport.connect();
    const secondSocket = FakeSocket.instances[1]!;
    openReady(secondSocket);
    await connected;
    expect(secondSocket.sent.map((value) => JSON.parse(value))).not.toContainEqual(
      expect.objectContaining({ method: "reconnect" }),
    );
    await expect(stream.next()).resolves.toMatchObject({
      value: {
        type: "reconnect.gap",
        sessionId: "s-1",
        runId: "r-1",
        reason: "Hermes v0.19 has no supported stream replay method; call session.resume.",
      },
    });

    const gapTransport = new WebSocketHermesTransport({
      endpoint: "ws://test",
      origin: "http://localhost:5173",
      socketFactory: factory,
    });
    connected = gapTransport.connect();
    const gapSocket = FakeSocket.instances[2]!;
    openReady(gapSocket);
    await connected;
    const gapStream = gapTransport
      .stream("sendMessage", { sessionId: "s-2" })
      [Symbol.asyncIterator]();
    gapSocket.closeFromPeer();
    connected = gapTransport.connect();
    const gapReconnectSocket = FakeSocket.instances[3]!;
    openReady(gapReconnectSocket);
    await connected;
    await expect(gapStream.next()).resolves.toMatchObject({
      value: { type: "reconnect.gap", sessionId: "s-2" },
    });
  });

  it("ignores messages from a stale socket generation", async () => {
    FakeSocket.instances.length = 0;
    const transport = new WebSocketHermesTransport({
      endpoint: "ws://test",
      origin: "http://localhost:5173",
      socketFactory: factory,
    });
    let connected = transport.connect();
    const oldSocket = FakeSocket.instances[0]!;
    openReady(oldSocket);
    await connected;
    oldSocket.closeFromPeer();
    expect(oldSocket.onmessage).toBeNull();
    connected = transport.connect();
    const newSocket = FakeSocket.instances[1]!;
    openReady(newSocket);
    await connected;
    const call = transport.call("current", undefined);
    const currentRequest = request(newSocket);
    oldSocket.receive(JSON.stringify({ jsonrpc: "2.0", id: currentRequest.id, result: "stale" }));
    newSocket.receive(JSON.stringify({ jsonrpc: "2.0", id: currentRequest.id, result: "current" }));
    await expect(call).resolves.toBe("current");
  });
});
