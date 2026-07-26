import { describe, expect, it } from "vitest";
import { parseOptions } from "./options.js";
import { SAFE_PROMPT } from "./test-profile.js";
import { EXIT_CODES, readProbeAuth, runProbe, sessionsToResume } from "./runner.js";

describe("probe options", () => {
  it("uses safe defaults and exact flags", () => {
    const options = parseOptions(["--mode", "mock"]);
    expect(options.mode).toBe("mock");
    expect(options.endpoint).toBe("ws://127.0.0.1:9119/api/ws");
    expect(options.origin).toBe("http://127.0.0.1:3000");
    expect(options.limits).toMatchObject({
      connectTimeoutMs: 5000,
      requestTimeoutMs: 10000,
      idleTimeoutMs: 30000,
      totalTimeoutMs: 120000,
      maxFrameBytes: 8 * 1024 * 1024,
      maxTranscriptBytes: 10 * 1024 * 1024,
      maxEvents: 500,
      maxTestSessions: 1,
    });
  });

  it("rejects a non-loopback live endpoint without the private flag", () => {
    expect(() =>
      parseOptions(["--mode", "live", "--endpoint", "wss://example.test/api/ws"]),
    ).toThrow(/private endpoint/i);
  });

  it("requires the safe profile when test mutations are enabled", () => {
    expect(() => parseOptions(["--mode", "mock", "--allow-test-mutations"])).toThrow(/profile/i);
  });
});

describe("probe runner", () => {
  it("bounds live session resume work and prefers Hermes sessions", () => {
    expect(
      sessionsToResume(
        [
          { id: "telegram-session", source: "telegram" },
          { id: "hermes-session", source: "hermes" },
          { id: "other-session", source: "unknown" },
        ],
        1,
      ).map((session) => session.id),
    ).toEqual(["hermes-session"]);
  });

  it("reads the live Hermes token without exposing it in probe options", () => {
    expect(readProbeAuth({ HERMES_AUTH_TOKEN: " temporary-token " })).toEqual({
      token: "temporary-token",
    });
    expect(readProbeAuth({ HERMES_AUTH_TOKEN: " " })).toBeUndefined();
  });

  it("runs the mock end to end with the explicit mutation profile", async () => {
    const result = await runProbe({
      ...parseOptions([
        "--mode",
        "mock",
        "--allow-test-mutations",
        "--profile",
        "hermes-command-center-safe",
      ]),
      output: undefined,
      writeReport: false,
    });

    expect(result.exitCode).toBe(EXIT_CODES.complete);
    expect(result.events.some((event) => event.type === "run.completed")).toBe(true);
    expect(SAFE_PROMPT).toBe(
      "Reply with exactly: HERMES_PROBE_OK. Do not call tools, read or write files, access the network, use credentials, send messages, or cause external side effects.",
    );
  });
});
