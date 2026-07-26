import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BwsCliCredentialProvider,
  CredentialBroker,
  type CredentialProvider,
  type CredentialReference,
} from "./credential-broker.js";

const reference: CredentialReference = {
  id: "credential-1",
  projectId: "project-local",
  name: "Gospel SSH",
  provider: "test",
  externalSecretId: "secret-reference-1",
  purpose: "SSH access from Gospel",
  allowedHosts: ["gospel"],
  injectionMethod: "temporary_file",
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
};

const provider: CredentialProvider = {
  name: "test",
  resolve: async () => "super-secret-value",
};

describe("credential broker", () => {
  it("resolves a Bitwarden secret through the CLI without putting the access token in args", async () => {
    const calls: string[][] = [];
    const provider = new BwsCliCredentialProvider(async (command, args) => {
      calls.push([command, ...args]);
      return JSON.stringify({ id: "secret-reference-1", value: "secret-value" });
    });

    await expect(provider.resolve(reference)).resolves.toBe("secret-value");
    expect(calls).toEqual([["bws", "secret", "get", "secret-reference-1"]]);
  });

  it("lists references without exposing a resolved value", () => {
    const broker = new CredentialBroker([reference], new Map([["test", provider]]));

    expect(broker.list("project-local")).toEqual([reference]);
    expect(JSON.stringify(broker.list("project-local"))).not.toContain("super-secret");
  });

  it("creates a restrictive temporary-file lease and removes it", async () => {
    const root = await mkdtemp(join(tmpdir(), "flancommand-credential-"));
    const broker = new CredentialBroker([reference], new Map([["test", provider]]));

    const lease = await broker.openLease(reference.id, { host: "gospel", directory: root });
    expect(await readFile(lease.path, "utf8")).toBe("super-secret-value");
    expect((await stat(lease.path)).mode & 0o777).toBe(0o600);
    await lease.close();
    await expect(stat(lease.path)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a reference outside its approved host scope", async () => {
    const broker = new CredentialBroker([reference], new Map([["test", provider]]));

    await expect(broker.openLease(reference.id, { host: "barnabas" })).rejects.toThrow(
      "credential is not approved for this host",
    );
  });

  it("reports provider health without exposing resolved values", async () => {
    const unavailable: CredentialReference = {
      ...reference,
      id: "credential-down",
      provider: "down",
    };
    const broker = new CredentialBroker(
      [reference, unavailable],
      new Map([
        ["test", provider],
        [
          "down",
          {
            name: "down",
            resolve: async () => {
              throw new Error("provider secret should stay private");
            },
          },
        ],
      ]),
    );

    const health = await broker.health();
    expect(health).toEqual([
      expect.objectContaining({ id: "credential-1", status: "healthy" }),
      expect.objectContaining({ id: "credential-down", status: "unavailable" }),
    ]);
    expect(JSON.stringify(health)).not.toContain("super-secret");
    expect(JSON.stringify(health)).not.toContain("provider secret should stay private");
  });
});
