import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  listWorkspace,
  readWorkspaceFile,
  resolveWorkspacePath,
  searchWorkspace,
} from "./workspace.js";

describe("workspace browser", () => {
  it("lists declared files and reads a text file", async () => {
    const root = await mkdtemp(join(tmpdir(), "flancommand-workspace-"));
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "app.ts"), "export const ready = true;\n");
    const project = { paths: [root] };

    await expect(listWorkspace(project, join(root, "src"))).resolves.toMatchObject({
      path: resolve(root, "src"),
      entries: [{ name: "app.ts", type: "file" }],
    });
    await expect(readWorkspaceFile(project, join(root, "src", "app.ts"))).resolves.toBe(
      "export const ready = true;\n",
    );
  });

  it("rejects paths outside the declared roots", async () => {
    const root = await mkdtemp(join(tmpdir(), "flancommand-workspace-"));
    const project = { paths: [root] };

    expect(() => resolveWorkspacePath(project, "/etc/passwd")).toThrow(
      "outside the project boundary",
    );
  });

  it("ignores a declared root that does not exist yet", async () => {
    const root = await mkdtemp(join(tmpdir(), "flancommand-workspace-"));
    await writeFile(join(root, "README.md"), "ready\n");
    const missing = join(root, "future-file.txt");

    await expect(listWorkspace({ paths: [root, missing] }, root)).resolves.toMatchObject({
      path: root,
      entries: [{ name: "README.md", type: "file" }],
    });
  });

  it("does not follow a symlink out of the declared root", async () => {
    const root = await mkdtemp(join(tmpdir(), "flancommand-workspace-"));
    const outside = await mkdtemp(join(tmpdir(), "flancommand-outside-"));
    await writeFile(join(outside, "secret.txt"), "not for this project");
    await symlink(outside, join(root, "escape"));

    await expect(listWorkspace({ paths: [root] }, join(root, "escape"))).rejects.toThrow(
      "outside the project boundary",
    );
  });

  it("finds declared files by name and text without following symlinks", async () => {
    const root = await mkdtemp(join(tmpdir(), "flancommand-workspace-"));
    await mkdir(join(root, "src"));
    await writeFile(join(root, "README.md"), "The workspace needle is here.\n");
    await writeFile(join(root, "src", "needle.ts"), "export const ready = true;\n");

    await expect(searchWorkspace({ paths: [root] }, "needle")).resolves.toMatchObject({
      matches: [
        { name: "README.md", match: "content" },
        { name: "needle.ts", match: "name" },
      ],
      truncated: false,
    });
  });
});
