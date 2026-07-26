import { createHash } from "node:crypto";
import { lstat, realpath, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Project } from "./policy.js";
import { readWorkspaceFile, resolveWorkspacePath } from "./workspace.js";

export type EditProposalStatus = "pending" | "approved" | "rejected" | "stale";

export interface EditProposal {
  id: string;
  projectId?: string;
  path: string;
  beforeHash: string;
  beforeExists?: boolean;
  afterHash: string;
  beforeText: string;
  afterText: string;
  status: EditProposalStatus;
  createdAt: string;
  decidedAt?: string;
}

const MAX_EDIT_BYTES = 512 * 1024;

export function hashContent(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export async function createEditProposal(
  project: Pick<Project, "paths">,
  path: string,
  afterText: string,
  projectId?: string,
): Promise<EditProposal> {
  if (Buffer.byteLength(afterText, "utf8") > MAX_EDIT_BYTES)
    throw new Error("proposed file is too large");
  const safePath = resolveWorkspacePath(project, path);
  const beforeExists = await fileExistsInsideProject(project, safePath);
  const beforeText = beforeExists ? await readWorkspaceFile(project, safePath) : "";
  if (beforeText === afterText) throw new Error("proposed file has no changes");
  return {
    id: `edit-${createHash("sha256").update(`${safePath}\0${Date.now()}\0${afterText}`).digest("hex").slice(0, 16)}`,
    ...(projectId ? { projectId } : {}),
    path: safePath,
    beforeHash: hashContent(beforeText),
    beforeExists,
    afterHash: hashContent(afterText),
    beforeText,
    afterText,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
}

export async function applyEditProposal(
  project: Pick<Project, "paths">,
  proposal: EditProposal,
): Promise<string> {
  const beforeExists = proposal.beforeExists !== false;
  if (beforeExists) {
    const current = await readWorkspaceFile(project, proposal.path);
    if (hashContent(current) !== proposal.beforeHash)
      throw new Error("file changed since this proposal was created");
  } else if (await fileExistsInsideProject(project, proposal.path)) {
    throw new Error("file changed since this proposal was created");
  }
  const safePath = resolveWorkspacePath(project, proposal.path);
  await writeFile(safePath, proposal.afterText, { encoding: "utf8", mode: 0o600 });
  return proposal.afterText;
}

async function fileExistsInsideProject(
  project: Pick<Project, "paths">,
  path: string,
): Promise<boolean> {
  const safePath = resolveWorkspacePath(project, path);
  const parent = await realpath(dirname(safePath));
  const roots = (
    await Promise.all(
      project.paths.map(async (root) => {
        try {
          return await realpath(root);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
          throw error;
        }
      }),
    )
  ).filter((root): root is string => Boolean(root));
  if (!roots.some((root) => parent === root || parent.startsWith(`${root}/`)))
    throw new Error("path is outside the project boundary");
  try {
    return (await lstat(safePath)).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
