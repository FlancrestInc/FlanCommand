import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { Project } from "./policy.js";

export interface WorkspaceEntry {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink";
  sizeBytes?: number;
}

export interface WorkspaceListing {
  path: string;
  entries: WorkspaceEntry[];
}

export interface WorkspaceSearchMatch {
  name: string;
  path: string;
  match: "name" | "content";
  preview?: string;
}

export interface WorkspaceSearchResults {
  query: string;
  matches: WorkspaceSearchMatch[];
  truncated: boolean;
}

const MAX_ENTRIES = 500;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_SEARCH_RESULTS = 100;
const MAX_SEARCH_DEPTH = 12;

export function resolveWorkspacePath(project: Pick<Project, "paths">, requested?: string): string {
  if (!project.paths.length) throw new Error("project has no declared workspace paths");
  const candidate = resolve(requested || project.paths[0]!);
  if (!project.paths.some((root) => isWithin(candidate, resolve(root))))
    throw new Error("path is outside the project boundary");
  return candidate;
}

export async function listWorkspace(
  project: Pick<Project, "paths">,
  requested?: string,
): Promise<WorkspaceListing> {
  const candidate = resolveWorkspacePath(project, requested);
  const safePath = await ensureRealPathWithin(project, candidate);
  const entries = await readdir(safePath, { withFileTypes: true });
  const limited = entries.slice(0, MAX_ENTRIES);
  const mapped: WorkspaceEntry[] = [];
  for (const entry of limited) {
    const path = resolve(safePath, entry.name);
    if (entry.isSymbolicLink()) {
      mapped.push({ name: entry.name, path, type: "symlink" });
      continue;
    }
    if (entry.isDirectory()) mapped.push({ name: entry.name, path, type: "directory" });
    else if (entry.isFile())
      mapped.push({ name: entry.name, path, type: "file", sizeBytes: (await stat(path)).size });
  }
  mapped.sort(
    (left, right) =>
      Number(right.type === "directory") - Number(left.type === "directory") ||
      left.name.localeCompare(right.name),
  );
  return { path: safePath, entries: mapped };
}

export async function readWorkspaceFile(
  project: Pick<Project, "paths">,
  requested: string,
): Promise<string> {
  const candidate = resolveWorkspacePath(project, requested);
  const safePath = await ensureRealPathWithin(project, candidate);
  const metadata = await stat(safePath);
  if (!metadata.isFile()) throw new Error("workspace path is not a file");
  if (metadata.size > MAX_FILE_BYTES) throw new Error("workspace file is too large to preview");
  const content = await readFile(safePath);
  if (content.includes(0)) throw new Error("workspace file is not a text file");
  return content.toString("utf8");
}

export async function searchWorkspace(
  project: Pick<Project, "paths">,
  query: string,
): Promise<WorkspaceSearchResults> {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) throw new Error("workspace search text is required");
  const matches: WorkspaceSearchMatch[] = [];
  let truncated = false;
  const roots = await Promise.all(
    project.paths.map(async (root) => {
      try {
        return await realpath(root);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
      }
    }),
  );

  const addMatch = (match: WorkspaceSearchMatch): void => {
    if (matches.length >= MAX_SEARCH_RESULTS) {
      truncated = true;
      return;
    }
    matches.push(match);
  };
  const visit = async (directory: string, depth: number): Promise<void> => {
    if (truncated) return;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (truncated) return;
      const path = resolve(directory, entry.name);
      const nameMatches = entry.name.toLocaleLowerCase().includes(normalizedQuery);
      if (entry.isSymbolicLink()) {
        if (nameMatches) addMatch({ name: entry.name, path, match: "name" });
        continue;
      }
      if (entry.isDirectory()) {
        if (nameMatches) addMatch({ name: entry.name, path, match: "name" });
        if (depth < MAX_SEARCH_DEPTH) await visit(path, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (nameMatches) {
        addMatch({ name: entry.name, path, match: "name" });
        continue;
      }
      const metadata = await stat(path);
      if (metadata.size > MAX_FILE_BYTES) continue;
      const content = await readFile(path);
      if (content.includes(0)) continue;
      const text = content.toString("utf8");
      const contentIndex = text.toLocaleLowerCase().indexOf(normalizedQuery);
      if (contentIndex < 0) continue;
      const lineStart = text.lastIndexOf("\n", contentIndex) + 1;
      const lineEnd = text.indexOf("\n", contentIndex);
      addMatch({
        name: entry.name,
        path,
        match: "content",
        preview: text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd).trim(),
      });
    }
  };

  for (const root of roots.filter((value): value is string => Boolean(value))) {
    await visit(root, 0);
    if (truncated) break;
  }
  return { query: query.trim(), matches, truncated };
}

async function ensureRealPathWithin(
  project: Pick<Project, "paths">,
  candidate: string,
): Promise<string> {
  const safePath = await realpath(candidate);
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
  if (!roots.some((root) => isWithin(safePath, root)))
    throw new Error("path is outside the project boundary");
  return safePath;
}

function isWithin(candidate: string, root: string): boolean {
  const remainder = relative(root, candidate);
  return remainder === "" || (!remainder.startsWith("..") && !remainder.startsWith("/"));
}
