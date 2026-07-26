import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { FileStore } from "./file-store.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("safe file store", () => {
  it("stores bounded files with a stable hash and safe key", async () => {
    const root = await mkdtemp(join(tmpdir(), "flancommand-files-"));
    roots.push(root);
    const store = new FileStore({ root });
    const first = await store.put({
      name: "../notes<script>.md",
      mimeType: "text/markdown",
      content: Buffer.from("# hello"),
    });
    const second = await store.put({
      name: "copy.md",
      mimeType: "text/markdown",
      content: Buffer.from("# hello"),
    });
    expect(first.storageKey).not.toContain("..");
    expect(first.safeName).toBe("notes-script-.md");
    expect(first.hash).toBe(second.hash);
    expect(first.id).toBe(second.id);
    expect(await readFile(join(root, first.storageKey), "utf8")).toBe("# hello");
  });

  it("rejects unsafe content types and oversized files", async () => {
    const root = await mkdtemp(join(tmpdir(), "flancommand-files-"));
    roots.push(root);
    const store = new FileStore({ root, maxBytes: 4 });
    await expect(
      store.put({ name: "page.html", mimeType: "text/html", content: Buffer.from("ok") }),
    ).rejects.toThrow(/type/i);
    await expect(
      store.put({ name: "notes.txt", mimeType: "text/plain", content: Buffer.from("12345") }),
    ).rejects.toThrow(/large/i);
  });

  it("removes expired files without touching other files", async () => {
    const root = await mkdtemp(join(tmpdir(), "flancommand-files-"));
    roots.push(root);
    const store = new FileStore({ root, now: () => new Date("2026-01-02T00:00:00.000Z") });
    const expired = await store.put({
      name: "old.txt",
      mimeType: "text/plain",
      content: Buffer.from("old"),
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const current = await store.put({
      name: "new.txt",
      mimeType: "text/plain",
      content: Buffer.from("new"),
    });
    expect(await store.removeExpired()).toEqual([expired.id]);
    expect(await store.get(expired.id)).toBeUndefined();
    expect(await store.get(current.id)).toBeDefined();
  });
});
