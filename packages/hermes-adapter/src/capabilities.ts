import type {
  CapabilityObservation,
  CapabilityStatus,
  HermesCapabilities,
} from "@flancommand/event-schema";

export const capabilityStatuses: readonly CapabilityStatus[] = [
  "observed",
  "source-inferred",
  "unsupported",
  "not observed",
  "not tested",
  "blocked",
];

const notTested = (reason: string): CapabilityObservation => ({ status: "not tested", reason });

export function createDefaultCapabilities(): HermesCapabilities {
  const reason = "Transport implementation is not included in Tasks 5, 6, or 6a.";
  return {
    sessions: notTested(reason),
    streaming: notTested(reason),
    commands: notTested(reason),
    models: notTested(reason),
    approvals: notTested(reason),
    clarifications: notTested(reason),
    reconnect: notTested(reason),
    artifacts: notTested(reason),
    memory: notTested(reason),
    usage: notTested(reason),
    context: notTested(reason),
    stop: notTested(reason),
    retry: notTested(reason),
    rename: notTested(reason),
    modelSelection: notTested(reason),
  };
}
