import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TerminalManager } from "./terminal.js";

describe("terminal manager", () => {
  it("keeps shell sessions isolated and streams command output", async () => {
    const root = await mkdtemp(join(tmpdir(), "flancommand-terminal-"));
    const manager = new TerminalManager({ shell: "/bin/sh", shellArgs: ["-i"] });
    const first = manager.create(root);
    const second = manager.create(root);

    expect(first.id).not.toBe(second.id);
    const output = manager.stream(first.id)[Symbol.asyncIterator]();
    manager.write(first.id, "printf 'terminal-ok\\n'\n");
    let outputText = "";
    for (let index = 0; index < 10 && !outputText.includes("terminal-ok"); index++) {
      const chunk = await output.next();
      outputText += String(chunk.value ?? "");
    }
    expect(outputText).toContain("terminal-ok");
    expect(manager.get(first.id)?.cwd).toBe(root);

    manager.close(first.id);
    manager.close(second.id);
  });

  it("rejects input after a session closes", () => {
    const manager = new TerminalManager({ shell: "/bin/sh", shellArgs: ["-i"] });
    const session = manager.create(process.cwd());
    manager.close(session.id);

    expect(() => manager.write(session.id, "echo no\n")).toThrow("terminal session is closed");
  });

  it("allocates a tty for local shell sessions", async () => {
    const manager = new TerminalManager({ shell: "/bin/sh", shellArgs: ["-i"] });
    const session = manager.create(process.cwd());
    const output = manager.stream(session.id)[Symbol.asyncIterator]();
    manager.write(session.id, "test -t 0 && printf 'tty-yes\\n' || printf 'tty-no\\n'\n");

    await expect(output.next()).resolves.toMatchObject({
      value: expect.stringContaining("tty-yes"),
    });
    manager.close(session.id);
  });

  it("updates the terminal size and rejects unsafe dimensions", async () => {
    const manager = new TerminalManager({ shell: "/bin/sh", shellArgs: ["-i"] });
    const session = manager.create(process.cwd());
    manager.resize(session.id, 120, 40);
    const output = manager.stream(session.id)[Symbol.asyncIterator]();
    manager.write(session.id, "stty size; printf 'size-ok\\n'\n");

    let outputText = "";
    for (let index = 0; index < 12 && !outputText.includes("size-ok"); index++) {
      const chunk = await output.next();
      outputText += String(chunk.value ?? "");
    }
    expect(outputText).toContain("stty rows 40 cols 120");
    expect(outputText).toContain("size-ok");
    expect(() => manager.resize(session.id, 1, 40)).toThrow("terminal dimensions are invalid");
    manager.close(session.id);
  });

  it("records an actionable error when a remote terminal exits during launch", async () => {
    const manager = new TerminalManager({
      shell: "/bin/sh",
      shellArgs: ["-c", "exit 7"],
      spawnProcess: (_shell, shellArgs, cwd) => spawn("/bin/sh", shellArgs, { cwd, stdio: "pipe" }),
    });
    const session = manager.create(process.cwd(), "gospel");

    for (let index = 0; index < 20 && manager.get(session.id)?.status !== "closed"; index += 1)
      await new Promise((resolve) => setTimeout(resolve, 10));

    expect(manager.get(session.id)).toMatchObject({
      status: "closed",
      error: expect.stringContaining("SSH exited with status 7"),
    });
  });

  it("passes a credential file environment value and cleans it on close", async () => {
    let environment: NodeJS.ProcessEnv | undefined;
    let cleaned = false;
    const root = await mkdtemp(join(tmpdir(), "flancommand-terminal-"));
    const manager = new TerminalManager({
      shell: "/bin/sh",
      shellArgs: ["-i"],
      spawnProcess: (_shell, _shellArgs, cwd, _host, processEnvironment) => {
        environment = processEnvironment;
        return spawn("/bin/sh", ["-i"], { cwd, env: processEnvironment, stdio: "pipe" });
      },
    });
    const session = manager.create(root, "local", {
      environment: { FLANCOMMAND_CREDENTIAL_FILE: "/tmp/credential-file" },
      onClose: async () => {
        cleaned = true;
      },
    });

    expect(environment).toMatchObject({ FLANCOMMAND_CREDENTIAL_FILE: "/tmp/credential-file" });
    manager.close(session.id);
    expect(cleaned).toBe(true);
  });
});
