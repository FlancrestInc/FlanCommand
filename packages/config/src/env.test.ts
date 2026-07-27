import { describe, expect, it } from "vitest";

import { parseEnv } from "./env.js";

describe("parseEnv", () => {
  it("uses safe defaults for an empty environment", () => {
    expect(parseEnv({})).toEqual({
      nodeEnv: "development",
      hermesEndpoint: "ws://127.0.0.1:9119/api/ws",
      hermesOrigin: "http://127.0.0.1:3000",
      hermesAuthRef: undefined,
      hermesDashboardUsername: undefined,
      hermesDashboardPassword: undefined,
      probeOutputDir: "probe-output",
      limits: {
        connectTimeoutMs: 5000,
        requestTimeoutMs: 10000,
        idleTimeoutMs: 30000,
        totalTimeoutMs: 120000,
        maxFrameBytes: 1048576,
        maxTranscriptBytes: 10485760,
        maxEvents: 500,
        maxTestSessions: 1,
      },
    });
  });

  it("parses configured values and keeps auth as a reference", () => {
    const parsed = parseEnv({
      NODE_ENV: "test",
      HERMES_ENDPOINT: "wss://hermes.example.test/api/ws",
      HERMES_ORIGIN: "https://app.example.test",
      HERMES_AUTH_REF: "secret/hermes-token",
      PROBE_OUTPUT_DIR: "tmp/probe",
      PROBE_MAX_EVENTS: "42",
    });

    expect(parsed.hermesAuthRef).toBe("secret/hermes-token");
    expect(parsed.hermesEndpoint).toBe("wss://hermes.example.test/api/ws");
    expect(parsed.limits.maxEvents).toBe(42);
  });

  it.each([
    "/tmp/probe",
    "C:\\tmp\\probe",
    "\\\\server\\share\\probe",
    ".",
    "./tmp/probe",
    "..",
    "../tmp/probe",
    "tmp/../probe",
    "tmp/./probe",
    "tmp\u0000probe",
    "tmp\u001fprobe",
    "tmp\u007fprobe",
  ])("rejects unsafe PROBE_OUTPUT_DIR: %s", (probeOutputDir) => {
    expect(() => parseEnv({ PROBE_OUTPUT_DIR: probeOutputDir })).toThrow(
      /environment validation failed/,
    );
  });

  it.each(["probe-output", "tmp/probe", "tmp\\probe", " probe-output "])(
    "accepts safe relative PROBE_OUTPUT_DIR: %s",
    (probeOutputDir) => {
      expect(parseEnv({ PROBE_OUTPUT_DIR: probeOutputDir }).probeOutputDir).toBe(
        probeOutputDir.trim(),
      );
    },
  );

  it("accepts a blank auth reference from .env.example as unset", () => {
    expect(parseEnv({ HERMES_AUTH_REF: "" }).hermesAuthRef).toBeUndefined();
  });

  it("rejects invalid endpoints and limits without echoing secret values", () => {
    const secret = "super-secret-token";

    expect(() =>
      parseEnv({
        HERMES_ENDPOINT: "http://not-a-websocket",
        HERMES_AUTH_REF: secret,
        PROBE_MAX_EVENTS: "0",
      }),
    ).toThrow(/environment validation failed/);

    try {
      parseEnv({
        HERMES_ENDPOINT: "http://not-a-websocket",
        HERMES_AUTH_REF: secret,
      });
      expect.fail("parseEnv should reject an invalid endpoint");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it.each([
    "ws://user:password@hermes.example.test/api/ws",
    "wss://user@hermes.example.test/api/ws",
  ])("rejects Hermes endpoint credentials: %s", (endpoint) => {
    expect(() => parseEnv({ HERMES_ENDPOINT: endpoint })).toThrow(/environment validation failed/);
  });

  it.each([
    "ftp://app.example.test",
    "https://user:password@app.example.test",
    "https://app.example.test/path",
    "https://app.example.test?token=secret",
    "https://app.example.test#fragment",
  ])("rejects non-origin Hermes origins: %s", (origin) => {
    expect(() => parseEnv({ HERMES_ORIGIN: origin })).toThrow(/environment validation failed/);
  });

  it.each([
    ["PROBE_CONNECT_TIMEOUT_MS", "60001"],
    ["PROBE_REQUEST_TIMEOUT_MS", "300001"],
    ["PROBE_IDLE_TIMEOUT_MS", "300001"],
    ["PROBE_TOTAL_TIMEOUT_MS", "900001"],
    ["PROBE_MAX_FRAME_BYTES", "16777217"],
    ["PROBE_MAX_TRANSCRIPT_BYTES", "104857601"],
    ["PROBE_MAX_EVENTS", "10001"],
    ["PROBE_MAX_TEST_SESSIONS", "11"],
  ])("rejects oversized %s", (key, value) => {
    expect(() => parseEnv({ [key]: value })).toThrow(/environment validation failed/);
  });

  it.each(["1.5", "NaN", "Infinity", "-Infinity"])("rejects invalid numeric limit %s", (value) => {
    expect(() => parseEnv({ PROBE_MAX_EVENTS: value })).toThrow(/environment validation failed/);
  });

  it.each([
    ["request before total", { PROBE_REQUEST_TIMEOUT_MS: "120000" }],
    ["idle before total", { PROBE_IDLE_TIMEOUT_MS: "120000" }],
    ["request equal to total", { PROBE_REQUEST_TIMEOUT_MS: "120000" }],
    ["idle equal to total", { PROBE_IDLE_TIMEOUT_MS: "120000" }],
  ])("rejects bad timeout ordering: %s", (_, values) => {
    expect(() => parseEnv({ ...values })).toThrow(/environment validation failed/);
  });
});
