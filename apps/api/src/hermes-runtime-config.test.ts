import { describe, expect, it } from "vitest";

import { readHermesRuntimeConfig } from "./hermes-runtime-config.js";

describe("Hermes runtime configuration", () => {
  it("uses the shared endpoint and origin names and keeps auth server-side", () => {
    expect(
      readHermesRuntimeConfig({
        HERMES_TRANSPORT: "websocket",
        HERMES_ENDPOINT: "wss://gospel.lan/api/ws",
        HERMES_ORIGIN: "https://command.example",
        HERMES_AUTH_TOKEN: "server-only-token",
        HERMES_MAX_FRAME_BYTES: "4194304",
      }),
    ).toEqual({
      transport: "websocket",
      endpoint: "wss://gospel.lan/api/ws",
      origin: "https://command.example",
      auth: { token: "server-only-token" },
      maxFrameBytes: 4194304,
    });
  });

  it("keeps mock mode as the safe default and ignores blank auth", () => {
    expect(readHermesRuntimeConfig({})).toEqual({
      transport: "mock",
      endpoint: "ws://127.0.0.1:9119/api/ws",
      origin: "http://127.0.0.1:3000",
      maxFrameBytes: 8 * 1024 * 1024,
    });
  });

  it("accepts the old API names during migration", () => {
    expect(
      readHermesRuntimeConfig({
        HERMES_TRANSPORT: "websocket",
        HERMES_WS_ENDPOINT: "ws://legacy.test/ws",
        HERMES_WEB_ORIGIN: "http://legacy.test",
      }),
    ).toMatchObject({
      endpoint: "ws://legacy.test/ws",
      origin: "http://legacy.test",
    });
  });
});
