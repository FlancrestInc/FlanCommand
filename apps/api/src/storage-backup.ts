import { createHash, randomUUID } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";

export interface StorageSnapshotEntry {
  path: string;
  sizeBytes: number;
  sha256: string;
}

export interface StorageSnapshotManifest {
  version: 1;
  createdAt: string;
  entries: StorageSnapshotEntry[];
}

export interface RestoreResult {
  previousRoot: string;
  manifest: StorageSnapshotManifest;
}

const manifestName = "manifest.json";
const payloadName = "payload";

function relativePath(value: string): string {
  return value.split(sep).join("/");
}

function assertSeparateRoots(sourceRoot: string, destinationRoot: string): void {
  if (
    sourceRoot === destinationRoot ||
    destinationRoot.startsWith(`${sourceRoot}${sep}`) ||
    sourceRoot.startsWith(`${destinationRoot}${sep}`)
  )
    throw new Error("Backup and storage roots must be separate directories.");
}

function assertSafeEntryPath(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    !value ||
    value.startsWith("/") ||
    value.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Storage backup contains an unsafe file path.");
}

async function filePaths(root: string, current = ""): Promise<string[]> {
  const directory = join(root, current);
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Storage backup refuses symlink: ${path}`);
    if (entry.isDirectory()) paths.push(...(await filePaths(root, path)));
    else if (entry.isFile()) paths.push(path);
    else throw new Error(`Storage backup refuses special file: ${path}`);
  }
  return paths;
}

async function checksum(path: string): Promise<{ sizeBytes: number; sha256: string }> {
  const content = await readFile(path);
  return {
    sizeBytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

function parseManifest(value: unknown): StorageSnapshotManifest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Storage backup manifest is invalid.");
  const record = value as Record<string, unknown>;
  if (
    record.version !== 1 ||
    typeof record.createdAt !== "string" ||
    !Array.isArray(record.entries)
  )
    throw new Error("Storage backup manifest is invalid.");
  const entries = record.entries.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      throw new Error("Storage backup manifest entry is invalid.");
    const item = entry as Record<string, unknown>;
    assertSafeEntryPath(item.path);
    const sizeBytes = item.sizeBytes;
    const sha256 = item.sha256;
    if (
      typeof sizeBytes !== "number" ||
      !Number.isSafeInteger(sizeBytes) ||
      sizeBytes < 0 ||
      typeof sha256 !== "string" ||
      !/^[a-f0-9]{64}$/u.test(sha256)
    )
      throw new Error("Storage backup manifest entry is invalid.");
    return { path: item.path, sizeBytes, sha256 };
  });
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length)
    throw new Error("Storage backup manifest contains duplicate paths.");
  return { version: 1, createdAt: record.createdAt, entries };
}

export async function createStorageSnapshot(
  sourceRootInput: string,
  destinationRootInput: string,
): Promise<StorageSnapshotManifest> {
  const sourceRoot = resolve(sourceRootInput);
  const destinationRoot = resolve(destinationRootInput);
  assertSeparateRoots(sourceRoot, destinationRoot);
  const sourceStat = await lstat(sourceRoot);
  if (!sourceStat.isDirectory()) throw new Error("Storage root must be a directory.");
  await mkdir(dirname(destinationRoot), { recursive: true, mode: 0o700 });
  await mkdir(destinationRoot, { mode: 0o700 });
  try {
    const entries: StorageSnapshotEntry[] = [];
    for (const path of await filePaths(sourceRoot)) {
      const sourcePath = join(sourceRoot, path);
      const destinationPath = join(destinationRoot, payloadName, path);
      await mkdir(dirname(destinationPath), { recursive: true, mode: 0o700 });
      await copyFile(sourcePath, destinationPath);
      const file = await checksum(sourcePath);
      entries.push({ path: relativePath(path), ...file });
    }
    const manifest: StorageSnapshotManifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      entries,
    };
    await writeFile(join(destinationRoot, manifestName), `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    return manifest;
  } catch (error) {
    await rm(destinationRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function restoreStorageSnapshot(
  snapshotRootInput: string,
  targetRootInput: string,
): Promise<RestoreResult> {
  const snapshotRoot = resolve(snapshotRootInput);
  const targetRoot = resolve(targetRootInput);
  assertSeparateRoots(snapshotRoot, targetRoot);
  const manifest = parseManifest(
    JSON.parse(await readFile(join(snapshotRoot, manifestName), "utf8")),
  );
  const stagingRoot = join(dirname(targetRoot), `.${basename(targetRoot)}.restore-${randomUUID()}`);
  const previousRoot = join(
    dirname(targetRoot),
    `.${basename(targetRoot)}.previous-${randomUUID()}`,
  );
  await mkdir(stagingRoot, { recursive: true, mode: 0o700 });
  try {
    for (const entry of manifest.entries) {
      const sourcePath = join(snapshotRoot, payloadName, entry.path);
      const sourceStat = await lstat(sourcePath);
      if (!sourceStat.isFile()) throw new Error(`Storage backup file is missing: ${entry.path}`);
      const file = await checksum(sourcePath);
      if (file.sizeBytes !== entry.sizeBytes || file.sha256 !== entry.sha256)
        throw new Error(`Storage backup checksum failed: ${entry.path}`);
      const destinationPath = join(stagingRoot, entry.path);
      await mkdir(dirname(destinationPath), { recursive: true, mode: 0o700 });
      await copyFile(sourcePath, destinationPath);
    }
    let movedPrevious = false;
    try {
      try {
        await rename(targetRoot, previousRoot);
        movedPrevious = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      await rename(stagingRoot, targetRoot);
    } catch (error) {
      if (movedPrevious) await rename(previousRoot, targetRoot).catch(() => undefined);
      throw error;
    }
    return { previousRoot, manifest };
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}
