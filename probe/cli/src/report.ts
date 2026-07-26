import { chmod, lstat, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  AgentEvent,
  HermesCapabilities,
  HermesSession,
  SafeError,
} from "@flancommand/event-schema";
import type { EvidenceRecord } from "./evidence.js";

const MAX_REPORT_BYTES = 10 * 1024 * 1024;

export class OutputSafetyError extends Error {}

export interface ProbeReportInput {
  mode: "mock" | "live";
  endpoint: string;
  events: AgentEvent[];
  capabilities?: HermesCapabilities;
  sessions: HermesSession[];
  errors: SafeError[];
  evidence: EvidenceRecord[];
}

export function redactReportText(value: string): string {
  return value
    .replace(/(authorization\s*[:=]\s*)([^\s,;]+)/giu, "$1[REDACTED]")
    .replace(/(bearer\s+)([^\s,;]+)/giu, "$1[REDACTED]")
    .replace(/(token|secret|password|api[-_]?key)\s*[:=]\s*[^\s,;]+/giu, "$1=[REDACTED]")
    .replace(/https?:\/\/[^/\s:@]+:[^@\s/]+@/giu, "https://[REDACTED]@");
}

function boundedJson(value: unknown): string {
  const safe = redactReportText(JSON.stringify(value, null, 2));
  if (Buffer.byteLength(safe) <= MAX_REPORT_BYTES) return safe;
  return `${safe.slice(0, MAX_REPORT_BYTES - 64)}\n[TRUNCATED]\n`;
}

export async function prepareOutputDirectory(relativePath: string): Promise<string> {
  const root = resolve(process.cwd());
  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}/`))
    throw new OutputSafetyError("output path escapes current directory");
  try {
    await lstat(target);
    throw new OutputSafetyError("output directory already exists");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(target, { recursive: false, mode: 0o700 });
  await chmod(target, 0o700);
  return target;
}

export async function writeProbeReport(
  directory: string,
  report: ProbeReportInput,
): Promise<string[]> {
  const files: Array<[string, unknown]> = [
    ["transcript.jsonl", report.events],
    ["capabilities.json", report.capabilities ?? {}],
    ["evidence.json", report.evidence],
    [
      "manifest.json",
      {
        mode: report.mode,
        endpoint: report.endpoint,
        sessionCount: report.sessions.length,
        errors: report.errors,
      },
    ],
  ];
  const written: string[] = [];
  for (const [name, value] of files) {
    const path = join(directory, name.replace(/[^a-z0-9._-]/giu, "_"));
    const content =
      name === "transcript.jsonl" && Array.isArray(value)
        ? value.map((event) => redactReportText(JSON.stringify(event))).join("\n") + "\n"
        : boundedJson(value);
    if (Buffer.byteLength(content) > MAX_REPORT_BYTES)
      throw new Error("probe report exceeds transcript limit");
    await writeFile(path, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
    written.push(path);
  }
  return written;
}
