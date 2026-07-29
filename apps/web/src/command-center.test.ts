import { describe, expect, it } from "vitest";

import {
  activityDetail,
  activityLabel,
  activitySummaryLabel,
  formatApiError,
  formatDuration,
  jobActions,
  jobStatusLabel,
  runtimeMonitorLabel,
  sortNewest,
} from "../public/command-center.js";

describe("command center presentation helpers", () => {
  it("keeps the next action when formatting an API error", () => {
    expect(
      formatApiError({
        message: "Hermes WebSocket transport failed.",
        likelyCause: "The gateway is unavailable.",
        nextAction: "Check the gateway status and retry.",
      }),
    ).toBe(
      "Hermes WebSocket transport failed. The gateway is unavailable. Next: Check the gateway status and retry.",
    );
  });

  it("turns tool events into useful activity rows", () => {
    expect(
      activityLabel({
        type: "tool.started",
        toolCall: { name: "shell", id: "tool-1", input: { command: "pwd" } },
      }),
    ).toBe("Using shell");
    expect(activityDetail({ type: "tool.output", toolCallId: "tool-1", chunk: "ready\n" })).toBe(
      "ready",
    );
  });

  it("summarizes completed activity for the response chip", () => {
    expect(
      activitySummaryLabel({ status: "Worked", toolCalls: 2, approvals: 1, durationSeconds: 4 }),
    ).toBe("Worked · 2 tool calls · 1 approval · 4s");
  });

  it("keeps completed timer values and marks them complete", () => {
    expect(formatDuration(35)).toBe("35s");
    expect(formatDuration(95)).toBe("1m 35s");
    expect(runtimeMonitorLabel("⚒", 35)).toBe("⚒ 35s");
    expect(runtimeMonitorLabel("⚒", 35, true)).toBe("⚒ 35s ✓");
    expect(runtimeMonitorLabel("◷", null, false)).toBe("◷ —");
  });

  it("labels job states and orders newest records first", () => {
    expect(jobStatusLabel("waiting_for_approval")).toBe("Waiting for approval");
    expect(
      sortNewest([
        { id: "old", createdAt: "2026-01-01T00:00:00.000Z" },
        { id: "new", createdAt: "2026-01-02T00:00:00.000Z" },
      ]).map((item) => item.id),
    ).toEqual(["new", "old"]);
  });

  it("offers recovery actions only when a job has a saved prompt", () => {
    expect(
      jobActions({ id: "job-1", status: "failed", prompt: "Try again", sessionId: "session-1" }),
    ).toEqual(["retry", "duplicate"]);
    expect(jobActions({ id: "job-2", status: "completed" })).toEqual([]);
  });
});
