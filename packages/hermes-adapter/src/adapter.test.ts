import { describe, expect, it } from "vitest";
import type { AgentEvent } from "@flancommand/event-schema";

import {
  HermesAdapterError,
  HermesAdapterImplementation,
  UnsupportedOperationError,
  createDefaultCapabilities,
  createHermesAdapter,
  type HermesAdapter,
} from "./index.js";
import { StreamRedactor } from "./normalize.js";
import type { SocketLike } from "./ws-transport.js";

describe("HermesAdapter", () => {
  it("normalizes the live gateway session.list response", async () => {
    const adapter = new HermesAdapterImplementation(
      {
        connect: async () => undefined,
        disconnect: async () => undefined,
        call: async (operation) =>
          operation === "listSessions"
            ? {
                sessions: [
                  {
                    id: "20260722_151628_54fe5eaf",
                    title: "Recent work",
                    source: "telegram",
                    started_at: 1_784_754_988.08,
                  },
                ],
              }
            : undefined,
        stream: () => ({
          async *[Symbol.asyncIterator]() {
            yield { type: "run.completed", runId: "run-1" };
          },
        }),
      },
      { ...createDefaultCapabilities(), sessions: { status: "observed" } },
    );
    await adapter.connect();
    await expect(adapter.listSessions()).resolves.toMatchObject([
      {
        id: "20260722_151628_54fe5eaf",
        title: "Recent work",
        source: "telegram",
        status: "idle",
      },
    ]);
  });

  it("keeps resumable Hermes history for the web conversation view", async () => {
    const adapter = new HermesAdapterImplementation(
      {
        connect: async () => undefined,
        disconnect: async () => undefined,
        call: async (operation) =>
          operation === "resumeSession"
            ? {
                session_id: "live-session",
                started_at: 1_784_754_988.08,
                messages: [
                  { role: "user", text: "Hello" },
                  { role: "assistant", text: "Hi there" },
                ],
              }
            : undefined,
        stream: () => ({
          async *[Symbol.asyncIterator]() {
            yield { type: "run.completed", runId: "run-1" };
          },
        }),
      },
      { ...createDefaultCapabilities(), sessions: { status: "observed" } },
    );
    await adapter.connect();
    await expect(adapter.resumeSession("stored-session")).resolves.toMatchObject({
      id: "live-session",
      history: [
        { role: "user", text: "Hello" },
        { role: "assistant", text: "Hi there" },
      ],
    });
  });

  it("normalizes Hermes model.options providers into selectable models", async () => {
    const adapter = new HermesAdapterImplementation(
      {
        connect: async () => undefined,
        disconnect: async () => undefined,
        call: async () => ({
          providers: [
            {
              slug: "openai",
              name: "OpenAI",
              models: ["gpt-5"],
              capabilities: { "gpt-5": { reasoning: true } },
            },
          ],
        }),
        stream: () => ({
          async *[Symbol.asyncIterator]() {
            yield { type: "run.completed", runId: "run-1" };
          },
        }),
      },
      { ...createDefaultCapabilities(), models: { status: "observed" } },
    );
    await adapter.connect();
    await expect(adapter.listModels()).resolves.toEqual([
      { id: "gpt-5", name: "gpt-5", provider: "openai", reasoning: true },
    ]);
  });

  it("turns a live slash command response into a completed agent event sequence", async () => {
    const adapter = new HermesAdapterImplementation(
      {
        connect: async () => undefined,
        disconnect: async () => undefined,
        call: async () => ({ output: "Command finished." }),
        stream: () => ({
          async *[Symbol.asyncIterator]() {
            yield { type: "run.completed", runId: "run-1" };
          },
        }),
      },
      { ...createDefaultCapabilities(), commands: { status: "observed" } },
    );
    await adapter.connect();
    const events: AgentEvent[] = [];
    for await (const event of adapter.dispatchCommand("session-1", "/status")) events.push(event);
    expect(events).toMatchObject([
      { type: "run.started", sessionId: "session-1" },
      { type: "message.delta", sessionId: "session-1", text: "Command finished." },
      { type: "message.completed", sessionId: "session-1" },
      { type: "run.completed", sessionId: "session-1" },
    ]);
  });

  it("interrupts the Hermes session that owns a run", async () => {
    const calls: Array<{ operation: string; input: unknown }> = [];
    const adapter = new HermesAdapterImplementation(
      {
        connect: async () => undefined,
        disconnect: async () => undefined,
        call: async (operation, input) => {
          calls.push({ operation, input });
          return undefined;
        },
        stream: () => ({
          async *[Symbol.asyncIterator]() {},
        }),
      },
      { ...createDefaultCapabilities(), stop: { status: "observed" } },
    );
    await adapter.connect();
    await adapter.stopRun("run-1", "session-1");
    expect(calls).toEqual([
      { operation: "stopRun", input: { runId: "run-1", sessionId: "session-1" } },
    ]);
  });

  it("uses Hermes session.undo for retry requests", async () => {
    const calls: Array<{ operation: string; input: unknown }> = [];
    const adapter = new HermesAdapterImplementation(
      {
        connect: async () => undefined,
        disconnect: async () => undefined,
        call: async (operation, input) => {
          calls.push({ operation, input });
          return { removed: 2 };
        },
        stream: () => ({
          async *[Symbol.asyncIterator]() {},
        }),
      },
      { ...createDefaultCapabilities(), retry: { status: "observed" } },
    );
    await adapter.connect();
    await adapter.retryTurn("session-1", "turn-1");
    expect(calls).toEqual([
      { operation: "retryTurn", input: { sessionId: "session-1", turnId: "turn-1" } },
    ]);
  });

  it("exposes the approved adapter contract", () => {
    const adapter: HermesAdapter = createHermesAdapter({ transport: "mock" });
    for (const method of [
      "approveAction",
      "connect",
      "createSession",
      "denyAction",
      "disconnect",
      "dispatchCommand",
      "getCapabilities",
      "getSession",
      "listCommands",
      "listModels",
      "listSessions",
      "renameSession",
      "resumeSession",
      "retryTurn",
      "sendMessage",
      "setSessionModel",
      "stopRun",
      "provideCredential",
      "attachFile",
      "attachImage",
    ] as const) {
      expect(typeof adapter[method]).toBe("function");
    }
  });

  it("sends a credential value only through the server-side adapter contract", async () => {
    const calls: Array<{ operation: string; input: unknown }> = [];
    const adapter = new HermesAdapterImplementation(
      {
        connect: async () => undefined,
        disconnect: async () => undefined,
        call: async (operation, input) => {
          calls.push({ operation, input });
          return { ok: true };
        },
        stream: () => ({
          async *[Symbol.asyncIterator]() {},
        }),
      },
      createDefaultCapabilities(),
    );
    await adapter.connect();
    await adapter.provideCredential("session-1", "request-1", "server-only-secret");
    expect(calls).toEqual([
      {
        operation: "provideCredential",
        input: { sessionId: "session-1", requestId: "request-1", value: "server-only-secret" },
      },
    ]);
  });

  it("passes file attachments through the adapter contract", async () => {
    const calls: Array<{ operation: string; input: unknown }> = [];
    const adapter = new HermesAdapterImplementation(
      {
        connect: async () => undefined,
        disconnect: async () => undefined,
        call: async (operation, input) => {
          calls.push({ operation, input });
          return { attached: true, ref_text: "@file:.hermes/desktop-attachments/notes.txt" };
        },
        stream: () => ({
          async *[Symbol.asyncIterator]() {},
        }),
      },
      createDefaultCapabilities(),
    );
    await adapter.connect();
    await expect(
      adapter.attachFile("session-1", {
        name: "notes.txt",
        mimeType: "text/plain",
        contentBase64: "aGVsbG8=",
      }),
    ).resolves.toMatchObject({ refText: "@file:.hermes/desktop-attachments/notes.txt" });
    await expect(
      adapter.attachImage("session-1", {
        name: "screen.png",
        mimeType: "image/png",
        contentBase64: "iVBORw0KGgo=",
      }),
    ).resolves.toMatchObject({ refText: "@file:.hermes/desktop-attachments/notes.txt" });
    expect(calls).toEqual([
      {
        operation: "attachFile",
        input: {
          sessionId: "session-1",
          name: "notes.txt",
          mimeType: "text/plain",
          contentBase64: "aGVsbG8=",
        },
      },
      {
        operation: "attachImage",
        input: {
          sessionId: "session-1",
          name: "screen.png",
          mimeType: "image/png",
          contentBase64: "iVBORw0KGgo=",
        },
      },
    ]);
  });

  it("returns capability evidence and actionable typed errors", async () => {
    const socket = {
      readyState: 0,
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      send: (value) => {
        const request = JSON.parse(value) as { id: string };
        queueMicrotask(() => {
          socket.onmessage?.({
            data: JSON.stringify({
              jsonrpc: "2.0",
              id: request.id,
              error: { code: -32000, message: "model probe failed" },
            }),
          });
        });
      },
      close: () => undefined,
    } as SocketLike;
    const adapter = createHermesAdapter({
      transport: "websocket",
      socketFactory: () => {
        queueMicrotask(() => {
          socket.readyState = 1;
          socket.onopen?.();
          socket.onmessage?.({
            data: JSON.stringify({
              jsonrpc: "2.0",
              method: "event",
              params: { type: "gateway.ready", payload: {} },
            }),
          });
        });
        return socket;
      },
    });
    const capabilities = await adapter.getCapabilities();
    expect(capabilities.sessions.status).toBe("source-inferred");
    await adapter.connect();
    await expect(adapter.listModels()).rejects.toBeInstanceOf(HermesAdapterError);
    try {
      await adapter.listModels();
    } catch (error) {
      expect(error).toBeInstanceOf(HermesAdapterError);
      expect((error as HermesAdapterError).nextAction).toMatch(
        /capability|transport|probe|connection/i,
      );
    }
  });

  it("rejects invalid capabilities while constructing the adapter", () => {
    expect(
      () =>
        new HermesAdapterImplementation(
          {
            connect: async () => undefined,
            disconnect: async () => undefined,
            call: async () => undefined,
            stream: async function* () {},
          },
          { sessions: { status: "maybe" } } as never,
        ),
    ).toThrow();
  });

  it("returns safe capability snapshots", async () => {
    const adapter = new HermesAdapterImplementation(
      {
        connect: async () => undefined,
        disconnect: async () => undefined,
        call: async () => undefined,
        stream: async function* () {},
      },
      createDefaultCapabilities(),
    );

    const first = await adapter.getCapabilities();
    first.sessions.status = "observed";
    first.sessions.reason = "caller mutation";

    await expect(adapter.getCapabilities()).resolves.toMatchObject({
      sessions: { status: "not tested" },
    });
  });

  it("does not export raw transport names", async () => {
    const module = await import("./index.js");
    expect(Object.keys(module)).not.toEqual(
      expect.arrayContaining(["Transport", "HermesTransport"]),
    );
  });

  it("delegates calls and streams through an injected transport", async () => {
    const calls: Array<{ operation: string; input: unknown }> = [];
    const transport = {
      connect: async () => undefined,
      disconnect: async () => undefined,
      call: async (operation: string, input: unknown) => {
        calls.push({ operation, input });
        if (operation === "listModels") return [{ id: "model-1" }];
        return undefined;
      },
      stream: () => ({
        async *[Symbol.asyncIterator]() {
          yield { type: "message.delta", runId: "run-1", sessionId: "session-1", text: "hi" };
        },
      }),
    };
    const adapter = new HermesAdapterImplementation(transport, {
      ...createDefaultCapabilities(),
      models: { status: "observed" },
      streaming: { status: "observed" },
    });
    await adapter.connect();

    await expect(adapter.listModels()).resolves.toEqual([{ id: "model-1" }]);
    const events: unknown[] = [];
    for await (const event of adapter.sendMessage("session-1", { text: "hello" }))
      events.push(event);

    expect(calls).toEqual([{ operation: "listModels", input: undefined }]);
    expect(events).toEqual([
      { type: "message.delta", runId: "run-1", sessionId: "session-1", text: "hi" },
    ]);
  });

  it.each(["unsupported", "blocked", "not tested", "not observed"] as const)(
    "rejects %s capability status before transport call",
    async (status) => {
      const calls: string[] = [];
      const adapter = new HermesAdapterImplementation(
        {
          connect: async () => undefined,
          disconnect: async () => undefined,
          call: async (operation) => {
            calls.push(operation);
            return [];
          },
          stream: () => {
            calls.push("stream");
            return { async *[Symbol.asyncIterator]() {} };
          },
        },
        {
          ...createDefaultCapabilities(),
          models: { status },
        },
      );
      await adapter.connect();

      await expect(adapter.listModels()).rejects.toBeInstanceOf(UnsupportedOperationError);
      expect(calls).toEqual([]);
    },
  );

  it("normalizes already-normalized frames and unknown native frames at the stream boundary", async () => {
    const adapter = new HermesAdapterImplementation(
      {
        connect: async () => undefined,
        disconnect: async () => undefined,
        call: async () => undefined,
        stream: () => ({
          async *[Symbol.asyncIterator]() {
            yield { type: "message.delta", runId: "run-1", text: "hello" };
            yield { event: "hermes.native.delta", payload: { text: "raw" } };
          },
        }),
      },
      { ...createDefaultCapabilities(), streaming: { status: "observed" } },
    );
    await adapter.connect();

    const events = [];
    for await (const event of adapter.sendMessage("session-1", { text: "hello" }))
      events.push(event);

    expect(events).toEqual([
      {
        type: "diagnostic.unknown",
        raw: { event: "hermes.native.delta", payload: { text: "raw" } },
      },
      { type: "message.delta", runId: "run-1", text: "hello" },
    ]);
  });

  it("redacts secrets from unknown stream diagnostics", async () => {
    const adapter = new HermesAdapterImplementation(
      {
        connect: async () => undefined,
        disconnect: async () => undefined,
        call: async () => undefined,
        stream: () => ({
          async *[Symbol.asyncIterator]() {
            yield { event: "native.failure", payload: { password: "stream-secret" } };
          },
        }),
      },
      { ...createDefaultCapabilities(), streaming: { status: "observed" } },
    );
    await adapter.connect();

    const events = [];
    for await (const event of adapter.sendMessage("session-1", { text: "hello" }))
      events.push(event);

    expect(JSON.stringify(events)).not.toContain("stream-secret");
  });

  it("redacts a Bearer secret split across message chunks", async () => {
    const adapter = new HermesAdapterImplementation(
      {
        connect: async () => undefined,
        disconnect: async () => undefined,
        call: async () => undefined,
        stream: () => ({
          async *[Symbol.asyncIterator]() {
            yield { type: "message.delta", runId: "run-1", text: "Authorization: Bearer " };
            yield { type: "message.delta", runId: "run-1", text: "split-secret" };
            yield { type: "run.completed", runId: "run-1" };
          },
        }),
      },
      { ...createDefaultCapabilities(), streaming: { status: "observed" } },
    );
    await adapter.connect();

    const events = [];
    for await (const event of adapter.sendMessage("session-1", { text: "hello" }))
      events.push(event);

    expect(JSON.stringify(events)).not.toContain("split-secret");
    expect(events).toContainEqual({
      type: "message.delta",
      runId: "run-1",
      text: "Authorization=[REDACTED]",
    });
    expect(events.at(-1)).toEqual({ type: "run.completed", runId: "run-1" });
  });

  it("redacts an assignment secret split across tool chunks", async () => {
    const adapter = new HermesAdapterImplementation(
      {
        connect: async () => undefined,
        disconnect: async () => undefined,
        call: async () => undefined,
        stream: () => ({
          async *[Symbol.asyncIterator]() {
            yield { type: "tool.output", runId: "run-1", toolCallId: "tool-1", chunk: "api_key=" };
            yield {
              type: "tool.output",
              runId: "run-1",
              toolCallId: "tool-1",
              chunk: "split-api-secret\n",
            };
            yield { type: "run.stopped", runId: "run-1" };
          },
        }),
      },
      { ...createDefaultCapabilities(), streaming: { status: "observed" } },
    );
    await adapter.connect();

    const events = [];
    for await (const event of adapter.sendMessage("session-1", { text: "hello" }))
      events.push(event);

    expect(JSON.stringify(events)).not.toContain("split-api-secret");
    expect(events).toContainEqual({
      type: "tool.output",
      runId: "run-1",
      toolCallId: "tool-1",
      chunk: "api_key=[REDACTED]\n",
    });
  });

  it.each([
    ["token", "=split-token\n"],
    ["password", "=split-password\n"],
    ['token = "', 'split-quoted-token"\n'],
    ["password: ", "'split-quoted-password'\n"],
    ['{"client_secret"', ': "split-json-secret"}\n'],
    ['{"authToken"', ': "split-auth-token"}\n'],
    ['{"api-key"', ': "split-hyphen-api-key"}\n'],
    ["privateKey = ", "split-private-key\n"],
  ])(
    "redacts a sensitive value when its %s prefix is split across chunks",
    async (first, second) => {
      const adapter = new HermesAdapterImplementation(
        {
          connect: async () => undefined,
          disconnect: async () => undefined,
          call: async () => undefined,
          stream: () => ({
            async *[Symbol.asyncIterator]() {
              yield { type: "message.delta", runId: "run-1", text: first };
              yield { type: "message.delta", runId: "run-1", text: second };
              yield { type: "run.completed", runId: "run-1" };
            },
          }),
        },
        { ...createDefaultCapabilities(), streaming: { status: "observed" } },
      );
      await adapter.connect();

      const events = [];
      for await (const event of adapter.sendMessage("session-1", { text: "hello" }))
        events.push(event);

      expect(JSON.stringify(events)).not.toMatch(
        /split-token|split-password|split-quoted-token|split-quoted-password|split-json-secret|split-auth-token|split-hyphen-api-key|split-private-key/,
      );
    },
  );

  it("bounds held stream prefixes to 128 characters and keeps ordinary text", async () => {
    const ordinary = "ordinary ".repeat(30);
    const adapter = new HermesAdapterImplementation(
      {
        connect: async () => undefined,
        disconnect: async () => undefined,
        call: async () => undefined,
        stream: () => ({
          async *[Symbol.asyncIterator]() {
            yield { type: "message.delta", runId: "run-1", text: `${ordinary}authToken=` };
            yield { type: "message.delta", runId: "run-1", text: "bounded-secret\n" };
            yield { type: "run.completed", runId: "run-1" };
          },
        }),
      },
      { ...createDefaultCapabilities(), streaming: { status: "observed" } },
    );
    await adapter.connect();

    const events = [];
    for await (const event of adapter.sendMessage("session-1", { text: "hello" }))
      events.push(event);

    expect(JSON.stringify(events)).not.toContain("bounded-secret");
    expect(
      events
        .filter((event) => event.type === "message.delta")
        .map((event) => (event.type === "message.delta" ? event.text : ""))
        .join("").length,
    ).toBeGreaterThan(128);
  });

  it("keeps sensitive context across a long split Bearer value", async () => {
    const adapter = new HermesAdapterImplementation(
      {
        connect: async () => undefined,
        disconnect: async () => undefined,
        call: async () => undefined,
        stream: () => ({
          async *[Symbol.asyncIterator]() {
            yield {
              type: "message.delta",
              runId: "run-1",
              text: `Authorization: Bearer ${"long-secret-part-".repeat(10)}`,
            };
            yield {
              type: "message.delta",
              runId: "run-1",
              text: "secret-completes-here\nordinary text survives",
            };
            yield { type: "run.completed", runId: "run-1" };
          },
        }),
      },
      { ...createDefaultCapabilities(), streaming: { status: "observed" } },
    );
    await adapter.connect();

    const events = [];
    for await (const event of adapter.sendMessage("session-1", { text: "hello" }))
      events.push(event);

    expect(JSON.stringify(events)).not.toContain("long-secret-part");
    expect(JSON.stringify(events)).not.toContain("secret-completes-here");
    expect(JSON.stringify(events)).toContain("ordinary text survives");
  });

  it("keeps ordinary text when a long Authorization Bearer value is split after its marker", async () => {
    const ordinaryPrefix = "ordinary prefix ".repeat(20);
    const ordinarySuffix = " ordinary suffix";
    const adapter = new HermesAdapterImplementation(
      {
        connect: async () => undefined,
        disconnect: async () => undefined,
        call: async () => undefined,
        stream: () => ({
          async *[Symbol.asyncIterator]() {
            yield {
              type: "message.delta",
              runId: "run-1",
              text: `${ordinaryPrefix}Authorization Bearer ${"split-secret-part-".repeat(10)}`,
            };
            yield {
              type: "message.delta",
              runId: "run-1",
              text: ordinarySuffix,
            };
            yield { type: "run.completed", runId: "run-1" };
          },
        }),
      },
      { ...createDefaultCapabilities(), streaming: { status: "observed" } },
    );
    await adapter.connect();

    const events = [];
    for await (const event of adapter.sendMessage("session-1", { text: "hello" }))
      events.push(event);

    const messageText = events
      .filter((event) => event.type === "message.delta")
      .map((event) => (event.type === "message.delta" ? event.text : ""))
      .join("");
    expect(messageText).toContain(ordinaryPrefix);
    expect(messageText).toContain(ordinarySuffix);
    expect(messageText).not.toContain("split-secret-part");
  });

  it.each([
    [
      "URL",
      `${"ordinary ".repeat(40)}https://user:url-secret@example.com/path`,
      `${"ordinary ".repeat(40)}https://[REDACTED]@example.com/path`,
    ],
    [
      "PEM",
      `${"ordinary ".repeat(40)}-----BEGIN PRIVATE KEY-----\nprivate-key-secret\n-----END PRIVATE KEY-----`,
      `${"ordinary ".repeat(40)}[REDACTED PRIVATE KEY]`,
    ],
  ])(
    "keeps all ordinary text when a long frame contains a redacted %s",
    async (_kind, text, expected) => {
      const adapter = new HermesAdapterImplementation(
        {
          connect: async () => undefined,
          disconnect: async () => undefined,
          call: async () => undefined,
          stream: () => ({
            async *[Symbol.asyncIterator]() {
              yield { type: "message.delta", runId: "run-1", text };
              yield { type: "run.completed", runId: "run-1" };
            },
          }),
        },
        { ...createDefaultCapabilities(), streaming: { status: "observed" } },
      );
      await adapter.connect();

      const events = [];
      for await (const event of adapter.sendMessage("session-1", { text: "hello" }))
        events.push(event);

      expect(
        events
          .filter((event) => event.type === "message.delta")
          .map((event) => (event.type === "message.delta" ? event.text : ""))
          .join(""),
      ).toBe(expected);
    },
  );

  it("evicts the oldest stream state when the global state limit is reached", () => {
    const redactor = new StreamRedactor();
    for (let index = 0; index < 1025; index += 1) {
      redactor.processMessage({
        type: "message.delta",
        runId: `run-${index}`,
        text: `tail-${index}`,
      });
    }

    const flushed = redactor.flushAll();
    expect(flushed).toHaveLength(1024);
    expect(flushed).not.toContainEqual(expect.objectContaining({ runId: "run-0" }));
    expect(flushed).toContainEqual(expect.objectContaining({ runId: "run-1", text: "tail-1" }));
    expect(flushed).toContainEqual(
      expect.objectContaining({ runId: "run-1024", text: "tail-1024" }),
    );
  });

  it("does not evict a sensitive state and drops later chunks if the cap leaves no safe slot", () => {
    const redactor = new StreamRedactor();
    redactor.processMessage({
      type: "message.delta",
      runId: "sensitive-run",
      text: "token=",
    });
    for (let index = 0; index < 1024; index += 1) {
      redactor.processMessage({
        type: "message.delta",
        runId: `run-${index}`,
        text: `ordinary-${index}`,
      });
    }

    expect(
      redactor.processMessage({
        type: "message.delta",
        runId: "sensitive-run",
        text: "must-not-leak",
      }),
    ).toEqual([]);
    expect(redactor.flushRun("sensitive-run")).toEqual([
      expect.objectContaining({ text: "token=[REDACTED]" }),
    ]);
    expect(
      redactor.flushAll().some((frame) => JSON.stringify(frame).includes("must-not-leak")),
    ).toBe(false);
  });

  it("drops later chunks for a state evicted at the hard cap until its run ends", () => {
    const redactor = new StreamRedactor();
    for (let index = 0; index < 1024; index += 1) {
      redactor.processMessage({
        type: "message.delta",
        runId: `run-${index}`,
        text: `ordinary-${index}`,
      });
    }
    redactor.processMessage({
      type: "message.delta",
      runId: "run-1024",
      text: "later-secret",
    });

    expect(
      redactor.processMessage({
        type: "message.delta",
        runId: "run-0",
        text: "must-not-be-treated-as-ordinary",
      }),
    ).toEqual([]);
  });

  it("redacts a PEM block split across message chunks", async () => {
    const adapter = new HermesAdapterImplementation(
      {
        connect: async () => undefined,
        disconnect: async () => undefined,
        call: async () => undefined,
        stream: () => ({
          async *[Symbol.asyncIterator]() {
            yield { type: "message.delta", runId: "run-1", text: "-----BEGIN PRIVATE" };
            yield {
              type: "message.delta",
              runId: "run-1",
              text: " KEY-----\nprivate-key-secret\n-----END PRIVATE",
            };
            yield { type: "message.delta", runId: "run-1", text: " KEY-----\n" };
            yield { type: "run.completed", runId: "run-1" };
          },
        }),
      },
      { ...createDefaultCapabilities(), streaming: { status: "observed" } },
    );
    await adapter.connect();

    const events = [];
    for await (const event of adapter.sendMessage("session-1", { text: "hello" }))
      events.push(event);

    expect(JSON.stringify(events)).not.toContain("private-key-secret");
    expect(JSON.stringify(events)).toContain("[REDACTED PRIVATE KEY]");
  });

  it("redacts URL credentials split across message chunks", async () => {
    const adapter = new HermesAdapterImplementation(
      {
        connect: async () => undefined,
        disconnect: async () => undefined,
        call: async () => undefined,
        stream: () => ({
          async *[Symbol.asyncIterator]() {
            yield { type: "message.delta", runId: "run-1", text: "https://user:" };
            yield {
              type: "message.delta",
              runId: "run-1",
              text: "split-url-secret@example.com/path",
            };
            yield { type: "run.completed", runId: "run-1" };
          },
        }),
      },
      { ...createDefaultCapabilities(), streaming: { status: "observed" } },
    );
    await adapter.connect();

    const events = [];
    for await (const event of adapter.sendMessage("session-1", { text: "hello" }))
      events.push(event);

    expect(JSON.stringify(events)).not.toContain("split-url-secret");
    expect(JSON.stringify(events)).toContain("https://[REDACTED]@example.com/path");
  });

  it("does not leak a held sensitive prefix during tail flush", async () => {
    const adapter = new HermesAdapterImplementation(
      {
        connect: async () => undefined,
        disconnect: async () => undefined,
        call: async () => undefined,
        stream: () => ({
          async *[Symbol.asyncIterator]() {
            yield { type: "message.delta", runId: "run-1", text: "secret" };
            yield { type: "message.delta", runId: "run-1", text: "=flush-secret" };
            yield { type: "run.completed", runId: "run-1" };
          },
        }),
      },
      { ...createDefaultCapabilities(), streaming: { status: "observed" } },
    );
    await adapter.connect();

    const events = [];
    for await (const event of adapter.sendMessage("session-1", { text: "hello" }))
      events.push(event);

    expect(JSON.stringify(events)).not.toContain("flush-secret");
  });

  it("flushes ordinary held text before a run stops", async () => {
    const adapter = new HermesAdapterImplementation(
      {
        connect: async () => undefined,
        disconnect: async () => undefined,
        call: async () => undefined,
        stream: () => ({
          async *[Symbol.asyncIterator]() {
            yield { type: "message.delta", runId: "run-1", text: "ordinary " };
            yield { type: "run.stopped", runId: "run-1" };
          },
        }),
      },
      { ...createDefaultCapabilities(), streaming: { status: "observed" } },
    );
    await adapter.connect();

    const events = [];
    for await (const event of adapter.sendMessage("session-1", { text: "hello" }))
      events.push(event);

    expect(events).toEqual([
      { type: "message.delta", runId: "run-1", text: "ordinary " },
      { type: "run.stopped", runId: "run-1" },
    ]);
  });

  it("flushes and redacts held text before surfacing a stream error", async () => {
    const adapter = new HermesAdapterImplementation(
      {
        connect: async () => undefined,
        disconnect: async () => undefined,
        call: async () => undefined,
        stream: () => ({
          async *[Symbol.asyncIterator]() {
            yield { type: "message.delta", runId: "run-1", text: "token" };
            throw new Error("upstream failed");
          },
        }),
      },
      { ...createDefaultCapabilities(), streaming: { status: "observed" } },
    );
    await adapter.connect();

    const events: unknown[] = [];
    await expect(
      (async () => {
        try {
          for await (const event of adapter.sendMessage("session-1", { text: "hello" }))
            events.push(event);
        } catch {
          return;
        }
        throw new Error("stream did not fail");
      })(),
    ).resolves.toBeUndefined();

    expect(events).toContainEqual({ type: "message.delta", runId: "run-1", text: "token" });
  });

  it("wraps malformed call responses without exposing validation details", async () => {
    const adapter = new HermesAdapterImplementation(
      {
        connect: async () => undefined,
        disconnect: async () => undefined,
        call: async () => [{ id: "bad response", contextWindow: "secret=do-not-leak" }],
        stream: async function* () {},
      },
      { ...createDefaultCapabilities(), models: { status: "observed" } },
    );
    await adapter.connect();

    const error = await adapter.listModels().catch((value: unknown) => value);
    expect(error).toBeInstanceOf(HermesAdapterError);
    expect(error).toMatchObject({ code: "INVALID_RESPONSE", operation: "listModels" });
    expect((error as Error).message).toBe("Hermes returned an invalid response.");
    expect((error as Error).message).not.toContain("secret=do-not-leak");
  });

  it("wraps thrown call transport errors without exposing upstream text", async () => {
    const adapter = new HermesAdapterImplementation(
      {
        connect: async () => undefined,
        disconnect: async () => undefined,
        call: async () => {
          throw new Error("Bearer call-secret password=call-password");
        },
        stream: async function* () {},
      },
      { ...createDefaultCapabilities(), models: { status: "observed" } },
    );
    await adapter.connect();

    const error = await adapter.listModels().catch((value: unknown) => value);
    expect(error).toBeInstanceOf(HermesAdapterError);
    expect(error).toMatchObject({ code: "TRANSPORT_CALL_FAILED", operation: "listModels" });
    expect((error as Error).message).toBe("Hermes transport call failed.");
    expect((error as Error).message).not.toMatch(/call-secret|call-password/);
  });

  it("wraps thrown stream transport errors without exposing upstream text", async () => {
    const adapter = new HermesAdapterImplementation(
      {
        connect: async () => undefined,
        disconnect: async () => undefined,
        call: async () => undefined,
        stream: () => ({
          async *[Symbol.asyncIterator]() {
            yield* [] as never[];
            throw new Error("token=stream-token");
          },
        }),
      },
      { ...createDefaultCapabilities(), streaming: { status: "observed" } },
    );
    await adapter.connect();

    const consume = async () => {
      for await (const event of adapter.sendMessage("session-1", { text: "hello" })) {
        void event;
      }
    };
    await expect(consume()).rejects.toMatchObject({
      code: "TRANSPORT_STREAM_FAILED",
      operation: "sendMessage",
    });
    await expect(consume()).rejects.toMatchObject({ message: "Hermes transport stream failed." });
  });

  it("wraps connect and disconnect transport errors without exposing upstream text", async () => {
    const adapter = new HermesAdapterImplementation(
      {
        connect: async () => {
          throw new Error("Authorization: Bearer connect-secret");
        },
        disconnect: async () => {
          throw new Error("password=disconnect-secret");
        },
        call: async () => undefined,
        stream: async function* () {},
      },
      createDefaultCapabilities(),
    );

    await expect(adapter.connect()).rejects.toMatchObject({
      code: "TRANSPORT_CONNECT_FAILED",
      operation: "connect",
      message: "Hermes transport connect failed.",
    });

    const connectedAdapter = new HermesAdapterImplementation(
      {
        connect: async () => undefined,
        disconnect: async () => {
          throw new Error("password=disconnect-secret");
        },
        call: async () => undefined,
        stream: async function* () {},
      },
      createDefaultCapabilities(),
    );
    await connectedAdapter.connect();
    await expect(connectedAdapter.disconnect()).rejects.toMatchObject({
      code: "TRANSPORT_DISCONNECT_FAILED",
      operation: "disconnect",
      message: "Hermes transport disconnect failed.",
    });
  });

  it("leaves the adapter disconnected after connect and reconnect failures", async () => {
    let connectAttempts = 0;
    const adapter = new HermesAdapterImplementation(
      {
        connect: async () => {
          connectAttempts += 1;
          if (connectAttempts > 1) throw new Error("stale connection");
        },
        disconnect: async () => undefined,
        call: async () => [],
        stream: async function* () {},
      },
      { ...createDefaultCapabilities(), models: { status: "observed" } },
    );

    await adapter.connect();
    await expect(adapter.connect()).rejects.toMatchObject({ code: "TRANSPORT_CONNECT_FAILED" });
    await expect(adapter.listModels()).rejects.toMatchObject({ code: "INVALID_ADAPTER_STATE" });

    await expect(adapter.connect()).rejects.toMatchObject({ code: "TRANSPORT_CONNECT_FAILED" });
    await expect(adapter.listModels()).rejects.toMatchObject({ code: "INVALID_ADAPTER_STATE" });
  });

  it("marks the adapter disconnected before rethrowing a disconnect failure", async () => {
    const adapter = new HermesAdapterImplementation(
      {
        connect: async () => undefined,
        disconnect: async () => {
          throw new Error("transport is gone");
        },
        call: async () => [],
        stream: async function* () {},
      },
      { ...createDefaultCapabilities(), models: { status: "observed" } },
    );

    await adapter.connect();
    await expect(adapter.disconnect()).rejects.toMatchObject({
      code: "TRANSPORT_DISCONNECT_FAILED",
    });
    await expect(adapter.listModels()).rejects.toMatchObject({ code: "INVALID_ADAPTER_STATE" });
  });

  it("redacts caller-provided HermesAdapterError fields and safe output", () => {
    const error = new HermesAdapterError({
      code: "api-key=code-secret",
      message: "Authorization: Bearer message-secret",
      component: "cookie=component-secret",
      operation: "token=operation-secret",
      likelyCause: "https://user:password-secret@example.com",
      nextAction: "privateKey=next-secret",
    });

    expect(JSON.stringify(error.toSafeError())).not.toMatch(
      /code-secret|message-secret|component-secret|operation-secret|password-secret|next-secret/,
    );
    expect(error.message).not.toContain("message-secret");
  });

  it("redacts an active credential from later streamed output", async () => {
    const adapter = new HermesAdapterImplementation(
      {
        connect: async () => undefined,
        disconnect: async () => undefined,
        call: async () => undefined,
        stream: async function* () {
          yield { type: "message.delta", runId: "run-1", text: "token=live-secret" };
          yield {
            type: "tool.output",
            runId: "run-1",
            toolCallId: "tool-1",
            chunk: "live-secret",
          };
          yield { type: "run.completed", runId: "run-1" };
        },
      },
      { ...createDefaultCapabilities(), streaming: { status: "observed" } },
    );

    await adapter.connect();
    await adapter.provideCredential("session-1", "request-1", "live-secret");
    const events = [];
    for await (const event of adapter.sendMessage("session-1", { text: "continue" }))
      events.push(event);

    expect(JSON.stringify(events)).not.toContain("live-secret");
    expect(events).toContainEqual(expect.objectContaining({ type: "message.delta" }));
    expect(events).toContainEqual(expect.objectContaining({ type: "tool.output" }));
  });
});
