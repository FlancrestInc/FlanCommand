import { spawn } from "node:child_process";
import { basename, resolve } from "node:path";

const MAX_OUTPUT_BYTES = 512 * 1024;
const MAX_ENTRIES = 500;

export interface RemoteFilesystemEntry {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink";
}

export interface RemoteFilesystemListing {
  host: string;
  path: string;
  entries: RemoteFilesystemEntry[];
}

export interface RemoteFilesystemRunner {
  run(host: string, path: string): Promise<Buffer>;
}

export class RemoteFilesystemError extends Error {
  constructor(
    message: string,
    readonly code:
      "INVALID_PATH" | "REMOTE_ACCESS_FAILED" | "REMOTE_OUTPUT_INVALID" | "REMOTE_OUTPUT_LIMIT",
  ) {
    super(message);
    this.name = "RemoteFilesystemError";
  }
}

export const sshFilesystemRunner: RemoteFilesystemRunner = {
  run(host, path) {
    return runSshListing(host, path);
  },
};

export async function listRemoteFilesystem(
  runner: RemoteFilesystemRunner,
  host: string,
  requestedPath: string,
): Promise<RemoteFilesystemListing> {
  const path = validatePath(requestedPath);
  const output = await runner.run(host, path);
  if (output.byteLength > MAX_OUTPUT_BYTES)
    throw new RemoteFilesystemError(
      "Remote directory listing is too large.",
      "REMOTE_OUTPUT_LIMIT",
    );
  const entries = parseRemoteFilesystemOutput(output, path);
  if (entries.length > MAX_ENTRIES)
    throw new RemoteFilesystemError(
      "Remote directory has too many entries.",
      "REMOTE_OUTPUT_LIMIT",
    );
  return { host, path, entries };
}

export function parseRemoteFilesystemOutput(
  output: Buffer,
  directory: string,
): RemoteFilesystemEntry[] {
  const text = output.toString("utf8");
  if (text.includes("\uFFFD"))
    throw new RemoteFilesystemError(
      "Remote directory listing was not valid UTF-8.",
      "REMOTE_OUTPUT_INVALID",
    );
  const entries = text
    .split("\0")
    .filter(Boolean)
    .map((record) => {
      const separator = record.indexOf(":");
      const marker = separator >= 0 ? record.slice(0, separator) : "";
      const path = separator >= 0 ? record.slice(separator + 1) : "";
      const type =
        marker === "d"
          ? "directory"
          : marker === "f"
            ? "file"
            : marker === "l"
              ? "symlink"
              : undefined;
      if (!type || !path || !path.startsWith("/"))
        throw new RemoteFilesystemError(
          "Remote directory listing was malformed.",
          "REMOTE_OUTPUT_INVALID",
        );
      const normalizedPath = resolve(path);
      if (normalizedPath === directory)
        throw new RemoteFilesystemError(
          "Remote directory listing contained its parent path.",
          "REMOTE_OUTPUT_INVALID",
        );
      return {
        name: basename(normalizedPath),
        path: normalizedPath,
        type,
      } satisfies RemoteFilesystemEntry;
    });
  return entries.sort(
    (left, right) =>
      entryRank(left.type) - entryRank(right.type) ||
      left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" }),
  );
}

function entryRank(type: RemoteFilesystemEntry["type"]): number {
  return type === "directory" ? 0 : type === "file" ? 1 : 2;
}

function validatePath(requestedPath: string): string {
  if (!requestedPath || !requestedPath.startsWith("/") || /[\0\r\n]/u.test(requestedPath))
    throw new RemoteFilesystemError("Filesystem path must be absolute.", "INVALID_PATH");
  return resolve(requestedPath);
}

function runSshListing(host: string, path: string): Promise<Buffer> {
  const remoteCommand = `find -- ${quoteShellArg(path)} -mindepth 1 -maxdepth 1 -printf '%y:%p\\0'`;
  return new Promise((resolveOutput, reject) => {
    const child = spawn("ssh", ["-T", "--", host, "sh", "-lc", remoteCommand], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    let size = 0;
    let errorText = "";
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size <= MAX_OUTPUT_BYTES) chunks.push(chunk);
      else child.kill();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      errorText += chunk.toString("utf8").slice(0, 4000);
    });
    child.on("error", (error) =>
      reject(
        new RemoteFilesystemError(
          `Remote filesystem connection failed: ${error.message}`,
          "REMOTE_ACCESS_FAILED",
        ),
      ),
    );
    child.on("close", (code) => {
      if (size > MAX_OUTPUT_BYTES) {
        reject(
          new RemoteFilesystemError(
            "Remote directory listing is too large.",
            "REMOTE_OUTPUT_LIMIT",
          ),
        );
      } else if (code !== 0) {
        reject(
          new RemoteFilesystemError(
            errorText.trim() || "Remote directory could not be opened.",
            "REMOTE_ACCESS_FAILED",
          ),
        );
      } else {
        resolveOutput(Buffer.concat(chunks));
      }
    });
  });
}

function quoteShellArg(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
