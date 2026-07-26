import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEditProposal, hashContent, applyEditProposal } from "./edit-proposal.js";

describe("edit proposals", () => {
  it("captures exact before and after hashes", async () => {
    const root = await mkdtemp(join(tmpdir(), "flancommand-edit-"));
    const path = join(root, "app.txt");
    await writeFile(path, "before\n");
    const proposal = await createEditProposal({ paths: [root] }, path, "after\n");

    expect(proposal.beforeHash).toBe(hashContent("before\n"));
    expect(proposal.afterHash).toBe(hashContent("after\n"));
    expect(proposal.status).toBe("pending");
  });

  it("writes only when the file still has the proposed before hash", async () => {
    const root = await mkdtemp(join(tmpdir(), "flancommand-edit-"));
    const path = join(root, "app.txt");
    await writeFile(path, "before\n");
    const proposal = await createEditProposal({ paths: [root] }, path, "after\n");

    await expect(applyEditProposal({ paths: [root] }, proposal)).resolves.toBe("after\n");
    await expect(createEditProposal({ paths: [root] }, path, "new\n")).resolves.toMatchObject({
      beforeHash: hashContent("after\n"),
    });
  });

  it("rejects a stale proposal without overwriting the newer file", async () => {
    const root = await mkdtemp(join(tmpdir(), "flancommand-edit-"));
    const path = join(root, "app.txt");
    await writeFile(path, "before\n");
    const proposal = await createEditProposal({ paths: [root] }, path, "after\n");
    await writeFile(path, "changed elsewhere\n");

    await expect(applyEditProposal({ paths: [root] }, proposal)).rejects.toThrow("changed since");
    await expect(createEditProposal({ paths: [root] }, path, "ignored\n")).resolves.toMatchObject({
      beforeHash: hashContent("changed elsewhere\n"),
    });
  });

  it("creates a missing file only when it stays absent", async () => {
    const root = await mkdtemp(join(tmpdir(), "flancommand-edit-"));
    const missingRoot = join(root, "future-target.txt");
    const path = join(root, "new.txt");
    const proposal = await createEditProposal({ paths: [root, missingRoot] }, path, "created\n");

    expect(proposal.beforeExists).toBe(false);
    expect(proposal.beforeHash).toBe(hashContent(""));
    await expect(applyEditProposal({ paths: [root] }, proposal)).resolves.toBe("created\n");

    const second = await createEditProposal({ paths: [root] }, join(root, "later.txt"), "later\n");
    await writeFile(join(root, "later.txt"), "someone else\n");
    await expect(applyEditProposal({ paths: [root] }, second)).rejects.toThrow("changed since");
  });
});
