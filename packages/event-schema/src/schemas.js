import { z } from "zod";
const sensitiveWords = new Set([
  "secret",
  "token",
  "password",
  "credential",
  "authorization",
  "auth",
  "cookie",
]);
function normalizeKeyWords(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .split(/[^a-z0-9]+/giu)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}
function isSensitiveKey(key) {
  const words = normalizeKeyWords(key);
  if (
    (words[0] === "credential" || words[0] === "secret") &&
    ["id", "ref", "reference"].includes(words[1] ?? "")
  )
    return false;
  if (words.some((word) => sensitiveWords.has(word))) return true;
  if (words.some((word, index) => word === "api" && words[index + 1] === "key")) return true;
  if (words.some((word, index) => word === "private" && words[index + 1] === "key")) return true;
  const compact = words.join("");
  return compact === "apikey" || compact === "privatekey";
}
export const redactSafeText = (value) =>
  value
    .replace(/(authorization\s*:\s*)(?:Bearer\s+)?[^\s,;)}\]]+/giu, "$1[REDACTED]")
    .replace(/(Bearer\s+)[^\s,;)}\]]+/giu, "$1[REDACTED]")
    .replace(/(cookie\s*:\s*)[^;\r\n]+/giu, "$1[REDACTED]")
    .replace(
      /(["']?)(authorization|cookie|credential|secret[-_]?key|auth[-_]?token|oauth[-_]?token|client[-_]?secret|db[-_]?password|session(?:[-_ ]?token)?|access(?:[-_ ]?token)?|refresh(?:[-_ ]?token)?|token|secret|password|api[-_]?key|private[-_]?key|x-api-key|x-auth-token|x-access-token|x-refresh-token|set-cookie)\1\s*[:=]\s*(?:"[^"]*"|'[^']*'|\[[^\]]+\]|[^\s,;)}\]]+)/giu,
      "$1$2$1=[REDACTED]",
    )
    .replace(/(https?:\/\/)[^/\s:@]+:[^@\s/]+@/giu, "$1[REDACTED]@")
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/gu, "[REDACTED PRIVATE KEY]");
const safeText = z.string().transform(redactSafeText);
const safeTextRequired = z.string().min(1).transform(redactSafeText);
export function redactSafeValue(value, key) {
  if (key && isSensitiveKey(key)) return "[REDACTED]";
  if (typeof value === "string") {
    return redactSafeText(value);
  }
  if (Array.isArray(value)) return value.map((item) => redactSafeValue(item));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactSafeValue(entryValue, entryKey),
      ]),
    );
  }
  return value;
}
const optionalNonNegativeInt = z.number().int().nonnegative().optional();
const usageShape = {
  inputTokens: optionalNonNegativeInt,
  outputTokens: optionalNonNegativeInt,
  totalTokens: optionalNonNegativeInt,
  reasoningTokens: optionalNonNegativeInt,
  cachedInputTokens: optionalNonNegativeInt,
};
export const capabilityStatusSchema = z.enum([
  "observed",
  "source-inferred",
  "unsupported",
  "not observed",
  "not tested",
  "blocked",
]);
export const capabilityObservationSchema = z
  .object({
    status: capabilityStatusSchema,
    evidence: safeText.optional(),
    reason: safeText.optional(),
    recovery: safeText.optional(),
  })
  .strict();
export const hermesCapabilitiesSchema = z
  .object({
    sessions: capabilityObservationSchema,
    streaming: capabilityObservationSchema,
    commands: capabilityObservationSchema,
    models: capabilityObservationSchema,
    approvals: capabilityObservationSchema,
    clarifications: capabilityObservationSchema,
    reconnect: capabilityObservationSchema,
    artifacts: capabilityObservationSchema,
    memory: capabilityObservationSchema,
    usage: capabilityObservationSchema,
    context: capabilityObservationSchema,
    stop: capabilityObservationSchema,
    retry: capabilityObservationSchema,
    rename: capabilityObservationSchema,
    modelSelection: capabilityObservationSchema,
  })
  .strict();
export const hermesSessionSchema = z
  .object({
    id: safeTextRequired,
    title: safeText.optional(),
    modelId: safeText.optional(),
    createdAt: z.string().datetime().transform(redactSafeText).optional(),
    updatedAt: z.string().datetime().transform(redactSafeText).optional(),
    source: z.enum(["hermes", "telegram", "unknown"]).optional(),
    status: z.enum(["idle", "running", "paused", "failed", "unknown"]).optional(),
    history: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant", "system"]),
            text: safeText,
          })
          .strict(),
      )
      .optional(),
  })
  .strict();
export const modelInfoSchema = z
  .object({
    id: safeTextRequired,
    name: safeText.optional(),
    provider: safeText.optional(),
    reasoning: z.boolean().optional(),
    contextWindow: optionalNonNegativeInt,
  })
  .strict();
export const slashCommandSchema = z
  .object({
    name: safeTextRequired,
    description: safeText.optional(),
    argumentHint: safeText.optional(),
  })
  .strict();
const safeErrorText = z.string().min(1).transform(redactSafeText);
export const safeErrorSchema = z
  .object({
    code: safeErrorText,
    message: safeErrorText,
    component: safeErrorText.optional(),
    operation: safeErrorText.optional(),
    likelyCause: safeErrorText.optional(),
    nextAction: safeErrorText.optional(),
    retryable: z.boolean().optional(),
  })
  .strict();
export const usageSchema = z.object(usageShape).strict();
export const contextUsageSchema = usageSchema
  .extend({ contextWindow: optionalNonNegativeInt })
  .strict();
export const toolCallSchema = z
  .object({
    id: safeTextRequired,
    name: safeTextRequired,
    input: z
      .unknown()
      .transform((value) => redactSafeValue(value))
      .optional(),
  })
  .strict();
export const approvalRequestSchema = z
  .object({
    id: safeTextRequired,
    action: safeTextRequired,
    description: safeText.optional(),
    risk: z.enum(["low", "medium", "high", "unknown"]).optional(),
  })
  .strict();
export const credentialRequestSchema = z
  .object({
    id: safeTextRequired,
    requestId: safeText.optional(),
    name: safeTextRequired,
    envVar: safeText.optional(),
    purpose: safeText.optional(),
    provider: safeText.optional(),
  })
  .strict();
export const artifactReferenceSchema = z
  .object({
    id: safeTextRequired,
    name: safeTextRequired,
    kind: z.enum(["file", "image", "document", "link", "unknown"]).optional(),
    mimeType: safeText.optional(),
    uri: safeText.optional(),
    sizeBytes: optionalNonNegativeInt,
  })
  .strict();
export const memoryReferenceSchema = z
  .object({ id: safeText.optional(), label: safeTextRequired, source: safeText.optional() })
  .strict();
export const runSummarySchema = z
  .object({ text: safeText.optional(), usage: usageSchema.optional() })
  .strict();
const baseRun = { runId: safeTextRequired, sessionId: safeTextRequired.optional() };
export const agentEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("run.started"),
      runId: safeTextRequired,
      sessionId: safeTextRequired,
      at: z.string().datetime().transform(redactSafeText),
    })
    .strict(),
  z
    .object({
      type: z.literal("run.status"),
      ...baseRun,
      stage: safeTextRequired,
      detail: safeText.optional(),
    })
    .strict(),
  z.object({ type: z.literal("message.delta"), ...baseRun, text: safeText }).strict(),
  z
    .object({ type: z.literal("message.completed"), ...baseRun, messageId: safeTextRequired })
    .strict(),
  z.object({ type: z.literal("tool.started"), ...baseRun, toolCall: toolCallSchema }).strict(),
  z
    .object({
      type: z.literal("tool.output"),
      ...baseRun,
      toolCallId: safeTextRequired,
      chunk: safeText,
    })
    .strict(),
  z
    .object({
      type: z.literal("tool.completed"),
      ...baseRun,
      toolCallId: safeTextRequired,
      result: z.unknown().transform((value) => redactSafeValue(value)),
    })
    .strict(),
  z
    .object({
      type: z.literal("tool.failed"),
      ...baseRun,
      toolCallId: safeTextRequired,
      error: safeErrorSchema,
    })
    .strict(),
  z
    .object({ type: z.literal("approval.requested"), ...baseRun, approval: approvalRequestSchema })
    .strict(),
  z
    .object({
      type: z.literal("credential.requested"),
      ...baseRun,
      credential: credentialRequestSchema,
    })
    .strict(),
  z
    .object({ type: z.literal("clarification.requested"), ...baseRun, question: safeTextRequired })
    .strict(),
  z.object({ type: z.literal("memory.used"), ...baseRun, memory: memoryReferenceSchema }).strict(),
  z
    .object({ type: z.literal("artifact.created"), ...baseRun, artifact: artifactReferenceSchema })
    .strict(),
  z
    .object({
      type: z.literal("context.updated"),
      sessionId: safeTextRequired,
      usage: contextUsageSchema,
    })
    .strict(),
  z
    .object({ type: z.literal("run.completed"), ...baseRun, summary: runSummarySchema.optional() })
    .strict(),
  z.object({ type: z.literal("run.failed"), ...baseRun, error: safeErrorSchema }).strict(),
  z.object({ type: z.literal("run.stopped"), ...baseRun }).strict(),
  z
    .object({
      type: z.literal("reconnect.gap"),
      sessionId: safeTextRequired.optional(),
      runId: safeTextRequired.optional(),
      reason: safeTextRequired,
    })
    .strict(),
  z
    .object({
      type: z.literal("diagnostic.unknown"),
      sessionId: safeTextRequired.optional(),
      raw: z.record(z.unknown()).transform((raw) => redactSafeValue(raw)),
    })
    .strict(),
]);
