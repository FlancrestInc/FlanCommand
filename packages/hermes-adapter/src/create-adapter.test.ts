import { describe, expect, it } from "vitest";

import { createDefaultCapabilities } from "./capabilities.js";
import { createHermesAdapter } from "./create-adapter.js";
import type { SocketLike } from "./ws-transport.js";

class FactorySocket implements SocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event?: { code?: number }) => void) | null = null;
  readyState = 0;
  readonly sent: string[] = [];

  send(value: string): void {
    this.sent.push(value);
  }

  close(): void {
    this.readyState = 3;
  }

  openReady(): void {
    this.readyState = 1;
    this.onopen?.();
    this.onmessage?.({
      data: JSON.stringify({
        jsonrpc: "2.0",
        method: "event",
        params: { type: "gateway.ready", payload: {} },
      }),
    });
  }
}

describe("createHermesAdapter", () => {
  it.each(["mock", "websocket"] as const)("creates the same contract for %s", (transport) => {
    const adapter = createHermesAdapter({ transport });
    expect(typeof adapter.connect).toBe("function");
    expect(typeof adapter.sendMessage).toBe("function");
    expect(typeof adapter.approveAction).toBe("function");
  });

  it("selects the deterministic mock and websocket transport", async () => {
    const capabilities = {
      ...createDefaultCapabilities(),
      models: { status: "observed" as const },
    };
    const mock = createHermesAdapter({ transport: "mock", capabilities });
    const socket = new FactorySocket();
    const websocket = createHermesAdapter({
      transport: "websocket",
      capabilities,
      endpoint: "ws://gateway.test/ws",
      origin: "http://command.test",
      socketFactory: () => socket,
    });
    await mock.connect();
    const websocketConnecting = websocket.connect();
    socket.openReady();
    await websocketConnecting;

    const mockResult = await mock.listModels();
    const listModels = websocket.listModels();
    const request = JSON.parse(socket.sent.at(-1) ?? "{}") as { id: string };
    socket.onmessage?.({
      data: JSON.stringify({ jsonrpc: "2.0", id: request.id, result: [] }),
    });
    await expect(listModels).resolves.toEqual([]);
    expect(mockResult).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "mock-model" })]),
    );
    expect(socket.sent.at(-1)).toContain('"method":"model.options"');
  });

  it("advertises Hermes model selection from the websocket protocol", async () => {
    const adapter = createHermesAdapter({ transport: "websocket" });

    await expect(adapter.getCapabilities()).resolves.toMatchObject({
      modelSelection: {
        status: "source-inferred",
        evidence: expect.stringContaining("config.set"),
      },
    });
  });

  it("uses an injected transport through the public factory", async () => {
    const adapter = createHermesAdapter({
      transport: "websocket",
      capabilities: {
        ...createDefaultCapabilities(),
        models: { status: "observed" as const },
      },
      injectedTransport: {
        connect: async () => undefined,
        disconnect: async () => undefined,
        call: async (operation) =>
          operation === "listModels" ? [{ id: "injected-model" }] : undefined,
        stream: async function* () {
          yield { type: "run.stopped", runId: "run-1" };
        },
      },
    });

    await adapter.connect();
    await expect(adapter.listModels()).resolves.toEqual([{ id: "injected-model" }]);
  });
});
