import { describe, expect, it } from "vitest";

import {
  agentEventSchema,
  capabilityStatusSchema,
  hermesSessionSchema,
  modelInfoSchema,
  redactSafeText,
  safeErrorSchema,
  slashCommandSchema,
  usageSchema,
} from "./schemas.js";

const eventFixtures = [
  { type: "run.started", runId: "run-1", sessionId: "session-1", at: "2026-07-22T00:00:00.000Z" },
  { type: "run.status", runId: "run-1", stage: "thinking" },
  { type: "message.delta", runId: "run-1", text: "hello" },
  { type: "message.completed", runId: "run-1", messageId: "message-1" },
  { type: "tool.started", runId: "run-1", toolCall: { id: "tool-1", name: "search" } },
  { type: "tool.output", runId: "run-1", toolCallId: "tool-1", chunk: "result" },
  { type: "tool.completed", runId: "run-1", toolCallId: "tool-1", result: { ok: true } },
  {
    type: "tool.failed",
    runId: "run-1",
    toolCallId: "tool-1",
    error: { code: "FAILED", message: "no" },
  },
  { type: "approval.requested", runId: "run-1", approval: { id: "approval-1", action: "run" } },
  { type: "clarification.requested", runId: "run-1", question: "Which file?" },
  { type: "memory.used", runId: "run-1", memory: { label: "memory-1" } },
  { type: "artifact.created", runId: "run-1", artifact: { id: "artifact-1", name: "out.txt" } },
  { type: "context.updated", sessionId: "session-1", usage: { totalTokens: 3 } },
  { type: "run.completed", runId: "run-1" },
  { type: "run.failed", runId: "run-1", error: { code: "FAILED", message: "no" } },
  { type: "run.stopped", runId: "run-1" },
  { type: "reconnect.gap", sessionId: "session-1", reason: "no cursor" },
  { type: "diagnostic.unknown", raw: { type: "future.event" } },
] as const;

describe("event schemas", () => {
  it("accepts a complete normalized event", () => {
    expect(
      agentEventSchema.parse({
        type: "message.delta",
        sessionId: "session-1",
        runId: "run-1",
        text: "hello",
      }),
    ).toMatchObject({ type: "message.delta", text: "hello" });
  });

  it("rejects malformed usage and unknown extra fields", () => {
    expect(() => usageSchema.parse({ inputTokens: -1 })).toThrow();
    expect(() => capabilityStatusSchema.parse({ status: "maybe" })).toThrow();
    expect(() => safeErrorSchema.parse({ code: "bad", message: "x", secret: "leak" })).toThrow();
  });

  it("retains unknown diagnostics and reconnect gaps as first-class events", () => {
    expect(
      agentEventSchema.parse({
        type: "diagnostic.unknown",
        sessionId: "session-1",
        raw: { type: "future.event", token: "already-redacted" },
      }),
    ).toMatchObject({ type: "diagnostic.unknown" });
    expect(
      agentEventSchema.parse({
        type: "reconnect.gap",
        sessionId: "session-1",
        reason: "gateway did not expose a replay cursor",
      }),
    ).toMatchObject({ type: "reconnect.gap" });
  });

  it.each(eventFixtures)("validates the $type event variant", (event) => {
    expect(agentEventSchema.parse(event)).toMatchObject({ type: event.type });
  });

  it("redacts secret-bearing safe error text during validation", () => {
    const safeError = safeErrorSchema.parse({
      code: "GATEWAY_FAILED",
      message: "Authorization: Bearer super-secret-token",
      nextAction: "Use token=super-secret-token in the gateway config",
    });
    expect(safeError.message).not.toContain("super-secret-token");
    expect(safeError.nextAction).not.toContain("super-secret-token");
  });

  it("recursively redacts secrets from tool inputs and results", () => {
    const event = agentEventSchema.parse({
      type: "tool.started",
      runId: "run-1",
      toolCall: {
        id: "tool-1",
        name: "deploy",
        input: {
          token: "top-secret-token",
          nested: [{ secret: "nested-secret" }, "Bearer bearer-secret"],
          note: 'password=plain-secret api-key: api-secret token="quoted-secret"',
          privateKey: "-----BEGIN PRIVATE KEY-----\nprivate-secret\n-----END PRIVATE KEY-----",
        },
      },
    });
    const result = agentEventSchema.parse({
      type: "tool.completed",
      runId: "run-1",
      toolCallId: "tool-1",
      result: { output: [{ password: "result-secret" }, "secret=result-secret-2"] },
    });

    expect(JSON.stringify(event)).not.toMatch(
      /top-secret-token|nested-secret|bearer-secret|plain-secret|api-secret|quoted-secret|private-secret/,
    );
    expect(JSON.stringify(result)).not.toMatch(/result-secret/);
  });

  it("redacts underscore secret keys recursively", () => {
    const event = agentEventSchema.parse({
      type: "tool.completed",
      runId: "run-1",
      toolCallId: "tool-1",
      result: {
        credentials: {
          client_secret: "client-secret",
          db_password: "db-secret",
          access_token: "access-secret",
          refresh_token: "refresh-secret",
          session_token: "session-secret",
          api_key: "api-secret",
          private_key: "private-secret",
        },
        nested: [{ client_secret: "nested-client-secret" }],
      },
    });

    expect(JSON.stringify(event)).not.toMatch(
      /client-secret|db-secret|access-secret|refresh-secret|session-secret|api-secret|private-secret|nested-client-secret/,
    );
    expect(event).toMatchObject({
      result: {
        credentials: {
          client_secret: "[REDACTED]",
          db_password: "[REDACTED]",
          access_token: "[REDACTED]",
          refresh_token: "[REDACTED]",
          session_token: "[REDACTED]",
          api_key: "[REDACTED]",
          private_key: "[REDACTED]",
        },
      },
    });
  });

  it("redacts camelCase and hyphenated secret keys recursively", () => {
    const event = agentEventSchema.parse({
      type: "diagnostic.unknown",
      raw: {
        nested: {
          secretKey: "secret-key-value",
          authToken: "auth-token-value",
          oauthToken: "oauth-token-value",
          credential: "credential-value",
          apiKey: "api-key-value",
          clientSecret: "client-secret-value",
          privateKey: "private-key-value",
          "api-key": "hyphen-api-key-value",
          "client-secret": "hyphen-client-secret-value",
          "private-key": "hyphen-private-key-value",
        },
      },
    });

    expect(JSON.stringify(event)).not.toMatch(
      /secret-key-value|auth-token-value|oauth-token-value|credential-value|api-key-value|client-secret-value|private-key-value|hyphen-api-key-value|hyphen-client-secret-value|hyphen-private-key-value/,
    );
    expect(event).toMatchObject({
      raw: {
        nested: {
          secretKey: "[REDACTED]",
          authToken: "[REDACTED]",
          oauthToken: "[REDACTED]",
          credential: "[REDACTED]",
          apiKey: "[REDACTED]",
          clientSecret: "[REDACTED]",
          privateKey: "[REDACTED]",
          "api-key": "[REDACTED]",
          "client-secret": "[REDACTED]",
          "private-key": "[REDACTED]",
        },
      },
    });
  });

  it("redacts nested keys with broad normalized sensitive aliases and keeps safe keys", () => {
    const event = agentEventSchema.parse({
      type: "diagnostic.unknown",
      raw: {
        metadata: {
          displayName: "safe-name",
          status: "safe-status",
          proxyAuthorization: "proxy-secret",
          "X-Client-Secret": "client-secret",
          x_session_token: "session-secret",
          APIKEY: "api-secret",
        },
        nested: [{ authorizationCookieValue: "cookie-secret", ordinaryValue: "safe-value" }],
      },
    });

    expect(event).toMatchObject({
      raw: {
        metadata: {
          displayName: "safe-name",
          status: "safe-status",
          proxyAuthorization: "[REDACTED]",
          "X-Client-Secret": "[REDACTED]",
          x_session_token: "[REDACTED]",
          APIKEY: "[REDACTED]",
        },
        nested: [{ authorizationCookieValue: "[REDACTED]", ordinaryValue: "safe-value" }],
      },
    });
  });

  it("replaces an entire sensitive recursive value, including objects and arrays", () => {
    const event = agentEventSchema.parse({
      type: "diagnostic.unknown",
      raw: {
        token: { nested: "object-secret", values: ["array-secret"] },
        clientSecret: ["list-secret", { password: "nested-secret" }],
        ordinary: { safe: "value" },
      },
    });

    expect(event).toMatchObject({
      raw: {
        token: "[REDACTED]",
        clientSecret: "[REDACTED]",
        ordinary: { safe: "value" },
      },
    });
    expect(JSON.stringify(event)).not.toMatch(/object-secret|array-secret|list-secret|nested-secret/);
  });

  it("matches sensitive key words and combinations without matching safe compound words", () => {
    const event = agentEventSchema.parse({
      type: "diagnostic.unknown",
      raw: {
        sessionStatus: "safe-session-status",
        accessMode: "safe-access-mode",
        refreshRate: "safe-refresh-rate",
        clientSecret: "client-secret",
        accessToken: "access-token",
        proxyAuthorization: "proxy-auth",
        xSessionToken: "session-token",
        apiKey: "api-key",
      },
    });

    expect(event).toMatchObject({
      raw: {
        sessionStatus: "safe-session-status",
        accessMode: "safe-access-mode",
        refreshRate: "safe-refresh-rate",
        clientSecret: "[REDACTED]",
        accessToken: "[REDACTED]",
        proxyAuthorization: "[REDACTED]",
        xSessionToken: "[REDACTED]",
        apiKey: "[REDACTED]",
      },
    });
  });

  it("recursively redacts unknown diagnostic payloads", () => {
    const diagnostic = agentEventSchema.parse({
      type: "diagnostic.unknown",
      raw: {
        token: "diagnostic-token",
        nested: {
          values: ["Bearer diagnostic-bearer", { apiKey: "diagnostic-api" }],
          sessionToken: "diagnostic-session",
          accessToken: "diagnostic-access",
          refreshToken: "diagnostic-refresh",
        },
      },
    });

    expect(JSON.stringify(diagnostic)).not.toMatch(
      /diagnostic-token|diagnostic-bearer|diagnostic-api|diagnostic-session|diagnostic-access|diagnostic-refresh/,
    );
  });

  it("redacts sensitive text across every public event string path", () => {
    const secretText =
      "Authorization: Bearer bearer-secret Cookie: session=cookie-secret; refresh=refresh-cookie " +
      "session_token=session-secret access_token=access-secret refresh_token=refresh-secret " +
      "https://url-user:url-password@example.com api_key=api-secret x-api-key: header-secret " +
      "-----BEGIN PRIVATE KEY-----\nprivate-secret\n-----END PRIVATE KEY-----";
    const events = [
      agentEventSchema.parse({
        type: "run.status",
        runId: secretText,
        sessionId: secretText,
        stage: secretText,
        detail: secretText,
      }),
      agentEventSchema.parse({ type: "message.delta", runId: "run-1", text: secretText }),
      agentEventSchema.parse({
        type: "tool.output",
        runId: "run-1",
        toolCallId: secretText,
        chunk: secretText,
      }),
      agentEventSchema.parse({
        type: "clarification.requested",
        runId: "run-1",
        question: secretText,
      }),
      agentEventSchema.parse({
        type: "memory.used",
        runId: "run-1",
        memory: { id: secretText, label: secretText, source: secretText },
      }),
      agentEventSchema.parse({
        type: "artifact.created",
        runId: "run-1",
        artifact: { id: secretText, name: secretText, mimeType: secretText, uri: secretText },
      }),
      agentEventSchema.parse({
        type: "run.completed",
        runId: "run-1",
        summary: { text: secretText },
      }),
    ];

    expect(JSON.stringify(events)).not.toMatch(
      /bearer-secret|cookie-secret|refresh-cookie|session-secret|access-secret|refresh-secret|url-user|url-password|api-secret|header-secret|private-secret/,
    );
  });

  it("redacts quoted JSON keys with whitespace around the separator", () => {
    const safeText = redactSafeText(
      '{"client_secret": "json-secret" "authToken": "auth-json-secret" "api-key": "api-json-secret" password = "pass-secret"}',
    );

    expect(safeText).not.toMatch(/json-secret|auth-json-secret|api-json-secret|pass-secret/);
  });

  it("redacts header secret keys in nested values and quoted JSON text", () => {
    const keys = [
      "x-api-key",
      "x-auth-token",
      "x-access-token",
      "x-refresh-token",
      "set-cookie",
      "authorization",
      "cookie",
    ];
    const values = Object.fromEntries(keys.map((key) => [key, `${key}-secret`])) as Record<
      string,
      string
    >;
    const nested = agentEventSchema.parse({
      type: "diagnostic.unknown",
      raw: { outer: { values: [values] } },
    });
    const text = redactSafeText(JSON.stringify(values));

    expect(JSON.stringify(nested)).not.toMatch(
      /x-api-key-secret|x-auth-token-secret|x-access-token-secret|x-refresh-token-secret|set-cookie-secret|authorization-secret|cookie-secret/,
    );
    expect(text).not.toMatch(
      /x-api-key-secret|x-auth-token-secret|x-access-token-secret|x-refresh-token-secret|set-cookie-secret|authorization-secret|cookie-secret/,
    );
    expect(nested).toMatchObject({
      raw: {
        outer: {
          values: [Object.fromEntries(keys.map((key) => [key, "[REDACTED]"]))],
        },
      },
    });
  });

  it("keeps ordinary text that only resembles an alias", () => {
    expect(redactSafeText("credentialed apiKeys authTokens privateKeys")).toBe(
      "credentialed apiKeys authTokens privateKeys",
    );
  });

  it("redacts session, model, and command metadata", () => {
    const secretText = "Authorization: Bearer metadata-secret apiKey=metadata-api";
    expect(
      JSON.stringify([
        {
          schema: "session",
          value: hermesSessionSchema.parse({
            id: secretText,
            title: secretText,
            modelId: secretText,
          }),
        },
        {
          schema: "model",
          value: modelInfoSchema.parse({ id: secretText, name: secretText, provider: secretText }),
        },
        {
          schema: "command",
          value: slashCommandSchema.parse({
            name: secretText,
            description: secretText,
            argumentHint: secretText,
          }),
        },
      ]),
    ).not.toMatch(/metadata-secret|metadata-api/);
  });
});
