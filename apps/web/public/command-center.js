const labels = {
  "run.started": "Hermes started a run",
  "run.status": "Working",
  "message.completed": "Response ready",
  "tool.started": "Using a tool",
  "tool.output": "Tool output",
  "tool.completed": "Tool completed",
  "tool.failed": "Tool failed",
  "approval.requested": "Waiting for approval",
  "credential.requested": "Waiting for a credential",
  "clarification.requested": "Waiting for clarification",
  "memory.used": "Memory used",
  "artifact.created": "Artifact created",
  "context.updated": "Context updated",
  "run.completed": "Run completed",
  "run.failed": "Run failed",
  "run.stopped": "Run stopped",
  "reconnect.gap": "Reconnected with a visible gap",
};

export function activityLabel(event) {
  if (event?.type === "run.status") return event.detail || event.stage || labels[event.type];
  if (event?.type === "tool.started") return `Using ${event.toolCall?.name || "a tool"}`;
  if (event?.type === "tool.failed")
    return `Tool failed: ${event.error?.message || "unknown error"}`;
  if (event?.type === "run.failed") return `Run failed: ${event.error?.message || "unknown error"}`;
  return labels[event?.type] || null;
}

export function activityDetail(event) {
  if (!event) return "";
  if (event.type === "tool.output") return String(event.chunk || "").trim();
  if (event.type === "tool.started") {
    const input = event.toolCall?.input;
    return input === undefined ? "" : safeJson(input);
  }
  if (event.type === "tool.completed") return safeJson(event.result);
  if (event.type === "approval.requested")
    return event.approval?.description || "Approval required";
  if (event.type === "credential.requested")
    return event.credential?.purpose || "Credential required";
  if (event.type === "clarification.requested") return event.question || "Clarification required";
  if (event.type === "artifact.created") return event.artifact?.name || "Artifact available";
  if (event.type === "reconnect.gap") return event.reason || "Some events were missed.";
  return event.detail || "";
}

export function activitySummaryLabel(summary) {
  if (!summary) return "Activity";
  const tools = `${summary.toolCalls || 0} tool call${summary.toolCalls === 1 ? "" : "s"}`;
  const approvals = `${summary.approvals || 0} approval${summary.approvals === 1 ? "" : "s"}`;
  return `${summary.status || "Completed"} · ${tools} · ${approvals} · ${summary.durationSeconds || 0}s`;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

export function runtimeMonitorLabel(icon, seconds, completed = false) {
  return `${icon} ${formatDuration(seconds)}${completed ? " ✓" : ""}`;
}

export function formatMessageTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

export function formatApiError(error) {
  const message = typeof error?.message === "string" ? error.message : "Request failed";
  const cause = typeof error?.likelyCause === "string" ? error.likelyCause : "";
  const nextAction = typeof error?.nextAction === "string" ? error.nextAction : "";
  return [message, cause, nextAction ? `Next: ${nextAction}` : ""]
    .filter((part, index, parts) => part && parts.indexOf(part) === index)
    .join(" ");
}

function safeJson(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const jobLabels = {
  queued: "Queued",
  running: "Running",
  waiting_for_approval: "Waiting for approval",
  waiting_for_credential: "Waiting for a credential",
  paused: "Paused",
  completed: "Completed",
  failed: "Failed",
  canceled: "Canceled",
};

export function jobStatusLabel(status) {
  return jobLabels[status] || "Unknown";
}

export function jobActions(job) {
  if (!job?.prompt || !job.sessionId) return [];
  const actions = [];
  if (["failed", "paused", "canceled"].includes(job.status)) actions.push("retry");
  if (job.status !== "running" && job.status !== "queued") actions.push("duplicate");
  return actions;
}

export function sortNewest(items) {
  return [...items].sort(
    (a, b) =>
      Date.parse(b.createdAt || b.updatedAt || "") - Date.parse(a.createdAt || a.updatedAt || ""),
  );
}
