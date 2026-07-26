import { mkdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

export type CredentialInjectionMethod = "environment" | "stdin" | "temporary_file" | "ssh_agent";

export interface CredentialReference {
  id: string;
  projectId: string;
  name: string;
  provider: string;
  externalSecretId: string;
  purpose: string;
  allowedHosts: string[];
  injectionMethod: CredentialInjectionMethod;
  createdAt: string;
  updatedAt: string;
  lastValidatedAt?: string;
}

export interface CredentialProvider {
  readonly name: string;
  resolve(reference: CredentialReference): Promise<string>;
  validate?(reference: CredentialReference): Promise<void>;
}

type CommandRunner = (command: string, args: string[]) => Promise<string>;

const runCommand: CommandRunner = async (command, args) => {
  const result = await promisify(execFile)(command, args, {
    env: process.env,
    maxBuffer: 1_048_576,
  });
  return result.stdout;
};

export class BwsCliCredentialProvider implements CredentialProvider {
  readonly name = "bitwarden-secrets-manager";

  constructor(private readonly runner: CommandRunner = runCommand) {}

  async resolve(reference: CredentialReference): Promise<string> {
    let output: unknown;
    try {
      output = JSON.parse(await this.runner("bws", ["secret", "get", reference.externalSecretId]));
    } catch {
      throw new Error("Bitwarden could not resolve this credential reference");
    }
    if (
      typeof output !== "object" ||
      output === null ||
      typeof (output as { value?: unknown }).value !== "string" ||
      !(output as { value: string }).value
    )
      throw new Error("Bitwarden returned no usable credential value");
    return (output as { value: string }).value;
  }

  async validate(reference: CredentialReference): Promise<void> {
    await this.resolve(reference);
  }
}

export interface CredentialLease {
  path: string;
  close(): Promise<void>;
}

export interface CredentialHealth {
  id: string;
  name: string;
  provider: string;
  status: "healthy" | "unavailable";
  checkedAt: string;
  error?: string;
}

export class CredentialBroker {
  private readonly references = new Map<string, CredentialReference>();

  constructor(
    references: CredentialReference[] = [],
    private readonly providers: ReadonlyMap<string, CredentialProvider> = new Map(),
  ) {
    for (const reference of references) this.references.set(reference.id, reference);
  }

  list(projectId?: string): CredentialReference[] {
    return [...this.references.values()].filter(
      (reference) => !projectId || reference.projectId === projectId,
    );
  }

  get(id: string): CredentialReference | undefined {
    return this.references.get(id);
  }

  set(reference: CredentialReference): void {
    this.references.set(reference.id, reference);
  }

  remove(id: string): boolean {
    return this.references.delete(id);
  }

  async validate(id: string): Promise<void> {
    const reference = this.require(id);
    const provider = this.provider(reference);
    if (provider.validate) await provider.validate(reference);
    else await provider.resolve(reference);
    reference.lastValidatedAt = new Date().toISOString();
  }

  async health(projectId?: string): Promise<CredentialHealth[]> {
    const checkedAt = new Date().toISOString();
    return Promise.all(
      this.list(projectId).map(async (reference) => {
        try {
          await this.validate(reference.id);
          return {
            id: reference.id,
            name: reference.name,
            provider: reference.provider,
            status: "healthy" as const,
            checkedAt,
          };
        } catch {
          return {
            id: reference.id,
            name: reference.name,
            provider: reference.provider,
            status: "unavailable" as const,
            checkedAt,
            error: "Credential provider could not resolve this reference.",
          };
        }
      }),
    );
  }

  async resolve(id: string, options: { host?: string } = {}): Promise<string> {
    const reference = this.require(id);
    if (
      options.host &&
      reference.allowedHosts.length &&
      !reference.allowedHosts.includes(options.host)
    )
      throw new Error("credential is not approved for this host");
    return this.provider(reference).resolve(reference);
  }

  async openLease(
    id: string,
    options: { host?: string; directory?: string } = {},
  ): Promise<CredentialLease> {
    const reference = this.require(id);
    if (
      options.host &&
      reference.allowedHosts.length &&
      !reference.allowedHosts.includes(options.host)
    )
      throw new Error("credential is not approved for this host");
    if (reference.injectionMethod !== "temporary_file")
      throw new Error(
        `credential injection method ${reference.injectionMethod} is not implemented`,
      );
    const value = await this.resolve(id, options);
    const directory = resolve(options.directory ?? "/tmp", ".flancommand-credentials");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const path = resolve(directory, `${randomUUID()}.secret`);
    await writeFile(path, value, { encoding: "utf8", mode: 0o600, flag: "wx" });
    return {
      path,
      close: async () => {
        await rm(path, { force: true });
      },
    };
  }

  private require(id: string): CredentialReference {
    const reference = this.references.get(id);
    if (!reference) throw new Error("credential reference was not found");
    return reference;
  }

  private provider(reference: CredentialReference): CredentialProvider {
    const provider = this.providers.get(reference.provider);
    if (!provider) throw new Error(`credential provider ${reference.provider} is not configured`);
    return provider;
  }
}
