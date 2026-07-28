import {
  agentEventSchema,
  redactSafeText,
  redactSafeValue,
  type AgentEvent,
} from "@flancommand/event-schema";
import {
  isNativeHermesFrame,
  isRecord,
  parseNativeFrame,
  type NativeHermesFrame,
} from "./native.js";

const STREAM_TAIL_LIMIT = 128;
const MAX_STREAM_STATES = 1024;
const pemBeginPattern = /-----BEGIN [^-]+-----/u;
const pemEndPattern = /-----END [^-]+-----/u;
const privateKeyMarker = "[REDACTED PRIVATE KEY]";
const sensitiveMarkerPattern =
  /(?:(?:proxy-)?authorization\s*:\s*(?:bearer\s*)?|cookie\s*:\s*|["']?(?:[a-z0-9]*(?:secret|token|password|credential|authorization|auth|cookie)|[a-z0-9]*(?:api[-_]?key|private[-_]?key))(?:[-_][a-z0-9]+)*["']?\s*[:=]\s*)/iu;

interface StreamState {
  kind: "message" | "tool";
  runId: string;
  sessionId?: string;
  toolCallId?: string;
  tail: string;
  pem: boolean;
  sensitive: boolean;
  sensitiveQuote?: '"' | "'";
  sensitiveMarker?: string;
}

function streamKey(runId: string, kind: StreamState["kind"], toolCallId?: string): string {
  return `${runId}:${kind}:${toolCallId ?? ""}`;
}

class StreamRedactor {
  private readonly states = new Map<string, StreamState>();
  private readonly evicted = new Set<string>();
  private readonly native = new NativeFrameNormalizer();

  constructor(private readonly activeSecrets: ReadonlySet<string> = new Set()) {}

  processMessage(frame: Record<string, unknown>): Array<Record<string, unknown>> {
    return this.processText(frame, "message");
  }

  processTool(frame: Record<string, unknown>): Array<Record<string, unknown>> {
    return this.processText(frame, "tool");
  }

  flushRun(runId: string): Array<Record<string, unknown>> {
    const flushed: Array<Record<string, unknown>> = [];
    for (const [key, state] of this.states) {
      if (state.runId !== runId) continue;
      const text = state.pem
        ? privateKeyMarker
        : state.sensitive
          ? (state.sensitiveMarker ?? "")
          : redactSafeText(state.tail);
      if (text) {
        flushed.push(
          state.kind === "message"
            ? {
                type: "message.delta",
                runId,
                ...(state.sessionId && { sessionId: state.sessionId }),
                text,
              }
            : {
                type: "tool.output",
                runId,
                ...(state.sessionId && { sessionId: state.sessionId }),
                toolCallId: state.toolCallId,
                chunk: text,
              },
        );
      }
      this.states.delete(key);
    }
    for (const key of this.evicted) {
      if (key.startsWith(`${runId}:`)) this.evicted.delete(key);
    }
    return flushed;
  }

  flushAll(): Array<Record<string, unknown>> {
    const runIds = [...new Set([...this.states.values()].map((state) => state.runId))];
    return runIds.flatMap((runId) => this.flushRun(runId));
  }

  clearAll(): void {
    this.states.clear();
    this.evicted.clear();
  }

  normalizeNative(frame: unknown): AgentEvent[] {
    return this.redactEvents(this.native.normalize(frame));
  }

  redactEvents(events: AgentEvent[]): AgentEvent[] {
    return events.map((event) => this.redactValue(event) as AgentEvent);
  }

  private redactValue(value: unknown): unknown {
    if (typeof value === "string") return this.redactActiveSecrets(value);
    if (Array.isArray(value)) return value.map((item) => this.redactValue(item));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, this.redactValue(item)]),
      );
    return value;
  }

  private redactActiveSecrets(value: string): string {
    let safe = value;
    for (const secret of this.activeSecrets) {
      if (secret) safe = safe.split(secret).join("[REDACTED]");
    }
    return safe;
  }

  private processText(
    frame: Record<string, unknown>,
    kind: StreamState["kind"],
  ): Array<Record<string, unknown>> {
    const runId = typeof frame.runId === "string" ? frame.runId : undefined;
    const textKey = kind === "message" ? "text" : "chunk";
    const text = frame[textKey];
    if (!runId || typeof text !== "string") return [frame];

    const toolCallId = typeof frame.toolCallId === "string" ? frame.toolCallId : undefined;
    const key = streamKey(runId, kind, toolCallId);
    if (this.evicted.has(key)) return [];
    const previous = this.states.get(key);
    let combined = this.redactActiveSecrets(`${previous?.tail ?? ""}${text}`);
    let output = "";
    let pem = previous?.pem ?? false;
    let sensitive = previous?.sensitive ?? false;
    let sensitiveQuote = previous?.sensitiveQuote;
    let sensitiveMarker = previous?.sensitiveMarker ?? "";

    if (pem) {
      const end = pemEndPattern.exec(combined);
      if (!end || end.index === undefined) {
        this.saveState(key, frame, kind, combined, true);
        return [];
      }
      output = privateKeyMarker;
      combined = combined.slice(end.index + end[0].length);
      pem = false;
    }

    if (sensitive) {
      const delimiter = findSensitiveDelimiter(combined, sensitiveQuote);
      if (delimiter === undefined) {
        this.saveState(key, frame, kind, "", false, true, sensitiveQuote, sensitiveMarker);
        return [];
      }
      output += sensitiveMarker + redactSafeText(combined.slice(delimiter));
      combined = "";
      sensitive = false;
      sensitiveQuote = undefined;
      sensitiveMarker = "";
    }

    const begin = pemBeginPattern.exec(combined);
    if (begin && begin.index !== undefined) {
      const afterBegin = combined.slice(begin.index + begin[0].length);
      const end = pemEndPattern.exec(afterBegin);
      if (!end || end.index === undefined) {
        const prefix = redactSafeText(combined.slice(0, begin.index));
        this.saveState(key, frame, kind, afterBegin, true);
        return prefix ? [{ ...frame, [textKey]: prefix }] : [];
      }
    }

    const marker = sensitiveMarkerPattern.exec(combined);
    if (marker && marker.index !== undefined) {
      const markerEnd = marker.index + marker[0].length;
      const afterMarker = combined.slice(markerEnd);
      const quote = afterMarker.startsWith('"')
        ? '"'
        : afterMarker.startsWith("'")
          ? "'"
          : undefined;
      const quoteOffset = quote ? 1 : 0;
      const delimiter = findSensitiveDelimiter(afterMarker.slice(quoteOffset), quote);
      output += redactSafeText(combined.slice(0, marker.index));
      const markerText = redactSafeText(`${combined.slice(marker.index, markerEnd)}x`);
      if (delimiter === undefined) {
        this.saveState(key, frame, kind, "", false, true, quote, markerText);
        return output ? [{ ...frame, [textKey]: output }] : [];
      }
      output += markerText;
      combined = quote
        ? afterMarker.slice(quoteOffset + delimiter + 1)
        : afterMarker.slice(delimiter);
      output += redactSafeText(combined);
      combined = "";
    }

    const redacted = redactSafeText(combined);
    const redactedTail = redacted.slice(-STREAM_TAIL_LIMIT);
    const safeText = output + redacted.slice(0, Math.max(0, redacted.length - redactedTail.length));

    if (redactedTail) {
      this.saveState(key, frame, kind, redactedTail, pem, sensitive, sensitiveQuote);
    } else {
      this.states.delete(key);
    }

    if (!safeText) return [];
    return [{ ...frame, [textKey]: safeText }];
  }

  private saveState(
    key: string,
    frame: Record<string, unknown>,
    kind: StreamState["kind"],
    value: string,
    pem: boolean,
    sensitive = false,
    sensitiveQuote?: '"' | "'",
    sensitiveMarker = "",
  ): void {
    if (!this.states.has(key) && this.states.size >= MAX_STREAM_STATES) {
      const evictableKey = [...this.states].find(
        ([, state]) => !state.sensitive && !state.pem,
      )?.[0];
      if (evictableKey !== undefined) {
        this.states.delete(evictableKey);
        this.recordEvicted(evictableKey);
      } else {
        this.recordEvicted(key);
        return;
      }
    }
    this.states.set(key, {
      kind,
      runId: typeof frame.runId === "string" ? frame.runId : "",
      sessionId: typeof frame.sessionId === "string" ? frame.sessionId : undefined,
      toolCallId: typeof frame.toolCallId === "string" ? frame.toolCallId : undefined,
      tail: value.slice(-STREAM_TAIL_LIMIT),
      pem,
      sensitive,
      sensitiveQuote,
      sensitiveMarker,
    });
  }

  private recordEvicted(key: string): void {
    if (this.evicted.has(key)) return;
    if (this.evicted.size >= MAX_STREAM_STATES) {
      const oldestKey = this.evicted.values().next().value;
      if (oldestKey !== undefined) this.evicted.delete(oldestKey);
    }
    this.evicted.add(key);
  }
}

function findSensitiveDelimiter(value: string, quote?: '"' | "'"): number | undefined {
  if (quote) {
    const index = value.indexOf(quote);
    return index >= 0 ? index : undefined;
  }
  const match = /[\s,;)}\]]/u.exec(value);
  return match?.index;
}

export function normalizeStreamFrame(
  frame: unknown,
  redactor = new StreamRedactor(),
): AgentEvent[] {
  if (typeof frame === "string" || isNativeHermesFrame(frame))
    return redactor.normalizeNative(frame);
  const raw =
    typeof frame === "object" && frame !== null && !Array.isArray(frame)
      ? (frame as Record<string, unknown>)
      : { value: frame };

  let frames: Array<Record<string, unknown>>;
  if (raw.type === "message.delta") frames = redactor.processMessage(raw);
  else if (raw.type === "tool.output") frames = redactor.processTool(raw);
  else if (
    raw.type === "run.completed" ||
    raw.type === "run.failed" ||
    raw.type === "run.stopped"
  ) {
    const runId = typeof raw.runId === "string" ? raw.runId : undefined;
    frames = runId ? [...redactor.flushRun(runId), raw] : [raw];
  } else frames = [raw];

  return redactor.redactEvents(normalizeFrames(frames));
}

export function normalizeFlushedFrame(frame: Record<string, unknown>): AgentEvent[] {
  return normalizeFrames([frame]);
}

export function normalizeNativeFrame(frame: unknown): AgentEvent[] {
  return new NativeFrameNormalizer().normalize(frame);
}

export class NativeFrameNormalizer {
  private readonly seen = new Map<string, DedupeEntry>();
  private readonly activeRuns = new Map<string, ActiveRun>();
  private readonly inferredGenerations = new Map<string, number>();
  normalize(input: unknown): AgentEvent[] {
    let frame: NativeHermesFrame;
    try {
      frame = parseNativeFrame(input);
    } catch {
      return [diagnostic({ value: typeof input === "string" ? input : redactSafeValue(input) })];
    }

    const params = isRecord(frame.params) ? frame.params : undefined;
    const event = typeof params?.type === "string" ? params.type : undefined;
    if (!event) return [diagnostic(frame)];
    const payload = isRecord(params?.payload) ? params.payload : {};
    const sessionId =
      stringValue(params, "session_id", "sessionId") ??
      stringValue(payload, "session_id", "sessionId");
    const suppliedRunId = stringValue(payload, "run_id", "runId");
    const currentGeneration =
      suppliedRunId === undefined && sessionId
        ? (this.inferredGenerations.get(sessionId) ?? 0)
        : undefined;
    const nextGeneration =
      event === "message.start" || event === "turn.start"
        ? (currentGeneration ?? 0) + 1
        : currentGeneration;
    const duplicateKeys = [
      frameKey(frame, event, sessionId, suppliedRunId, nextGeneration, payload),
      ...(nextGeneration !== currentGeneration
        ? [frameKey(frame, event, sessionId, suppliedRunId, currentGeneration, payload)]
        : []),
    ].filter((key): key is string => key !== undefined);
    if (duplicateKeys.some((key) => this.seen.has(key)))
      return [diagnostic({ duplicate: true, event, sessionId })];
    for (const duplicateKey of duplicateKeys.slice(0, 1))
      this.remember(duplicateKey, frame, event, sessionId, suppliedRunId, nextGeneration);

    let runId = suppliedRunId ?? (sessionId ? this.activeRuns.get(sessionId)?.runId : undefined);
    if (sessionId && suppliedRunId) this.trackRun(sessionId, suppliedRunId);
    if (sessionId && suppliedRunId === undefined && nextGeneration !== currentGeneration) {
      this.inferredGenerations.set(sessionId, nextGeneration ?? 0);
      runId = `run-${sessionId}`;
    }
    switch (event) {
      case "message.start":
      case "turn.start":
        if (!sessionId) return [diagnostic(frame, sessionId)];
        runId = suppliedRunId ?? `run-${sessionId}`;
        this.trackRun(sessionId, runId, suppliedRunId === undefined ? nextGeneration : undefined);
        return [eventFrame({ type: "run.started", runId, sessionId, at: dateValue(payload) })];
      case "message.delta":
        return runId && typeof messageText(payload) === "string"
          ? [
              eventFrame({
                type: "message.delta",
                runId,
                ...(sessionId ? { sessionId } : {}),
                text: messageText(payload),
              }),
            ]
          : [diagnostic(frame, sessionId)];
      case "message.interim":
        return runId && typeof payload.text === "string"
          ? [
              eventFrame({
                type: "message.delta",
                runId,
                ...(sessionId ? { sessionId } : {}),
                text: payload.text,
              }),
            ]
          : [diagnostic(frame, sessionId)];
      case "tool.output":
        return runId &&
          stringValue(payload, "tool_id", "toolId") &&
          typeof payload.chunk === "string"
          ? [
              eventFrame({
                type: "tool.output",
                runId,
                ...(sessionId ? { sessionId } : {}),
                toolCallId: stringValue(payload, "tool_id", "toolId"),
                chunk: payload.chunk,
              }),
            ]
          : [diagnostic(frame, sessionId)];
      case "message.complete":
        if (!runId) return [diagnostic(frame, sessionId)];
        this.closeRun(
          sessionId,
          runId,
          suppliedRunId === undefined ? currentGeneration : undefined,
        );
        if (payload.status === "error" || payload.status === "failed") {
          const messageId = stringValue(payload, "message_id", "messageId");
          return [
            ...(messageId
              ? [
                  eventFrame({
                    type: "message.completed",
                    runId,
                    ...(sessionId ? { sessionId } : {}),
                    messageId,
                  }),
                ]
              : []),
            eventFrame({
              type: "run.failed",
              runId,
              ...(sessionId ? { sessionId } : {}),
              error: safeError(payload),
            }),
          ];
        }
        return [
          eventFrame({
            type: "message.completed",
            runId,
            ...(sessionId ? { sessionId } : {}),
            messageId: stringValue(payload, "message_id", "messageId") ?? `${runId}-message`,
          }),
          eventFrame({
            type: "run.completed",
            runId,
            ...(sessionId ? { sessionId } : {}),
            ...(typeof messageText(payload) === "string" || isRecord(payload.usage)
              ? {
                  summary: {
                    ...(typeof messageText(payload) === "string"
                      ? { text: messageText(payload) }
                      : {}),
                    ...(isRecord(payload.usage) ? { usage: normalizeUsage(payload.usage) } : {}),
                  },
                }
              : {}),
          }),
        ];
      case "tool.start":
        return runId &&
          stringValue(payload, "tool_id", "toolId") &&
          typeof payload.name === "string"
          ? [
              eventFrame({
                type: "tool.started",
                runId,
                ...(sessionId ? { sessionId } : {}),
                toolCall: {
                  id: stringValue(payload, "tool_id", "toolId"),
                  name: payload.name,
                  ...(payload.args !== undefined
                    ? { input: payload.args }
                    : payload.args_text !== undefined
                      ? { input: payload.args_text }
                      : {}),
                },
              }),
            ]
          : [diagnostic(frame, sessionId)];
      case "tool.complete":
        return runId && stringValue(payload, "tool_id", "toolId")
          ? [
              eventFrame({
                type: "tool.completed",
                runId,
                ...(sessionId ? { sessionId } : {}),
                toolCallId: stringValue(payload, "tool_id", "toolId"),
                result:
                  payload.result !== undefined
                    ? payload.result
                    : payload.result_text !== undefined
                      ? payload.result_text
                      : {},
              }),
            ]
          : [diagnostic(frame, sessionId)];
      case "tool.failure":
      case "tool.failed":
        return runId && stringValue(payload, "tool_id", "toolId")
          ? [
              eventFrame({
                type: "tool.failed",
                runId,
                ...(sessionId ? { sessionId } : {}),
                toolCallId: stringValue(payload, "tool_id", "toolId"),
                error: safeError(payload),
              }),
            ]
          : [diagnostic(frame, sessionId)];
      case "approval.request":
        return runId
          ? [
              eventFrame({
                type: "approval.requested",
                runId,
                ...(sessionId ? { sessionId } : {}),
                approval: {
                  id: approvalId(payload, runId),
                  action: stringValue(payload, "action", "command") ?? "approval",
                  ...(typeof payload.description === "string"
                    ? { description: payload.description }
                    : {}),
                },
              }),
            ]
          : [diagnostic(frame, sessionId)];
      case "credential.request":
      case "credential.requested":
        return runId && stringValue(payload, "credential_id", "credentialId", "id")
          ? [
              eventFrame({
                type: "credential.requested",
                runId,
                ...(sessionId ? { sessionId } : {}),
                credential: {
                  id: stringValue(payload, "credential_id", "credentialId", "id")!,
                  ...(stringValue(payload, "request_id", "requestId")
                    ? { requestId: stringValue(payload, "request_id", "requestId") }
                    : {}),
                  name: stringValue(payload, "name", "credential") ?? "Credential",
                  ...(stringValue(payload, "env_var", "envVar")
                    ? { envVar: stringValue(payload, "env_var", "envVar") }
                    : {}),
                  ...(typeof payload.purpose === "string" ? { purpose: payload.purpose } : {}),
                  ...(typeof payload.provider === "string" ? { provider: payload.provider } : {}),
                },
              }),
            ]
          : [diagnostic(frame, sessionId)];
      case "secret.request": {
        const requestId = stringValue(payload, "request_id", "requestId");
        if (!runId || !requestId) return [diagnostic(frame, sessionId)];
        const envVar = stringValue(payload, "env_var", "envVar");
        const metadata = isRecord(payload.metadata) ? payload.metadata : undefined;
        const provider = stringValue(metadata, "provider");
        return [
          eventFrame({
            type: "credential.requested",
            runId,
            ...(sessionId ? { sessionId } : {}),
            credential: {
              id: requestId,
              requestId,
              name: envVar ?? stringValue(payload, "name", "credential") ?? "Credential",
              ...(envVar ? { envVar } : {}),
              ...(typeof payload.prompt === "string" ? { purpose: payload.prompt } : {}),
              ...(provider ? { provider } : {}),
            },
          }),
        ];
      }
      case "session.info":
        return [diagnostic(frame, sessionId)];
      case "session.interrupt":
      case "turn.interrupt":
        if (!runId) return [diagnostic(frame, sessionId)];
        this.closeRun(
          sessionId,
          runId,
          suppliedRunId === undefined ? currentGeneration : undefined,
        );
        return runId
          ? [eventFrame({ type: "run.stopped", runId, ...(sessionId ? { sessionId } : {}) })]
          : [diagnostic(frame, sessionId)];
      case "run.status":
      case "status.update":
      case "message.status":
        return runId && typeof (payload.stage ?? payload.status) === "string"
          ? [
              eventFrame({
                type: "run.status",
                runId,
                ...(sessionId ? { sessionId } : {}),
                stage: payload.stage ?? payload.status,
                ...(typeof payload.detail === "string" ? { detail: payload.detail } : {}),
              }),
            ]
          : [diagnostic(frame, sessionId)];
      case "reasoning.delta":
      case "thinking.delta":
        return runId && typeof payload.text === "string"
          ? [
              eventFrame({
                type: "run.status",
                runId,
                ...(sessionId ? { sessionId } : {}),
                stage: event.slice(0, -6),
                detail: payload.text,
              }),
            ]
          : [diagnostic(frame, sessionId)];
      case "tool.output_risk": {
        const toolCallId = stringValue(payload, "tool_id", "toolId");
        const text = stringValue(payload, "text", "chunk", "output", "message", "risk");
        return runId && toolCallId && text
          ? [
              eventFrame({
                type: "tool.output",
                runId,
                ...(sessionId ? { sessionId } : {}),
                toolCallId,
                chunk: text,
              }),
            ]
          : [diagnostic(frame, sessionId)];
      }
      case "notification.show":
        return [diagnostic(frame, sessionId)];
      case "run.error":
      case "run.failure":
      case "run.failed":
        if (!runId) return [diagnostic(frame, sessionId)];
        this.closeRun(
          sessionId,
          runId,
          suppliedRunId === undefined ? currentGeneration : undefined,
        );
        return [
          eventFrame({
            type: "run.failed",
            runId,
            ...(sessionId ? { sessionId } : {}),
            error: safeError(payload),
          }),
        ];
      case "clarification.request":
      case "clarification.requested":
      case "clarify.request":
        return runId && typeof (payload.question ?? payload.prompt) === "string"
          ? [
              eventFrame({
                type: "clarification.requested",
                runId,
                ...(sessionId ? { sessionId } : {}),
                question: payload.question ?? payload.prompt,
              }),
            ]
          : [diagnostic(frame, sessionId)];
      case "context.update":
      case "context.updated":
        return sessionId && isRecord(payload.usage)
          ? [
              eventFrame({
                type: "context.updated",
                sessionId,
                usage: normalizeUsage(payload.usage),
              }),
            ]
          : [diagnostic(frame, sessionId)];
      case "gateway.ready":
        return [diagnostic(frame)];
      default:
        return [diagnostic(frame, sessionId)];
    }
  }

  private trackRun(sessionId: string, runId: string, generation?: number): void {
    if (!this.activeRuns.has(sessionId) && this.activeRuns.size >= 1024)
      this.activeRuns.delete(this.activeRuns.keys().next().value as string);
    this.activeRuns.set(sessionId, { runId, generation });
  }

  private closeRun(sessionId: string | undefined, runId: string, generation?: number): void {
    const activeRun = sessionId ? this.activeRuns.get(sessionId) : undefined;
    if (sessionId && activeRun?.runId === runId) this.activeRuns.delete(sessionId);
    for (const [key, entry] of this.seen) {
      if (
        entry.sessionId === sessionId &&
        (generation !== undefined ? entry.generation === generation : entry.runId === runId)
      )
        this.seen.delete(key);
    }
  }

  private remember(
    key: string,
    frame: NativeHermesFrame,
    event: string,
    sessionId: string | undefined,
    runId: string | undefined,
    generation: number | undefined,
  ): void {
    if (this.seen.size >= 2048) this.seen.delete(this.seen.keys().next().value as string);
    this.seen.set(key, {
      method: frame.method,
      event,
      sessionId,
      runId,
      generation,
    });
  }
}

interface DedupeEntry {
  method?: string;
  event: string;
  sessionId?: string;
  runId?: string;
  generation?: number;
}

interface ActiveRun {
  runId: string;
  generation?: number;
}

function eventFrame(frame: Record<string, unknown>): AgentEvent {
  return agentEventSchema.parse(frame) as AgentEvent;
}

function diagnostic(frame: unknown, sessionId?: string): AgentEvent {
  return agentEventSchema.parse({
    type: "diagnostic.unknown",
    ...(sessionId ? { sessionId } : {}),
    raw: redactSafeValue(frame),
  }) as AgentEvent;
}

function stringValue(
  record: Record<string, unknown> | undefined,
  ...keys: string[]
): string | undefined {
  for (const key of keys)
    if (typeof record?.[key] === "string" && record[key]) return record[key] as string;
  return undefined;
}

function dateValue(payload: Record<string, unknown>): string {
  return typeof payload.at === "string" ? payload.at : "1970-01-01T00:00:00.000Z";
}

function messageText(payload: Record<string, unknown>): string | undefined {
  return typeof payload.text === "string"
    ? payload.text
    : typeof payload.rendered === "string"
      ? payload.rendered
      : undefined;
}

function approvalId(payload: Record<string, unknown>, runId: string): string {
  const explicit = stringValue(payload, "approval_id", "approvalId");
  if (explicit) return explicit;

  const requestId = stringValue(payload, "request_id", "requestId");
  if (requestId) return `approval-${safeIdPart(requestId)}`;

  const action = stringValue(payload, "action", "command");
  if (action) return `approval-${stableHash(action)}`;

  const sequence = payload.sequence ?? payload.seq;
  if (typeof sequence === "string" || typeof sequence === "number")
    return `approval-${safeIdPart(String(sequence))}`;

  return `approval-${stableHash(`${runId}:${JSON.stringify(payload)}`)}`;
}

function safeIdPart(value: string): string {
  const safe = redactSafeText(value)
    .replace(/[^a-z0-9_-]+/giu, "-")
    .replace(/^-+|-+$/gu, "");
  return safe || stableHash(value);
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function safeError(payload: Record<string, unknown>): Record<string, unknown> {
  const nested = isRecord(payload.error) ? payload.error : undefined;
  return {
    code:
      typeof nested?.code === "string"
        ? nested.code
        : typeof payload.code === "string"
          ? payload.code
          : typeof payload.error_code === "string"
            ? payload.error_code
            : "HERMES_EVENT_FAILED",
    message:
      typeof nested?.message === "string"
        ? redactSafeText(nested.message)
        : nested || payload.error_code !== undefined
          ? "Hermes reported a failure."
          : typeof payload.message === "string"
            ? redactSafeText(payload.message)
            : "Hermes reported a failure.",
    ...(typeof payload.component === "string"
      ? { component: redactSafeText(payload.component) }
      : {}),
    ...(typeof payload.operation === "string"
      ? { operation: redactSafeText(payload.operation) }
      : {}),
    ...(typeof payload.retryable === "boolean" ? { retryable: payload.retryable } : {}),
  };
}

function normalizeUsage(payload: Record<string, unknown>): Record<string, number> {
  const aliases: Record<string, string[]> = {
    inputTokens: ["input", "inputTokens", "input_tokens"],
    outputTokens: ["output", "outputTokens", "output_tokens"],
    totalTokens: ["total", "totalTokens", "total_tokens"],
    reasoningTokens: ["reasoning", "reasoningTokens", "reasoning_tokens"],
    cachedInputTokens: ["cached", "cachedInputTokens", "cached_input_tokens"],
  };
  const usage: Record<string, number> = {};
  for (const [name, keys] of Object.entries(aliases)) {
    const value = keys
      .map((key) => payload[key])
      .find((candidate) => typeof candidate === "number");
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) usage[name] = value;
  }
  return usage;
}

function frameKey(
  frame: NativeHermesFrame,
  event: string,
  sessionId: string | undefined,
  runId: string | undefined,
  generation: number | undefined,
  payload: Record<string, unknown>,
): string | undefined {
  const params = frame.params ?? {};
  const requestId = stableIdentityValue(
    frame.id ??
      (isRecord(params) ? (params.request ?? params.request_id ?? params.requestId) : undefined) ??
      payload.request ??
      payload.request_id ??
      payload.requestId,
  );
  const sequence = stableIdentityValue(
    payload.seq ?? payload.sequence ?? (isRecord(params) ? params.sequence : undefined),
  );
  const eventId = stableIdentityValue(
    (isRecord(params) ? (params.event_id ?? params.eventId) : undefined) ??
      payload.event_id ??
      payload.eventId,
  );
  const stableRunId = stableIdentityValue(
    runId ??
      payload.run_id ??
      payload.runId ??
      (sessionId !== undefined && generation !== undefined
        ? `inferred:${sessionId}:${generation}`
        : undefined),
  );

  if (requestId === undefined && sequence === undefined && eventId === undefined) return undefined;
  return JSON.stringify([
    frame.method,
    event,
    sessionId,
    stableRunId,
    requestId,
    eventId,
    sequence,
  ]);
}

function stableIdentityValue(value: unknown): string | number | undefined {
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

function normalizeFrames(frames: Array<Record<string, unknown>>): AgentEvent[] {
  return frames.map((nextFrame) => {
    const normalized = agentEventSchema.safeParse(nextFrame);
    if (normalized.success) return normalized.data as AgentEvent;

    return agentEventSchema.parse({ type: "diagnostic.unknown", raw: nextFrame }) as AgentEvent;
  });
}

export { StreamRedactor };
