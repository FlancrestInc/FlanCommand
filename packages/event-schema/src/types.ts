export type CapabilityStatus =
  "observed" | "source-inferred" | "unsupported" | "not observed" | "not tested" | "blocked";

export interface SafeError {
  code: string;
  message: string;
  component?: string;
  operation?: string;
  likelyCause?: string;
  nextAction?: string;
  retryable?: boolean;
}

export interface CapabilityObservation {
  status: CapabilityStatus;
  evidence?: string;
  reason?: string;
  recovery?: string;
}

export interface HermesCapabilities {
  sessions: CapabilityObservation;
  streaming: CapabilityObservation;
  commands: CapabilityObservation;
  models: CapabilityObservation;
  approvals: CapabilityObservation;
  clarifications: CapabilityObservation;
  reconnect: CapabilityObservation;
  artifacts: CapabilityObservation;
  memory: CapabilityObservation;
  usage: CapabilityObservation;
  context: CapabilityObservation;
  stop: CapabilityObservation;
  retry: CapabilityObservation;
  rename: CapabilityObservation;
  modelSelection: CapabilityObservation;
}

export interface HermesSession {
  id: string;
  title?: string;
  modelId?: string;
  createdAt?: string;
  updatedAt?: string;
  source?: "hermes" | "telegram" | "unknown";
  status?: "idle" | "running" | "paused" | "failed" | "unknown";
  history?: Array<{ role: "user" | "assistant" | "system"; text: string }>;
}

export interface ModelInfo {
  id: string;
  name?: string;
  provider?: string;
  reasoning?: boolean;
  contextWindow?: number;
}

export interface SlashCommand {
  name: string;
  description?: string;
  argumentHint?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input?: unknown;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
}

export interface ContextUsage extends Usage {
  contextWindow?: number;
}

export interface ApprovalRequest {
  id: string;
  action: string;
  description?: string;
  risk?: "low" | "medium" | "high" | "unknown";
}

export interface CredentialRequest {
  id: string;
  requestId?: string;
  name: string;
  envVar?: string;
  purpose?: string;
  provider?: string;
}

export interface ArtifactReference {
  id: string;
  name: string;
  kind?: "file" | "image" | "document" | "link" | "unknown";
  mimeType?: string;
  uri?: string;
  sizeBytes?: number;
}

export interface MemoryReference {
  id?: string;
  label: string;
  source?: string;
}

export interface RunSummary {
  text?: string;
  usage?: Usage;
}

export type AgentEvent =
  | { type: "run.started"; runId: string; sessionId: string; at: string }
  | { type: "run.status"; runId: string; sessionId?: string; stage: string; detail?: string }
  | { type: "message.delta"; runId: string; sessionId?: string; text: string }
  | { type: "message.completed"; runId: string; sessionId?: string; messageId: string }
  | { type: "tool.started"; runId: string; sessionId?: string; toolCall: ToolCall }
  | { type: "tool.output"; runId: string; sessionId?: string; toolCallId: string; chunk: string }
  | {
      type: "tool.completed";
      runId: string;
      sessionId?: string;
      toolCallId: string;
      result: unknown;
    }
  | { type: "tool.failed"; runId: string; sessionId?: string; toolCallId: string; error: SafeError }
  | { type: "approval.requested"; runId: string; sessionId?: string; approval: ApprovalRequest }
  | {
      type: "credential.requested";
      runId: string;
      sessionId?: string;
      credential: CredentialRequest;
    }
  | { type: "clarification.requested"; runId: string; sessionId?: string; question: string }
  | { type: "memory.used"; runId: string; sessionId?: string; memory: MemoryReference }
  | { type: "artifact.created"; runId: string; sessionId?: string; artifact: ArtifactReference }
  | { type: "context.updated"; sessionId: string; usage: ContextUsage }
  | { type: "run.completed"; runId: string; sessionId?: string; summary?: RunSummary }
  | { type: "run.failed"; runId: string; sessionId?: string; error: SafeError }
  | { type: "run.stopped"; runId: string; sessionId?: string }
  | { type: "reconnect.gap"; sessionId?: string; runId?: string; reason: string }
  | { type: "diagnostic.unknown"; sessionId?: string; raw: Record<string, unknown> };
