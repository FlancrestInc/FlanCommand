import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("@flancommand/config runtime entry point", () => {
  it("loads through the package export after the workspace build", async () => {
    await execFileAsync("npm", ["run", "build"], { cwd: process.cwd() });

    const { stdout } = await execFileAsync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "const { parseEnv } = await import('@flancommand/config'); console.log(parseEnv({}).probeOutputDir);",
      ],
      { cwd: process.cwd() },
    );

    expect(stdout.trim()).toBe("probe-output");
  }, 60_000);
});
