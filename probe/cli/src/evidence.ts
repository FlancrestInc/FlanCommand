export const RESEARCH_QUESTIONS = [
  "gateway handshake and readiness",
  "source and runtime methods",
  "session list and identity",
  "session create and cleanup",
  "streaming response events",
  "tool event shape",
  "stop behavior",
  "reconnect and replay",
  "commands and slash commands",
  "models and model selection",
  "approvals and clarifications",
  "usage, context, memory, and artifacts",
  "Telegram mapping and shared-thread behavior",
] as const;

export interface EvidenceRecord {
  question: string;
  status: "observed" | "not tested" | "blocked" | "unknown";
  evidence?: string;
  reason?: string;
}

export function makeEvidence(mode: "mock" | "live", ranMutation: boolean): EvidenceRecord[] {
  return RESEARCH_QUESTIONS.map((question, index) => ({
    question,
    status:
      mode === "mock" && index < 8
        ? "observed"
        : mode === "live" && index < 3
          ? "observed"
          : "not tested",
    ...(mode === "mock" && index < 8 ? { evidence: "sanitized mock fixture" } : {}),
    ...(mode === "live" && index < 3 ? { evidence: "live adapter discovery" } : {}),
    ...(index === 3 && !ranMutation
      ? { reason: "test mutations were not explicitly enabled" }
      : {}),
  }));
}
