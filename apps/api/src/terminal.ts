import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

export interface TerminalRecord {
  id: string;
  cwd: string;
  host: string;
  cols: number;
  rows: number;
  status: "active" | "closed";
  error?: string;
  createdAt: string;
  closedAt?: string;
}

interface TerminalOptions {
  shell?: string;
  shellArgs?: string[];
  maxHistoryBytes?: number;
  spawnProcess?: (
    shell: string,
    shellArgs: string[],
    cwd: string,
    host: string,
    environment: NodeJS.ProcessEnv,
  ) => ChildProcessWithoutNullStreams;
}

export interface TerminalCreateOptions {
  environment?: NodeJS.ProcessEnv;
  onClose?: () => Promise<void>;
}

export class TerminalManager {
  private readonly sessions = new Map<string, ManagedTerminal>();
  private readonly shell: string;
  private readonly shellArgs: string[];
  private readonly maxHistoryBytes: number;
  private readonly spawnProcess?: TerminalOptions["spawnProcess"];

  constructor(options: TerminalOptions = {}) {
    this.shell = options.shell ?? process.env.SHELL ?? "/bin/sh";
    this.shellArgs = options.shellArgs ?? ["-i"];
    this.maxHistoryBytes = options.maxHistoryBytes ?? 256 * 1024;
    this.spawnProcess = options.spawnProcess;
  }

  create(cwd: string, host = "local", options: TerminalCreateOptions = {}): TerminalRecord {
    const child = this.spawnProcess
      ? this.spawnProcess(this.shell, this.shellArgs, cwd, host, {
          ...safeTerminalEnvironment(),
          ...(options.environment ?? {}),
        })
      : spawnTerminal(this.shell, this.shellArgs, cwd, host, options.environment);
    const session = new ManagedTerminal(child, cwd, host, this.maxHistoryBytes, options.onClose);
    this.sessions.set(session.record.id, session);
    child.on("exit", (code, signal) => session.markExited(code, signal));
    child.on("error", (error) => session.markFailed(error));
    return session.record;
  }

  get(id: string): TerminalRecord | undefined {
    return this.sessions.get(id)?.record;
  }

  write(id: string, input: string): void {
    this.require(id).write(input);
  }

  resize(id: string, cols: number, rows: number): void {
    if (
      !Number.isInteger(cols) ||
      !Number.isInteger(rows) ||
      cols < 10 ||
      cols > 500 ||
      rows < 2 ||
      rows > 200
    ) {
      throw new Error("terminal dimensions are invalid");
    }
    this.require(id).resize(cols, rows);
  }

  history(id: string): string {
    return this.require(id).history;
  }

  close(id: string): void {
    this.require(id).close();
  }

  async *stream(id: string): AsyncIterable<string> {
    const session = this.require(id);
    const queue: string[] = [];
    let wake: (() => void) | undefined;
    const listener = (chunk: string) => {
      queue.push(chunk);
      wake?.();
      wake = undefined;
    };
    session.on("output", listener);
    try {
      while (session.record.status === "active" || queue.length) {
        if (!queue.length) {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
        while (queue.length) yield queue.shift()!;
      }
    } finally {
      session.off("output", listener);
    }
  }

  private require(id: string): ManagedTerminal {
    const session = this.sessions.get(id);
    if (!session) throw new Error("terminal session was not found");
    return session;
  }
}

class ManagedTerminal extends EventEmitter {
  readonly record: TerminalRecord;
  history = "";
  private cleaned = false;

  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    cwd: string,
    host: string,
    private readonly maxHistoryBytes: number,
    private readonly onClose?: () => Promise<void>,
  ) {
    super();
    this.record = {
      id: `terminal-${randomUUID()}`,
      cwd,
      host,
      cols: 80,
      rows: 24,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    child.stdout.on("data", (chunk: Buffer) => this.append(chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => this.append(chunk.toString("utf8")));
  }

  write(input: string): void {
    if (this.record.status !== "active") throw new Error("terminal session is closed");
    this.child.stdin.write(input);
  }

  resize(cols: number, rows: number): void {
    if (this.record.status !== "active") throw new Error("terminal session is closed");
    this.record.cols = cols;
    this.record.rows = rows;
    this.child.stdin.write(`stty rows ${rows} cols ${cols}\n`);
  }

  close(): void {
    if (this.record.status === "closed") return;
    this.markClosed();
    this.child.kill();
  }

  markExited(code: number | null, signal: NodeJS.Signals | null): void {
    const error =
      this.record.host !== "local" && (code !== 0 || signal)
        ? `SSH exited with ${code === null ? `signal ${signal}` : `status ${code}`}. Check host key, authentication, and the declared host.`
        : undefined;
    this.markClosed(error);
  }

  markFailed(error: Error): void {
    this.markClosed(
      `${this.record.host === "local" ? "Terminal" : "SSH terminal"} process failed: ${error.message}`,
    );
  }

  markClosed(error?: string): void {
    if (this.record.status === "closed") return;
    if (error) this.record.error = error;
    this.record.status = "closed";
    this.record.closedAt = new Date().toISOString();
    this.emit("output", "");
    if (!this.cleaned) {
      this.cleaned = true;
      void Promise.resolve(this.onClose?.()).catch(() => {});
    }
  }

  private append(chunk: string): void {
    this.history = `${this.history}${chunk}`.slice(-this.maxHistoryBytes);
    this.emit("output", chunk);
  }
}

function spawnTerminal(
  shell: string,
  shellArgs: string[],
  cwd: string,
  host: string,
  injectedEnvironment?: NodeJS.ProcessEnv,
): ChildProcessWithoutNullStreams {
  const environment = { ...safeTerminalEnvironment(), ...(injectedEnvironment ?? {}) };
  if (host !== "local") {
    const remoteCommand = `cd -- ${quoteShellArg(cwd)} && exec ${[shell, ...shellArgs]
      .map(quoteShellArg)
      .join(" ")}`;
    return spawn("ssh", ["-tt", "--", host, "sh", "-lc", remoteCommand], {
      env: environment,
      stdio: "pipe",
    });
  }
  if (process.platform === "linux") {
    environment.TERM ??= "xterm-256color";
    environment.COLORTERM ??= "truecolor";
    const command = [shell, ...shellArgs].map(quoteShellArg).join(" ");
    return spawn("script", ["-qfec", `exec ${command}`, "/dev/null"], {
      cwd,
      env: environment,
      stdio: "pipe",
    });
  }
  return spawn(shell, shellArgs, {
    cwd,
    env: environment,
    stdio: "pipe",
  });
}

function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function safeTerminalEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const key of Object.keys(environment))
    if (/(?:SECRET|TOKEN|PASSWORD|CREDENTIAL|PRIVATE_KEY|AUTH)/iu.test(key))
      delete environment[key];
  return environment;
}
