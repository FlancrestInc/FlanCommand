import type { AgentEvent, HermesSession, SafeError } from "@flancommand/event-schema";
import {
  createHermesAdapter,
  HermesAdapterError,
  type HermesAdapter,
} from "@flancommand/hermes-adapter";
import { makeEvidence } from "./evidence.js";
import { SafetyRefusalError } from "./options.js";
import { canRunTestMutation, SAFE_PROMPT } from "./test-profile.js";
import type { ProbeOptions } from "./options.js";
import { OutputSafetyError, prepareOutputDirectory, writeProbeReport } from "./report.js";

export const EXIT_CODES = {
  complete: 0,
  invalid: 2,
  safety: 3,
  unexpected: 4,
  environment: 5,
} as const;

export interface ProbeResult {
  exitCode: number;
  events: AgentEvent[];
  sessions: HermesSession[];
  errors: SafeError[];
  files: string[];
}

export function readProbeAuth(
  environment: Record<string, string | undefined> = process.env,
): { token: string } | undefined {
  const token = environment.HERMES_AUTH_TOKEN?.trim();
  return token ? { token } : undefined;
}

export function sessionsToResume(sessions: HermesSession[], limit: number): HermesSession[] {
  const boundedLimit = Math.max(0, Math.floor(limit));
  return [...sessions]
    .sort((left, right) => Number(right.source === "hermes") - Number(left.source === "hermes"))
    .slice(0, boundedLimit);
}

function safeError(error: unknown): SafeError {
  if (error instanceof HermesAdapterError) return error.toSafeError();
  return {
    code: "PROBE_FAILURE",
    message: error instanceof Error ? error.message : "Probe failed.",
  };
}

export async function runProbe(options: ProbeOptions): Promise<ProbeResult> {
  const events: AgentEvent[] = [];
  const errors: SafeError[] = [];
  let sessions: HermesSession[] = [];
  let adapter: HermesAdapter | undefined;
  let outputDirectory: string | undefined;
  let capabilities: Awaited<ReturnType<HermesAdapter["getCapabilities"]>> | undefined;
  let reportWritten = false;
  try {
    if (options.allowTestMutations && !canRunTestMutation(options))
      throw new Error("test mutations need the safe profile");
    if (options.mode === "live" && canRunTestMutation(options))
      throw new SafetyRefusalError("live adapter cannot verify the required no-tool constraint");
    const probeAuth = options.mode === "live" ? readProbeAuth() : undefined;
    if (options.writeReport !== false)
      outputDirectory = await prepareOutputDirectory(options.output ?? "probe-output");
    adapter = createHermesAdapter({
      transport: options.mode === "mock" ? "mock" : "websocket",
      endpoint: options.endpoint,
      origin: options.origin,
      ...(probeAuth ? { auth: probeAuth } : {}),
      ...options.limits,
    });
    await adapter.connect();
    capabilities = await adapter.getCapabilities();
    sessions = await adapter.listSessions();
    const resumableSessions = sessionsToResume(sessions, options.limits.maxTestSessions);
    const resumedSessions = await Promise.all(
      resumableSessions.map((session) => adapter!.getSession(session.id)),
    );
    sessions = sessions.map(
      (session) => resumedSessions.find((resumed) => resumed.id === session.id) ?? session,
    );
    let ranMutation = false;
    if (options.allowTestMutations && canRunTestMutation(options)) {
      const before = new Set(sessions.map((session) => session.id));
      const created = await adapter.createSession({
        title: `Hermes Command Center Probe ${Date.now()}`,
      });
      if (before.has(created.id) || created.source === "telegram")
        throw new Error("new test session identity could not be verified");
      sessions = [...sessions, created];
      ranMutation = true;
      for await (const event of adapter.sendMessage(created.id, { text: SAFE_PROMPT })) {
        if (events.length >= options.limits.maxEvents)
          throw new Error("probe event limit exceeded");
        events.push(event);
        if (event.type === "run.failed") errors.push(event.error);
      }
    }
    if (outputDirectory) {
      const files = await writeProbeReport(outputDirectory, {
        mode: options.mode,
        endpoint: options.endpoint,
        events,
        capabilities,
        sessions,
        errors,
        evidence: makeEvidence(options.mode, ranMutation),
      });
      reportWritten = true;
      return {
        exitCode: errors.length ? EXIT_CODES.unexpected : EXIT_CODES.complete,
        events,
        sessions,
        errors,
        files,
      };
    }
    return {
      exitCode: errors.length ? EXIT_CODES.unexpected : EXIT_CODES.complete,
      events,
      sessions,
      errors,
      files: [],
    };
  } catch (error) {
    const safe = safeError(error);
    errors.push(safe);
    let files: string[] = [];
    if (outputDirectory && !reportWritten) {
      try {
        files = await writeProbeReport(outputDirectory, {
          mode: options.mode,
          endpoint: options.endpoint,
          events,
          capabilities,
          sessions,
          errors,
          evidence: makeEvidence(options.mode, false),
        });
      } catch {
        files = [];
      }
    }
    const exitCode =
      error instanceof OutputSafetyError || error instanceof SafetyRefusalError
        ? EXIT_CODES.safety
        : options.mode === "live"
          ? EXIT_CODES.environment
          : EXIT_CODES.unexpected;
    return {
      exitCode,
      events,
      sessions,
      errors,
      files,
    };
  } finally {
    await adapter?.disconnect().catch(() => undefined);
  }
}
