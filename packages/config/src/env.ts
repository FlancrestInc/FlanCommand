import { posix, win32 } from "node:path";

import { z } from "zod";

const DEFAULTS = {
  nodeEnv: "development",
  hermesEndpoint: "ws://127.0.0.1:9119/api/ws",
  hermesOrigin: "http://127.0.0.1:3000",
  probeOutputDir: "probe-output",
  connectTimeoutMs: 5000,
  requestTimeoutMs: 10000,
  idleTimeoutMs: 30000,
  totalTimeoutMs: 120000,
  maxFrameBytes: 1024 * 1024,
  maxTranscriptBytes: 10 * 1024 * 1024,
  maxEvents: 500,
  maxTestSessions: 1,
} as const;

const MAXES = {
  connectTimeoutMs: 60_000,
  requestTimeoutMs: 300_000,
  idleTimeoutMs: 300_000,
  totalTimeoutMs: 900_000,
  maxFrameBytes: 16 * 1024 * 1024,
  maxTranscriptBytes: 100 * 1024 * 1024,
  maxEvents: 10_000,
  maxTestSessions: 10,
} as const;

const boundedPositiveInteger = (maximum: number) =>
  z.coerce.number().int().positive().finite().max(maximum);

const isHermesEndpoint = (value: string) => {
  try {
    const url = new URL(value);
    return ["ws:", "wss:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
};

const isOrigin = (value: string) => {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
};

const isSafeRelativePath = (value: string) => {
  if (posix.isAbsolute(value) || win32.isAbsolute(value)) {
    return false;
  }

  if (/\p{Cc}/u.test(value)) {
    return false;
  }

  return !value.split(/[\\/]/u).some((segment) => segment === "." || segment === "..");
};

const rawEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default(DEFAULTS.nodeEnv),
    HERMES_ENDPOINT: z
      .string()
      .default(DEFAULTS.hermesEndpoint)
      .refine(isHermesEndpoint, "must be a ws:// or wss:// URL without credentials"),
    HERMES_ORIGIN: z
      .string()
      .default(DEFAULTS.hermesOrigin)
      .refine(isOrigin, "must be an http:// or https:// origin without credentials or a path"),
    HERMES_AUTH_REF: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z.string().trim().min(1).optional(),
    ),
    PROBE_OUTPUT_DIR: z
      .string()
      .trim()
      .min(1)
      .refine(isSafeRelativePath, "must be a safe relative path")
      .default(DEFAULTS.probeOutputDir),
    PROBE_CONNECT_TIMEOUT_MS: boundedPositiveInteger(MAXES.connectTimeoutMs).default(
      DEFAULTS.connectTimeoutMs,
    ),
    PROBE_REQUEST_TIMEOUT_MS: boundedPositiveInteger(MAXES.requestTimeoutMs).default(
      DEFAULTS.requestTimeoutMs,
    ),
    PROBE_IDLE_TIMEOUT_MS: boundedPositiveInteger(MAXES.idleTimeoutMs).default(
      DEFAULTS.idleTimeoutMs,
    ),
    PROBE_TOTAL_TIMEOUT_MS: boundedPositiveInteger(MAXES.totalTimeoutMs).default(
      DEFAULTS.totalTimeoutMs,
    ),
    PROBE_MAX_FRAME_BYTES: boundedPositiveInteger(MAXES.maxFrameBytes).default(
      DEFAULTS.maxFrameBytes,
    ),
    PROBE_MAX_TRANSCRIPT_BYTES: boundedPositiveInteger(MAXES.maxTranscriptBytes).default(
      DEFAULTS.maxTranscriptBytes,
    ),
    PROBE_MAX_EVENTS: boundedPositiveInteger(MAXES.maxEvents).default(DEFAULTS.maxEvents),
    PROBE_MAX_TEST_SESSIONS: boundedPositiveInteger(MAXES.maxTestSessions).default(
      DEFAULTS.maxTestSessions,
    ),
  })
  .superRefine((env, context) => {
    if (env.PROBE_REQUEST_TIMEOUT_MS >= env.PROBE_TOTAL_TIMEOUT_MS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PROBE_REQUEST_TIMEOUT_MS"],
        message: "must be below PROBE_TOTAL_TIMEOUT_MS",
      });
    }

    if (env.PROBE_IDLE_TIMEOUT_MS >= env.PROBE_TOTAL_TIMEOUT_MS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PROBE_IDLE_TIMEOUT_MS"],
        message: "must be below PROBE_TOTAL_TIMEOUT_MS",
      });
    }
  });

export interface AppEnv {
  nodeEnv: "development" | "test" | "production";
  hermesEndpoint: string;
  hermesOrigin: string;
  hermesAuthRef: string | undefined;
  probeOutputDir: string;
  limits: {
    connectTimeoutMs: number;
    requestTimeoutMs: number;
    idleTimeoutMs: number;
    totalTimeoutMs: number;
    maxFrameBytes: number;
    maxTranscriptBytes: number;
    maxEvents: number;
    maxTestSessions: number;
  };
}

export function parseEnv(input: Record<string, string | undefined>): AppEnv {
  const result = rawEnvSchema.safeParse(input);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new Error(`environment validation failed: ${details}`);
  }

  const env = result.data;
  return {
    nodeEnv: env.NODE_ENV,
    hermesEndpoint: env.HERMES_ENDPOINT,
    hermesOrigin: env.HERMES_ORIGIN,
    hermesAuthRef: env.HERMES_AUTH_REF,
    probeOutputDir: env.PROBE_OUTPUT_DIR,
    limits: {
      connectTimeoutMs: env.PROBE_CONNECT_TIMEOUT_MS,
      requestTimeoutMs: env.PROBE_REQUEST_TIMEOUT_MS,
      idleTimeoutMs: env.PROBE_IDLE_TIMEOUT_MS,
      totalTimeoutMs: env.PROBE_TOTAL_TIMEOUT_MS,
      maxFrameBytes: env.PROBE_MAX_FRAME_BYTES,
      maxTranscriptBytes: env.PROBE_MAX_TRANSCRIPT_BYTES,
      maxEvents: env.PROBE_MAX_EVENTS,
      maxTestSessions: env.PROBE_MAX_TEST_SESSIONS,
    },
  };
}
