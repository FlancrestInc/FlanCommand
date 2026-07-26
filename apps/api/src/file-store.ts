import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";

export interface FileRecord {
  id: string;
  name: string;
  safeName: string;
  mimeType: string;
  sizeBytes: number;
  hash: string;
  storageKey: string;
  projectId?: string;
  sessionId?: string;
  uploadedAt: string;
  expiresAt?: string;
}

export interface PutFileInput {
  name: string;
  mimeType: string;
  content: Buffer;
  projectId?: string;
  sessionId?: string;
  expiresAt?: string;
}

const TEXT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/javascript",
  "text/javascript",
  "text/css",
  "text/xml",
]);
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const ALLOWED_TYPES = new Set([...TEXT_TYPES, ...IMAGE_TYPES, "application/pdf"]);

export class FileStore {
  private readonly records = new Map<string, FileRecord>();
  private readonly byHash = new Map<string, string>();
  private readonly root: string;
  private readonly maxBytes: number;
  private readonly now: () => Date;
  private readonly metadataPath?: string;
  private initialized = false;

  constructor(options: {
    root: string;
    metadataPath?: string;
    maxBytes?: number;
    now?: () => Date;
  }) {
    this.root = resolve(options.root);
    this.maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
    this.now = options.now ?? (() => new Date());
    this.metadataPath = options.metadataPath ? resolve(options.metadataPath) : undefined;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    if (!this.metadataPath) return;
    try {
      const records = JSON.parse(await readFile(this.metadataPath, "utf8")) as FileRecord[];
      for (const record of records) {
        if (record && typeof record.id === "string" && typeof record.storageKey === "string") {
          this.records.set(record.id, record);
          this.byHash.set(record.hash, record.id);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.persist();
    }
  }

  async put(input: PutFileInput): Promise<FileRecord> {
    if (!ALLOWED_TYPES.has(input.mimeType)) throw new Error("File type is not allowed.");
    if (input.content.byteLength > this.maxBytes) throw new Error("File is too large.");
    const hash = createHash("sha256").update(input.content).digest("hex");
    const existingId = this.byHash.get(hash);
    if (existingId) {
      const existing = this.records.get(existingId);
      if (existing) return existing;
    }
    const id = `file-${randomUUID()}`;
    const safeName = this.safeName(input.name);
    const storageKey = `uploads/${id}${extname(safeName).toLowerCase()}`;
    const absolute = this.resolveStorageKey(storageKey);
    await mkdir(resolve(this.root, "uploads"), { recursive: true, mode: 0o700 });
    await writeFile(absolute, input.content, { mode: 0o600, flag: "wx" });
    const record: FileRecord = {
      id,
      name: input.name,
      safeName,
      mimeType: input.mimeType,
      sizeBytes: input.content.byteLength,
      hash,
      storageKey,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      uploadedAt: this.now().toISOString(),
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    };
    this.records.set(id, record);
    this.byHash.set(hash, id);
    await this.persist();
    return record;
  }

  list(filter: { projectId?: string; sessionId?: string; search?: string } = {}): FileRecord[] {
    const query = filter.search?.toLowerCase();
    return [...this.records.values()].filter(
      (record) =>
        (!filter.projectId || record.projectId === filter.projectId) &&
        (!filter.sessionId || record.sessionId === filter.sessionId) &&
        (!query || record.name.toLowerCase().includes(query)),
    );
  }

  get(id: string): FileRecord | undefined {
    return this.records.get(id);
  }

  async content(id: string): Promise<Buffer | undefined> {
    const record = this.records.get(id);
    if (!record) return undefined;
    const { readFile } = await import("node:fs/promises");
    return readFile(this.resolveStorageKey(record.storageKey));
  }

  async remove(id: string): Promise<boolean> {
    const record = this.records.get(id);
    if (!record) return false;
    await rm(this.resolveStorageKey(record.storageKey), { force: true });
    this.records.delete(id);
    this.byHash.delete(record.hash);
    await this.persist();
    return true;
  }

  async removeExpired(): Promise<string[]> {
    const now = this.now().getTime();
    const removed: string[] = [];
    for (const record of this.records.values()) {
      if (record.expiresAt && Date.parse(record.expiresAt) <= now && (await this.remove(record.id)))
        removed.push(record.id);
    }
    return removed;
  }

  isPreviewable(record: FileRecord): boolean {
    return TEXT_TYPES.has(record.mimeType) || IMAGE_TYPES.has(record.mimeType);
  }

  private resolveStorageKey(storageKey: string): string {
    const absolute = resolve(this.root, storageKey);
    if (absolute !== this.root && !absolute.startsWith(`${this.root}/`))
      throw new Error("Storage path escapes the file root.");
    return absolute;
  }

  private async persist(): Promise<void> {
    if (!this.metadataPath) return;
    await mkdir(dirname(this.metadataPath), { recursive: true, mode: 0o700 });
    const temporary = `${this.metadataPath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify([...this.records.values()], null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporary, this.metadataPath);
  }

  private safeName(value: string): string {
    const original = basename(value)
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^\.+/, "")
      .slice(0, 120);
    return original || "upload";
  }
}
