import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export class JsonMetadataStore<T> {
  readonly path: string;
  value: T;
  private initialized = false;
  private writeQueue = Promise.resolve();

  constructor(
    path: string,
    private readonly defaults: T,
  ) {
    this.path = resolve(path);
    this.value = defaults;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    try {
      this.value = JSON.parse(await readFile(this.path, "utf8")) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.save(this.defaults);
    }
  }

  async save(value: T): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      const temporary = `${this.path}.${process.pid}.tmp`;
      await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      await rename(temporary, this.path);
      this.value = value;
    });
    this.writeQueue = operation.catch(() => undefined);
    await operation;
  }
}
