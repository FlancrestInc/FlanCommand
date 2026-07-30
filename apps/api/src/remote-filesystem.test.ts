import { describe, expect, it } from "vitest";

import {
  listRemoteFilesystem,
  parseRemoteFilesystemOutput,
  type RemoteFilesystemRunner,
} from "./remote-filesystem.js";

describe("remote filesystem browser", () => {
  it("parses bounded NUL-delimited Gospel entries with directories first", () => {
    expect(
      parseRemoteFilesystemOutput(
        Buffer.from(
          [
            "f:/home/ryan/projects/flancommand/README.md",
            "d:/home/ryan/projects/flancommand/apps",
            "l:/home/ryan/projects/flancommand/current",
          ].join("\0") + "\0",
        ),
        "/home/ryan/projects/flancommand",
      ),
    ).toEqual([
      { name: "apps", path: "/home/ryan/projects/flancommand/apps", type: "directory" },
      { name: "README.md", path: "/home/ryan/projects/flancommand/README.md", type: "file" },
      { name: "current", path: "/home/ryan/projects/flancommand/current", type: "symlink" },
    ]);
  });

  it("runs the listing against the declared Gospel host and path", async () => {
    const calls: Array<{ host: string; path: string }> = [];
    const runner: RemoteFilesystemRunner = {
      async run(host, path) {
        calls.push({ host, path });
        return Buffer.from(`d:${path}/apps\0`);
      },
    };

    await expect(listRemoteFilesystem(runner, "gospel", "/home/ryan/projects")).resolves.toEqual({
      host: "gospel",
      path: "/home/ryan/projects",
      entries: [
        { name: "apps", path: "/home/ryan/projects/apps", type: "directory" },
      ],
    });
    expect(calls).toEqual([{ host: "gospel", path: "/home/ryan/projects" }]);
  });

  it("rejects unsafe paths before invoking the remote runner", async () => {
    const runner: RemoteFilesystemRunner = { run: async () => Buffer.from("") };
    await expect(listRemoteFilesystem(runner, "gospel", "relative/path")).rejects.toThrow(
      "absolute",
    );
  });
});
