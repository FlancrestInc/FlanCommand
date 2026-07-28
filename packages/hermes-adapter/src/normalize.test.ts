import { describe, expect, it } from "vitest";

import { parseNativeFrame } from "./native.js";
import { NativeFrameNormalizer, normalizeNativeFrame } from "./normalize.js";

describe("native Hermes frames", () => {
  it("parses the observed JSON-RPC event envelope", () => {
    expect(
      parseNativeFrame(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "event",
          params: {
            type: "message.delta",
            session_id: "session-1",
            payload: { run_id: "run-1", text: "hello" },
          },
        }),
      ),
    ).toMatchObject({ params: { type: "message.delta", session_id: "session-1" } });
  });

  it("normalizes credential requests without carrying a secret value", () => {
    expect(
      normalizeNativeFrame({
        jsonrpc: "2.0",
        method: "event",
        params: {
          type: "credential.request",
          session_id: "session-1",
          payload: {
            run_id: "run-1",
            credential_id: "ssh-gospel",
            name: "Gospel SSH",
            purpose: "Remote execution",
            value: "do-not-carry-this",
          },
        },
      }),
    ).toEqual([
      {
        type: "credential.requested",
        runId: "run-1",
        sessionId: "session-1",
        credential: { id: "ssh-gospel", name: "Gospel SSH", purpose: "Remote execution" },
      },
    ]);
  });

  it("accepts unknown native fields while keeping known event data", () => {
    expect(
      normalizeNativeFrame({
        jsonrpc: "2.0",
        native_extra: { source: "future-hermes" },
        method: "event",
        params: {
          type: "message.delta",
          session_id: "session-1",
          params_extra: true,
          payload: { run_id: "run-1", text: "hello", payload_extra: "kept only in raw frames" },
        },
      }),
    ).toEqual([
      {
        type: "message.delta",
        runId: "run-1",
        sessionId: "session-1",
        text: "hello",
      },
    ]);
  });

  it("accepts strict JSON-RPC requests and responses", () => {
    expect(parseNativeFrame({ jsonrpc: "2.0", id: 1, method: "hello", params: {} })).toMatchObject({
      id: 1,
      method: "hello",
    });
    expect(
      parseNativeFrame({ jsonrpc: "2.0", id: 2, method: "hello", params: ["one", 2] }),
    ).toMatchObject({
      id: 2,
      method: "hello",
      params: ["one", 2],
    });
    expect(parseNativeFrame({ jsonrpc: "2.0", id: "1", result: { ok: true } })).toMatchObject({
      id: "1",
      result: { ok: true },
    });
  });

  it("normalizes native secret prompts into server-resolvable credential requests", () => {
    expect(
      normalizeNativeFrame({
        jsonrpc: "2.0",
        method: "event",
        params: {
          type: "secret.request",
          session_id: "session-1",
          payload: {
            run_id: "run-1",
            request_id: "secret-request-1",
            env_var: "OPENAI_API_KEY",
            prompt: "API access",
            value: "do-not-carry-this",
          },
        },
      }),
    ).toEqual([
      {
        type: "credential.requested",
        runId: "run-1",
        sessionId: "session-1",
        credential: {
          id: "secret-request-1",
          requestId: "secret-request-1",
          name: "OPENAI_API_KEY",
          envVar: "OPENAI_API_KEY",
          purpose: "API access",
        },
      },
    ]);
  });

  it("requires JSON-RPC errors to have numeric code and string message", () => {
    expect(
      parseNativeFrame({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32000, message: "Request failed", data: ["retryable", true] },
      }),
    ).toMatchObject({
      error: { code: -32000, message: "Request failed", data: ["retryable", true] },
    });
    expect(() => parseNativeFrame({ jsonrpc: "2.0", id: 1, error: "Request failed" })).toThrow(
      /invalid Hermes frame/i,
    );
    expect(() =>
      parseNativeFrame({ jsonrpc: "2.0", id: 1, error: { code: "-32000", message: "failed" } }),
    ).toThrow(/invalid Hermes frame/i);
    expect(() =>
      parseNativeFrame({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: 1 } }),
    ).toThrow(/invalid Hermes frame/i);
  });

  it.each([
    { jsonrpc: "2.0", params: {} },
    { jsonrpc: "2.0", method: "hello", result: {} },
    { jsonrpc: "2.0", id: 1, result: {}, error: {} },
    { jsonrpc: "2.0", id: true, result: {} },
    { jsonrpc: "2.0", method: "event", params: { type: "message.delta", payload: [] } },
    { jsonrpc: "2.0", method: "event", params: { type: "message.delta" }, result: {} },
    { jsonrpc: "2.0", method: "event", params: { type: 1 } },
  ])("rejects invalid JSON-RPC envelope %#", (frame) => {
    expect(() => parseNativeFrame(frame)).toThrow(/invalid Hermes frame/i);
  });

  it("requires event envelopes to have only the strict event shape", () => {
    expect(
      parseNativeFrame({
        jsonrpc: "2.0",
        method: "event",
        params: { type: "message.start", session_id: "session-1" },
      }),
    ).toMatchObject({ params: { type: "message.start", session_id: "session-1" } });
    expect(() =>
      parseNativeFrame({
        jsonrpc: "2.0",
        method: "event",
        params: { type: "message.delta", payload: null },
      }),
    ).toThrow(/invalid Hermes frame/i);
    expect(() =>
      parseNativeFrame({
        jsonrpc: "2.0",
        method: "event",
        params: { type: "message.delta", payload: { run_id: 1 } },
      }),
    ).not.toThrow();
  });

  it("scopes duplicate request and event identities by event context", () => {
    const normalizer = new NativeFrameNormalizer();
    const frame = (session_id: string, type: string, payload: Record<string, unknown>) => ({
      jsonrpc: "2.0",
      method: "event",
      params: { type, session_id, payload },
    });

    expect(
      normalizer.normalize(
        frame("session-1", "message.delta", { run_id: "run-1", request_id: "same", text: "one" }),
      ),
    ).toContainEqual(expect.objectContaining({ type: "message.delta", text: "one" }));
    expect(
      normalizer.normalize(
        frame("session-2", "message.delta", { run_id: "run-2", request_id: "same", text: "two" }),
      ),
    ).toContainEqual(expect.objectContaining({ type: "message.delta", text: "two" }));
    expect(
      normalizer.normalize(
        frame("session-1", "tool.output", {
          run_id: "run-1",
          event_id: "same",
          tool_id: "tool-1",
          chunk: "tool",
        }),
      ),
    ).toContainEqual(expect.objectContaining({ type: "tool.output", chunk: "tool" }));
  });

  it("does not deduplicate identical unsequenced message deltas", () => {
    const normalizer = new NativeFrameNormalizer();
    const frame = {
      jsonrpc: "2.0",
      method: "event",
      params: {
        type: "message.delta",
        session_id: "session-1",
        payload: { run_id: "run-1", text: "same" },
      },
    };

    expect(normalizer.normalize(frame)).toContainEqual(expect.objectContaining({ text: "same" }));
    expect(normalizer.normalize(frame)).toContainEqual(expect.objectContaining({ text: "same" }));
  });

  it("evicts old duplicate identities and clears identities when a run ends", () => {
    const normalizer = new NativeFrameNormalizer();
    const event = (sequence: number, text = String(sequence)) => ({
      jsonrpc: "2.0",
      method: "event",
      params: {
        type: "message.delta",
        session_id: "session-1",
        payload: { run_id: "run-1", sequence, text },
      },
    });

    normalizer.normalize(event(1));
    for (let sequence = 2; sequence <= 2049; sequence += 1) normalizer.normalize(event(sequence));
    expect(normalizer.normalize(event(1, "first again"))).toContainEqual(
      expect.objectContaining({ type: "message.delta", text: "first again" }),
    );

    normalizer.normalize({
      jsonrpc: "2.0",
      method: "event",
      params: {
        type: "message.complete",
        session_id: "session-1",
        payload: { run_id: "run-1" },
      },
    });
    expect(normalizer.normalize(event(2049, "after complete"))).toContainEqual(
      expect.objectContaining({ type: "message.delta", text: "after complete" }),
    );
  });

  it("does not suppress a later inferred run when its sequence restarts", () => {
    const normalizer = new NativeFrameNormalizer();
    const frame = (type: string, payload: Record<string, unknown>) =>
      normalizer.normalize({
        jsonrpc: "2.0",
        method: "event",
        params: { type, session_id: "session-1", payload },
      });

    expect(frame("message.start", {})).toContainEqual(
      expect.objectContaining({ type: "run.started" }),
    );
    expect(frame("message.delta", { sequence: 1, text: "first" })).toContainEqual(
      expect.objectContaining({ type: "message.delta", text: "first" }),
    );
    expect(frame("message.complete", {})).toContainEqual(
      expect.objectContaining({ type: "run.completed" }),
    );

    expect(frame("message.start", {})).toContainEqual(
      expect.objectContaining({ type: "run.started" }),
    );
    expect(frame("message.delta", { sequence: 1, text: "second" })).toContainEqual(
      expect.objectContaining({ type: "message.delta", text: "second" }),
    );
  });

  it("normalizes a correlated message delta and redacts its text", () => {
    expect(
      normalizeNativeFrame({
        jsonrpc: "2.0",
        method: "event",
        params: {
          type: "message.delta",
          session_id: "session-1",
          payload: { run_id: "run-1", text: "Authorization: Bearer secret-value" },
        },
      }),
    ).toEqual([
      {
        type: "message.delta",
        runId: "run-1",
        sessionId: "session-1",
        text: "Authorization=[REDACTED]",
      },
    ]);
  });

  it("uses rendered when a source message delta has no text", () => {
    const normalizer = new NativeFrameNormalizer();
    normalizer.normalize({
      jsonrpc: "2.0",
      method: "event",
      params: { type: "message.start", session_id: "session-1", payload: {} },
    });

    expect(
      normalizer.normalize({
        jsonrpc: "2.0",
        method: "event",
        params: {
          type: "message.delta",
          session_id: "session-1",
          payload: { rendered: "rendered reply" },
        },
      }),
    ).toEqual([
      expect.objectContaining({
        type: "message.delta",
        text: "rendered reply",
        runId: "run-session-1",
      }),
    ]);
  });

  it("correlates source-shaped events without payload run_id and closes the run", () => {
    const normalizer = new NativeFrameNormalizer();
    const events = [
      ["message.start", {}],
      ["message.delta", { text: "hello" }],
      ["tool.output", { tool_id: "tool-1", chunk: "out" }],
      ["message.complete", { message_id: "message-1" }],
    ].flatMap(([type, payload]) =>
      normalizer.normalize({
        jsonrpc: "2.0",
        method: "event",
        params: { type, session_id: "session-1", payload },
      }),
    );
    const runId = (events[0] as { runId: string }).runId;

    expect(events).toEqual([
      expect.objectContaining({ type: "run.started", sessionId: "session-1" }),
      expect.objectContaining({ type: "message.delta", runId }),
      expect.objectContaining({ type: "tool.output", runId }),
      expect.objectContaining({ type: "message.completed", runId }),
      expect.objectContaining({ type: "run.completed", runId }),
    ]);
  });

  it("fails closed when a streamed frame has no run correlation", () => {
    expect(
      normalizeNativeFrame({
        jsonrpc: "2.0",
        method: "event",
        params: { type: "message.delta", session_id: "session-1", payload: { text: "hello" } },
      }),
    ).toEqual([expect.objectContaining({ type: "diagnostic.unknown", sessionId: "session-1" })]);
  });

  it("normalizes observed tool and approval payloads", () => {
    const frames = [
      {
        jsonrpc: "2.0",
        method: "event",
        params: {
          type: "tool.start",
          session_id: "session-1",
          payload: {
            run_id: "run-1",
            tool_id: "tool-1",
            name: "shell",
            args: { command: "echo hi" },
          },
        },
      },
      {
        jsonrpc: "2.0",
        method: "event",
        params: {
          type: "approval.request",
          session_id: "session-1",
          payload: { run_id: "run-1", approval_id: "approval-1", command: "echo hi" },
        },
      },
    ].flatMap(normalizeNativeFrame);

    expect(frames).toEqual([
      expect.objectContaining({ type: "tool.started", runId: "run-1" }),
      expect.objectContaining({ type: "approval.requested", runId: "run-1" }),
    ]);
  });

  it("preserves safe tool args_text as the tool input", () => {
    expect(
      normalizeNativeFrame({
        jsonrpc: "2.0",
        method: "event",
        params: {
          type: "tool.start",
          session_id: "session-1",
          payload: {
            run_id: "run-1",
            tool_id: "tool-1",
            name: "shell",
            args_text: '{"command":"echo hi","token":"secret"}',
          },
        },
      }),
    ).toEqual([
      {
        type: "tool.started",
        runId: "run-1",
        sessionId: "session-1",
        toolCall: {
          id: "tool-1",
          name: "shell",
          input: { command: "echo hi", token: "[REDACTED]" },
        },
      },
    ]);
  });

  it("preserves completion usage in the run summary", () => {
    const events = normalizeNativeFrame({
      jsonrpc: "2.0",
      method: "event",
      params: {
        type: "message.complete",
        session_id: "session-1",
        payload: {
          run_id: "run-1",
          message_id: "message-1",
          usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 },
        },
      },
    });

    expect(events).toContainEqual({
      type: "run.completed",
      runId: "run-1",
      sessionId: "session-1",
      summary: { usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 } },
    });
  });

  it("maps Hermes usage names to the normalized usage shape", () => {
    const events = normalizeNativeFrame({
      jsonrpc: "2.0",
      method: "event",
      params: {
        type: "message.complete",
        session_id: "session-1",
        payload: {
          run_id: "run-usage",
          usage: { input: 12, output: 8, total: 20, reasoning: 3, cached: 2 },
        },
      },
    });

    expect(events).toContainEqual({
      type: "run.completed",
      runId: "run-usage",
      sessionId: "session-1",
      summary: {
        usage: {
          inputTokens: 12,
          outputTokens: 8,
          totalTokens: 20,
          reasoningTokens: 3,
          cachedInputTokens: 2,
        },
      },
    });
  });

  it("maps Hermes usage names on context updates", () => {
    expect(
      normalizeNativeFrame({
        jsonrpc: "2.0",
        method: "event",
        params: {
          type: "context.update",
          session_id: "session-1",
          payload: { usage: { input: 4, cached: 1 } },
        },
      }),
    ).toEqual([
      {
        type: "context.updated",
        sessionId: "session-1",
        usage: { inputTokens: 4, cachedInputTokens: 1 },
      },
    ]);
  });

  it("preserves TUI context-used and context-max usage fields", () => {
    expect(
      normalizeNativeFrame({
        jsonrpc: "2.0",
        method: "event",
        params: {
          type: "context.update",
          session_id: "session-1",
          payload: { usage: { context_used: 1234, context_max: 8192 } },
        },
      }),
    ).toEqual([
      {
        type: "context.updated",
        sessionId: "session-1",
        usage: { totalTokens: 1234, contextWindow: 8192 },
      },
    ]);
  });

  it("fails an errored message without claiming a successful run", () => {
    const events = normalizeNativeFrame({
      jsonrpc: "2.0",
      method: "event",
      params: {
        type: "message.complete",
        session_id: "session-1",
        payload: {
          run_id: "run-error",
          status: "error",
          error: {
            code: "UPSTREAM_FAILED",
            message: "secret=do-not-leak",
            data: { retryable: true },
          },
        },
      },
    });

    expect(events).not.toContainEqual(expect.objectContaining({ type: "message.completed" }));
    expect(events).toContainEqual({
      type: "run.failed",
      runId: "run-error",
      sessionId: "session-1",
      error: { code: "UPSTREAM_FAILED", message: "secret=[REDACTED]" },
    });
    expect(events).not.toContainEqual(expect.objectContaining({ type: "run.completed" }));
    expect(JSON.stringify(events)).not.toContain("do-not-leak");
  });

  it("keeps message completion on an errored message only when it has a message id", () => {
    const events = normalizeNativeFrame({
      jsonrpc: "2.0",
      method: "event",
      params: {
        type: "message.complete",
        session_id: "session-1",
        payload: {
          run_id: "run-error-message",
          status: "error",
          message_id: "message-error",
          error_code: "UPSTREAM_FAILED",
          error_message: "failed",
        },
      },
    });

    expect(events).toContainEqual({
      type: "message.completed",
      runId: "run-error-message",
      sessionId: "session-1",
      messageId: "message-error",
    });
    expect(events).toContainEqual(
      expect.objectContaining({ type: "run.failed", runId: "run-error-message" }),
    );
  });

  it("normalizes clarify.request into a clarification request", () => {
    expect(
      normalizeNativeFrame({
        jsonrpc: "2.0",
        method: "event",
        params: {
          type: "clarify.request",
          session_id: "session-1",
          payload: { run_id: "run-1", prompt: "Which file should I edit?" },
        },
      }),
    ).toEqual([
      {
        type: "clarification.requested",
        runId: "run-1",
        sessionId: "session-1",
        question: "Which file should I edit?",
      },
    ]);
  });

  it("derives stable safe approval IDs and maps command details", () => {
    const frame = {
      jsonrpc: "2.0" as const,
      method: "event" as const,
      params: {
        type: "approval.request",
        session_id: "session-1",
        payload: {
          run_id: "run-1",
          request_id: "request-1",
          command: "echo hi",
          description: "Run the command",
        },
      },
    };

    const first = normalizeNativeFrame(frame)[0];
    const second = normalizeNativeFrame(frame)[0];
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      type: "approval.requested",
      approval: {
        action: "echo hi",
        description: "Run the command",
      },
    });
    expect(first).toMatchObject({ approval: { id: expect.stringMatching(/^approval-/) } });
  });

  it("uses result, result_text, or an empty result for tool completion", () => {
    const normalizer = new NativeFrameNormalizer();
    const frame = (payload: Record<string, unknown>) =>
      normalizer.normalize({
        jsonrpc: "2.0",
        method: "event",
        params: { type: "tool.complete", session_id: "session-1", payload },
      })[0];

    expect(
      frame({ run_id: "run-1", tool_id: "tool-1", result: { ok: true }, result_text: "old" }),
    ).toMatchObject({
      type: "tool.completed",
      result: { ok: true },
    });
    expect(frame({ run_id: "run-1", tool_id: "tool-2", result_text: "done" })).toMatchObject({
      type: "tool.completed",
      result: "done",
    });
    expect(frame({ run_id: "run-1", tool_id: "tool-3" })).toMatchObject({
      type: "tool.completed",
      result: {},
    });
  });

  it("normalizes status.update with stage and optional detail", () => {
    expect(
      normalizeNativeFrame({
        jsonrpc: "2.0",
        method: "event",
        params: {
          type: "status.update",
          session_id: "session-1",
          payload: { run_id: "run-1", stage: "working", detail: "Using the shell" },
        },
      }),
    ).toEqual([
      {
        type: "run.status",
        runId: "run-1",
        sessionId: "session-1",
        stage: "working",
        detail: "Using the shell",
      },
    ]);
  });

  it("turns unknown and malformed frames into safe diagnostics", () => {
    expect(
      normalizeNativeFrame({
        jsonrpc: "2.0",
        method: "event",
        params: { type: "future.event", payload: { token: "secret" } },
      })[0],
    ).toMatchObject({
      type: "diagnostic.unknown",
    });
    expect(() => parseNativeFrame("not json")).toThrow(/invalid Hermes frame/i);
  });

  it("reports a duplicate frame once without replaying its user event", () => {
    const normalizer = new NativeFrameNormalizer();
    const frame = {
      jsonrpc: "2.0",
      method: "event",
      params: {
        type: "message.delta",
        session_id: "session-1",
        payload: { run_id: "run-1", seq: 1, text: "hello" },
      },
    };

    expect(normalizer.normalize(frame)).toHaveLength(1);
    const duplicate = normalizer.normalize(frame);
    expect(duplicate[0]).toMatchObject({ type: "diagnostic.unknown", raw: { duplicate: true } });
    expect(duplicate.some((event) => event.type === "message.delta")).toBe(false);
    expect(JSON.stringify(duplicate)).not.toContain("hello");
  });

  it("preserves identical message deltas without explicit stable identity", () => {
    const normalizer = new NativeFrameNormalizer();
    const frame = {
      jsonrpc: "2.0",
      method: "event",
      params: {
        type: "message.delta",
        session_id: "session-1",
        payload: { text: "hello" },
      },
    };

    normalizer.normalize({
      jsonrpc: "2.0",
      method: "event",
      params: { type: "message.start", session_id: "session-1", payload: {} },
    });

    expect(normalizer.normalize(frame)).toContainEqual(
      expect.objectContaining({ type: "message.delta", text: "hello" }),
    );
    expect(normalizer.normalize(frame)).toContainEqual(
      expect.objectContaining({ type: "message.delta", text: "hello" }),
    );
  });

  it("maps local Hermes interim, reasoning, thinking, risk, and notification events safely", () => {
    const normalizer = new NativeFrameNormalizer();
    const frame = (type: string, payload: Record<string, unknown>) =>
      normalizer.normalize({
        jsonrpc: "2.0",
        method: "event",
        params: { type, session_id: "session-1", payload },
      });

    expect(frame("message.start", { run_id: "run-1" })[0]).toMatchObject({
      type: "run.started",
      runId: "run-1",
    });
    expect(frame("message.interim", { text: "Authorization: Bearer secret" })[0]).toEqual({
      type: "message.delta",
      runId: "run-1",
      sessionId: "session-1",
      text: "Authorization=[REDACTED]",
    });
    expect(frame("reasoning.delta", { text: "private reasoning" })[0]).toMatchObject({
      type: "run.status",
      runId: "run-1",
      stage: "reasoning",
      detail: "private reasoning",
    });
    expect(frame("thinking.delta", { text: "thinking" })[0]).toMatchObject({
      type: "run.status",
      runId: "run-1",
      stage: "thinking",
      detail: "thinking",
    });
    expect(frame("tool.output_risk", { tool_id: "tool-1", text: "token=secret" })[0]).toEqual({
      type: "tool.output",
      runId: "run-1",
      sessionId: "session-1",
      toolCallId: "tool-1",
      chunk: "token=[REDACTED]",
    });
    expect(frame("notification.show", { title: "token=secret" })[0]).toMatchObject({
      type: "diagnostic.unknown",
      sessionId: "session-1",
    });
    expect(JSON.stringify(frame("notification.show", { title: "token=secret" }))).not.toContain(
      "token=secret",
    );
  });

  it("updates a session run from any payload run_id and clears it on completion or interrupt", () => {
    const normalizer = new NativeFrameNormalizer();
    const native = (type: string, payload: Record<string, unknown>) =>
      normalizer.normalize({
        jsonrpc: "2.0",
        method: "event",
        params: { type, session_id: "session-1", payload },
      });

    native("message.start", { run_id: "run-old" });
    expect(native("run.status", { run_id: "run-new", status: "working" })[0]).toMatchObject({
      runId: "run-new",
    });
    expect(native("message.delta", { text: "uses new run" })[0]).toMatchObject({
      runId: "run-new",
    });
    native("message.complete", {});
    expect(native("message.delta", { text: "must not use old run" })[0]).toMatchObject({
      type: "diagnostic.unknown",
    });

    native("message.start", { run_id: "run-interrupt" });
    native("turn.interrupt", {});
    expect(native("message.delta", { text: "must not use interrupted run" })[0]).toMatchObject({
      type: "diagnostic.unknown",
    });
  });
});
