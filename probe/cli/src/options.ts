import { isAbsolute, win32 } from "node:path";

export const DEFAULTS = {
  endpoint: "ws://127.0.0.1:9119/api/ws",
  origin: "http://127.0.0.1:3000",
  output: "probe-output",
  connectTimeoutMs: 5_000,
  requestTimeoutMs: 10_000,
  idleTimeoutMs: 30_000,
  totalTimeoutMs: 120_000,
  maxFrameBytes: 8 * 1024 * 1024,
  maxTranscriptBytes: 10 * 1024 * 1024,
  maxEvents: 500,
  maxTestSessions: 1,
} as const;

export type ProbeMode = "mock" | "live";
export type ProbeProfile = "hermes-command-center-safe";
export type ProbeLimits = Omit<typeof DEFAULTS, "endpoint" | "origin" | "output">;

export interface ProbeOptions {
  mode: ProbeMode;
  endpoint: string;
  origin: string;
  output?: string;
  allowPrivateEndpoint: boolean;
  allowTestMutations: boolean;
  profile?: ProbeProfile;
  limits: ProbeLimits;
  writeReport?: boolean;
}

export class InvalidOptionsError extends Error {}
export class SafetyRefusalError extends Error {}

function valueAfter(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new InvalidOptionsError(`${flag} needs a value`);
  return value;
}

function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  return host === "localhost" || host === "::1" || host === "127.0.0.1" || host.startsWith("127.");
}

function validateEndpoint(value: string, mode: ProbeMode, allowPrivate: boolean): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InvalidOptionsError("endpoint must be a valid WebSocket URL");
  }
  if (url.protocol !== "ws:" && url.protocol !== "wss:")
    throw new InvalidOptionsError("endpoint must use ws:// or wss://");
  if (url.username || url.password)
    throw new SafetyRefusalError("endpoint credentials are refused");
  if (mode === "live" && !isLoopback(url.hostname) && !allowPrivate)
    throw new SafetyRefusalError(
      "live mode needs --allow-private endpoint flag for non-loopback endpoints",
    );
}

function validateOrigin(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InvalidOptionsError("origin must be a valid HTTP(S) origin");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new InvalidOptionsError("origin must be an HTTP(S) origin without credentials or a path");
}

function validateOutput(value: string): void {
  if (!value || isAbsolute(value) || win32.isAbsolute(value))
    throw new SafetyRefusalError("output must be a safe relative directory");
  if (/\p{Cc}/u.test(value) || value.split(/[\\/]/u).some((part) => part === "." || part === ".."))
    throw new SafetyRefusalError("output must stay below the current directory");
}

export function parseOptions(args: string[]): ProbeOptions {
  let mode: ProbeMode = "mock";
  let endpoint: string = DEFAULTS.endpoint;
  let origin: string = DEFAULTS.origin;
  let output: string = DEFAULTS.output;
  let allowPrivateEndpoint = false;
  let allowTestMutations = false;
  let profile: ProbeProfile | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--mode") {
      const value = valueAfter(args, index++, arg);
      if (value !== "mock" && value !== "live")
        throw new InvalidOptionsError("mode must be mock or live");
      mode = value;
    } else if (arg === "--endpoint") endpoint = valueAfter(args, index++, arg);
    else if (arg === "--origin") origin = valueAfter(args, index++, arg);
    else if (arg === "--output") output = valueAfter(args, index++, arg);
    else if (arg === "--profile") {
      const value = valueAfter(args, index++, arg);
      if (value !== "hermes-command-center-safe")
        throw new InvalidOptionsError("unknown probe profile");
      profile = value;
    } else if (arg === "--allow-private-endpoint") allowPrivateEndpoint = true;
    else if (arg === "--allow-test-mutations") allowTestMutations = true;
    else throw new InvalidOptionsError(`unknown option: ${arg}`);
  }
  validateEndpoint(endpoint, mode, allowPrivateEndpoint);
  validateOrigin(origin);
  validateOutput(output);
  if (allowTestMutations && profile !== "hermes-command-center-safe")
    throw new SafetyRefusalError(
      "--allow-test-mutations needs --profile hermes-command-center-safe",
    );
  return {
    mode,
    endpoint,
    origin,
    output,
    allowPrivateEndpoint,
    allowTestMutations,
    ...(profile ? { profile } : {}),
    limits: {
      connectTimeoutMs: DEFAULTS.connectTimeoutMs,
      requestTimeoutMs: DEFAULTS.requestTimeoutMs,
      idleTimeoutMs: DEFAULTS.idleTimeoutMs,
      totalTimeoutMs: DEFAULTS.totalTimeoutMs,
      maxFrameBytes: DEFAULTS.maxFrameBytes,
      maxTranscriptBytes: DEFAULTS.maxTranscriptBytes,
      maxEvents: DEFAULTS.maxEvents,
      maxTestSessions: DEFAULTS.maxTestSessions,
    },
  };
}
