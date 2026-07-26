import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { JsonMetadataStore } from "./metadata-store.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("JSON metadata store", () => {
  it("writes atomically and rehydrates state", async () => {
    const root = await mkdtemp(join(tmpdir(), "flancommand-meta-"));
    roots.push(root);
    const path = join(root, "metadata.json");
    const first = new JsonMetadataStore(path, { version: 1, value: "saved" });
    await first.init();
    await first.save({ version: 1, value: "updated" });
    const second = new JsonMetadataStore(path, { version: 1, value: "default" });
    await second.init();
    expect(second.value).toEqual({ version: 1, value: "updated" });
    expect(await readFile(path, "utf8")).toContain("updated");
  });
});
