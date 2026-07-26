import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createStorageSnapshot, restoreStorageSnapshot } from "./storage-backup.js";

describe("storage backups", () => {
  it("restores metadata and uploads and keeps the replaced root for rollback", async () => {
    const root = await mkdtemp(join(process.env.TMPDIR || "/tmp", "flancommand-storage-test-"));
    const liveRoot = join(root, "live");
    const snapshotRoot = join(root, "snapshot");
    await mkdir(join(liveRoot, "metadata"), { recursive: true });
    await mkdir(join(liveRoot, "uploads"), { recursive: true });
    await writeFile(join(liveRoot, "metadata", "state.json"), '{"version":1}\n');
    await writeFile(join(liveRoot, "uploads", "notes.txt"), "backup me\n");

    const manifest = await createStorageSnapshot(liveRoot, snapshotRoot);
    expect(manifest.entries.map((entry) => entry.path)).toEqual([
      "metadata/state.json",
      "uploads/notes.txt",
    ]);

    await writeFile(join(liveRoot, "metadata", "state.json"), '{"version":99}\n');
    const result = await restoreStorageSnapshot(snapshotRoot, liveRoot);

    await expect(readFile(join(liveRoot, "metadata", "state.json"), "utf8")).resolves.toBe(
      '{"version":1}\n',
    );
    await expect(readFile(join(liveRoot, "uploads", "notes.txt"), "utf8")).resolves.toBe(
      "backup me\n",
    );
    await expect(
      readFile(join(result.previousRoot, "metadata", "state.json"), "utf8"),
    ).resolves.toBe('{"version":99}\n');
  });
});
