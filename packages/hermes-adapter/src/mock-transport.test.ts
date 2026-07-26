import { describe, expect, it } from "vitest";

import { createHermesAdapter } from "./create-adapter.js";
import { UnsupportedOperationError } from "./errors.js";
import { MockHermesTransport } from "./mock-transport.js";

describe("mock Hermes transport", () => {
  it("sets handshake-ready state when connect completes", async () => {
    const transport = new MockHermesTransport();
    expect(transport.isHandshakeReady()).toBe(false);
    await transport.connect();
    expect(transport.isHandshakeReady()).toBe(true);
    expect(transport.peekGatewayReadyFrame()).toMatchObject({
      method: "event",
      params: { type: "gateway.ready" },
    });
  });

  it("stores handshake during connect before stream creation", async () => {
    const transport = new MockHermesTransport();
    await transport.connect();
    const ready = transport.peekGatewayReadyFrame();

    expect(ready).toMatchObject({ params: { type: "gateway.ready" } });
    expect(transport.stream("sendMessage", { sessionId: "session-1" })).toBeDefined();
    expect(transport.peekGatewayReadyFrame()).toBeUndefined();
  });

  it("throws a typed unsupported-operation error for unimplemented calls", async () => {
    const transport = new MockHermesTransport();
    await transport.connect();

    await expect(transport.call("renameSession", { sessionId: "session-1" })).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof UnsupportedOperationError &&
        error.code === "UNSUPPORTED_OPERATION" &&
        error.operation === "renameSession",
    );
  });

  it("supports handshake, sessions, streamed responses, stop, and reconnect gap", async () => {
    const adapter = createHermesAdapter({ transport: "mock" });
    await adapter.connect();
    await expect(adapter.listSessions()).resolves.toHaveLength(2);
    const created = await adapter.createSession({ title: "created" });
    await expect(adapter.resumeSession(created.id)).resolves.toMatchObject({ id: created.id });

    const events = [];
    for await (const event of adapter.sendMessage("session-1", { text: "hello" }))
      events.push(event);
    expect(events.some((event) => event.type === "message.delta")).toBe(true);
    expect(events.some((event) => event.type === "tool.started")).toBe(true);

    await adapter.stopRun("run-session-1");
    await adapter.disconnect();
    await adapter.connect();
    const afterReconnect = [];
    for await (const event of adapter.sendMessage("session-1", { text: "again" }))
      afterReconnect.push(event);
    expect(afterReconnect).toContainEqual(
      expect.objectContaining({ type: "reconnect.gap", sessionId: "session-1" }),
    );
  });

  it("supports the model and command controls used by the browser shell", async () => {
    const adapter = createHermesAdapter({ transport: "mock" });
    await adapter.connect();

    await expect(adapter.listModels()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "mock-model", name: "Mock model" })]),
    );
    await expect(adapter.listCommands("session-1")).resolves.toEqual([
      expect.objectContaining({ name: "/status" }),
    ]);
    await expect(adapter.setSessionModel("session-1", "mock-model-fast")).resolves.toBeUndefined();
    await expect(adapter.getSession("session-1")).resolves.toMatchObject({
      modelId: "mock-model-fast",
    });
  });

  it("reports mock fixture capability evidence and stops between pulls", async () => {
    const adapter = createHermesAdapter({ transport: "mock" });
    await expect(adapter.getCapabilities()).resolves.toMatchObject({
      streaming: { evidence: "mock fixture" },
      stop: { evidence: "mock fixture" },
    });
    await adapter.connect();
    const stream = adapter.sendMessage("session-1", { text: "hello" })[Symbol.asyncIterator]();
    await stream.next();
    await adapter.stopRun("run-session-1");
    expect((await stream.next()).value).toMatchObject({
      type: "run.stopped",
      runId: "run-session-1",
    });

    const later = [];
    for await (const event of adapter.sendMessage("session-1", { text: "later" }))
      later.push(event);
    expect(later.some((event) => event.type === "message.delta")).toBe(true);
  });

  it("keeps two concurrent session streams correlated", async () => {
    const adapter = createHermesAdapter({ transport: "mock" });
    await adapter.connect();
    const read = async (sessionId: string) => {
      const events = [];
      for await (const event of adapter.sendMessage(sessionId, { text: sessionId }))
        events.push(event);
      return events;
    };
    const [first, second] = await Promise.all([read("session-1"), read("session-2")]);
    expect(
      first
        .filter((event) => "sessionId" in event)
        .every((event) => event.sessionId === "session-1"),
    ).toBe(true);
    expect(
      second
        .filter((event) => "sessionId" in event)
        .every((event) => event.sessionId === "session-2"),
    ).toBe(true);
  });

  it("emits one reconnect gap for every existing concurrent session", async () => {
    const transport = new MockHermesTransport();
    await transport.connect();
    await transport.disconnect();
    await transport.connect();

    const readGaps = async (sessionId: string) => {
      const events = [];
      for await (const event of transport.stream("sendMessage", { sessionId })) {
        if ((event as { type?: string }).type === "reconnect.gap") events.push(event);
      }
      return events;
    };
    const [first, second] = await Promise.all([readGaps("session-1"), readGaps("session-2")]);

    expect(first).toEqual([
      expect.objectContaining({ type: "reconnect.gap", sessionId: "session-1" }),
    ]);
    expect(second).toEqual([
      expect.objectContaining({ type: "reconnect.gap", sessionId: "session-2" }),
    ]);
  });

  it("replays duplicate fixture frames as diagnostics without replaying the message", async () => {
    const adapter = createHermesAdapter({ transport: "mock" });
    await adapter.connect();
    const events = [];
    for await (const event of adapter.sendMessage("session-1", { text: "hello" }))
      events.push(event);

    expect(events.filter((event) => event.type === "message.delta")).toEqual([
      expect.objectContaining({ text: "Mock reply" }),
    ]);
    expect(events).toContainEqual(expect.objectContaining({ type: "diagnostic.unknown" }));
  });

  it("normalizes source-shaped fixture frames and correlates their generated run", async () => {
    const adapter = createHermesAdapter({ transport: "mock" });
    await adapter.connect();
    const events = [];
    for await (const event of adapter.sendMessage("session-1", { text: "hello" }))
      events.push(event);

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "message.delta",
        runId: "run-session-1",
        text: "Mock reply",
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "tool.started",
        runId: "run-session-1",
        toolCall: expect.objectContaining({ input: { input: "fixture" } }),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: "tool.completed", result: '{"ok":true}' }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "approval.requested",
        approval: expect.objectContaining({ id: expect.stringMatching(/^approval-/) }),
      }),
    );
  });

  it("produces byte-identical output across repeated runs", async () => {
    const collect = async (): Promise<string> => {
      const adapter = createHermesAdapter({ transport: "mock" });
      await adapter.connect();
      const events = [];
      for await (const event of adapter.sendMessage("session-1", { text: "hello" }))
        events.push(event);
      return JSON.stringify(events);
    };

    expect(await collect()).toBe(await collect());
  });
});
