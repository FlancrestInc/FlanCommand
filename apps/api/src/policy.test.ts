import { describe, expect, it } from "vitest";

import {
  evaluateAction,
  normalizeProject,
  permissionPolicyForMode,
  resolvePolicy,
  type Policy,
} from "./policy.js";

const base: Policy = {
  read: "allow",
  write: "approval",
  command: "approval",
  network: "deny",
};

describe("policy inheritance", () => {
  it("lets conversation policy override project policy", () => {
    const resolved = resolvePolicy(base, { ...base, write: "deny" }, { write: "allow" });
    expect(resolved.write).toBe("allow");
  });

  it("allows reads only inside declared project paths", () => {
    const policy = resolvePolicy(base, undefined, undefined);
    expect(
      evaluateAction({
        policy,
        action: "read",
        path: "/workspace/src/app.ts",
        declaredPaths: ["/workspace"],
      }),
    ).toMatchObject({ decision: "allow" });
    expect(
      evaluateAction({
        policy,
        action: "read",
        path: "/etc/passwd",
        declaredPaths: ["/workspace"],
      }),
    ).toMatchObject({ decision: "approval" });
  });

  it("requires approval for writes and explains denial", () => {
    const approval = evaluateAction({
      policy: base,
      action: "write",
      path: "/workspace/app.ts",
      declaredPaths: ["/workspace"],
    });
    expect(approval).toMatchObject({
      decision: "approval",
      reason: expect.stringContaining("write"),
    });
    const denied = evaluateAction({
      policy: { ...base, write: "deny" },
      action: "write",
      path: "/workspace/app.ts",
      declaredPaths: ["/workspace"],
    });
    expect(denied).toMatchObject({ decision: "deny", reason: expect.stringContaining("policy") });
  });

  it("requires approval for undeclared hosts", () => {
    const result = evaluateAction({
      policy: base,
      action: "network",
      host: "example.com",
      declaredHosts: ["api.example.com"],
    });
    expect(result).toMatchObject({ decision: "approval", reason: expect.stringContaining("host") });
  });
});

describe("project permission modes", () => {
  it("maps the visible modes to explicit action decisions", () => {
    expect(permissionPolicyForMode("ask")).toEqual({
      read: "allow",
      write: "approval",
      command: "approval",
      network: "approval",
    });
    expect(permissionPolicyForMode("safe")).toEqual({
      read: "allow",
      write: "approval",
      command: "allow",
      network: "approval",
    });
    expect(permissionPolicyForMode("autonomy")).toEqual({
      read: "allow",
      write: "allow",
      command: "allow",
      network: "allow",
    });
  });

  it("normalizes an invalid or missing mode to ask", () => {
    expect(normalizeProject({ name: "Demo", permissionMode: "unsafe" }, "project-1")).toMatchObject(
      {
        permissionMode: "ask",
        policy: permissionPolicyForMode("ask"),
      },
    );
  });

  it("keeps bounded project instructions", () => {
    expect(
      normalizeProject({ name: "Demo", instructions: "  Follow the repo rules.  " }, "project-1"),
    ).toMatchObject({ instructions: "Follow the repo rules." });
  });
});
