export type PolicyDecision = "allow" | "approval" | "deny";
export type PolicyAction = "read" | "write" | "command" | "network";
export type PermissionMode = "ask" | "safe" | "autonomy";

import { MAX_PROJECT_INSTRUCTION_CHARS } from "./project-context.js";

export interface Policy {
  read: PolicyDecision;
  write: PolicyDecision;
  command: PolicyDecision;
  network: PolicyDecision;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  paths: string[];
  hosts: string[];
  permissionMode?: PermissionMode;
  policy: Partial<Policy>;
  archived?: boolean;
  createdAt: string;
}

export interface PolicyEvaluationInput {
  policy: Policy;
  action: PolicyAction;
  path?: string;
  host?: string;
  declaredPaths?: string[];
  declaredHosts?: string[];
}

export interface PolicyEvaluation {
  decision: PolicyDecision;
  action: PolicyAction;
  reason: string;
  boundary: "global" | "project" | "conversation" | "path" | "host";
}

export const defaultPolicy: Policy = {
  read: "allow",
  write: "approval",
  command: "approval",
  network: "approval",
};

export function permissionPolicyForMode(mode: PermissionMode): Policy {
  if (mode === "safe") {
    return { read: "allow", write: "approval", command: "allow", network: "approval" };
  }
  if (mode === "autonomy") {
    return { read: "allow", write: "allow", command: "allow", network: "allow" };
  }
  return { ...defaultPolicy };
}

function isInside(candidate: string, roots: string[]): boolean {
  return roots.some((root) => {
    const normalizedRoot = root.endsWith("/") ? root : `${root}/`;
    return candidate === root || candidate.startsWith(normalizedRoot);
  });
}

export function resolvePolicy(
  global: Policy,
  project?: Partial<Policy>,
  conversation?: Partial<Policy>,
): Policy {
  return {
    read: conversation?.read ?? project?.read ?? global.read,
    write: conversation?.write ?? project?.write ?? global.write,
    command: conversation?.command ?? project?.command ?? global.command,
    network: conversation?.network ?? project?.network ?? global.network,
  };
}

export function evaluateAction(input: PolicyEvaluationInput): PolicyEvaluation {
  const { policy, action } = input;
  if (
    action === "read" &&
    input.path &&
    input.declaredPaths?.length &&
    !isInside(input.path, input.declaredPaths)
  ) {
    return {
      decision: "approval",
      action,
      reason: "Read path is outside the project boundary.",
      boundary: "path",
    };
  }
  if (
    action === "network" &&
    input.host &&
    input.declaredHosts?.length &&
    !input.declaredHosts.includes(input.host)
  ) {
    return {
      decision: "approval",
      action,
      reason: "Network host is outside the project boundary.",
      boundary: "host",
    };
  }
  const decision = policy[action];
  const boundary = decision === "deny" ? "global" : "project";
  if (decision === "allow")
    return { decision, action, reason: `${action} is allowed by the active policy.`, boundary };
  if (decision === "approval")
    return {
      decision,
      action,
      reason: `${action} requires approval under the active policy.`,
      boundary,
    };
  return { decision, action, reason: `${action} is denied by the active policy.`, boundary };
}

export function normalizeProject(input: Record<string, unknown>, id: string): Project {
  const rawPolicy =
    typeof input.policy === "object" && input.policy !== null && !Array.isArray(input.policy)
      ? (input.policy as Record<string, unknown>)
      : {};
  const allowed = (value: unknown): PolicyDecision | undefined =>
    value === "allow" || value === "approval" || value === "deny" ? value : undefined;
  const permissionMode: PermissionMode =
    input.permissionMode === "safe" || input.permissionMode === "autonomy"
      ? input.permissionMode
      : "ask";
  const modePolicy = permissionPolicyForMode(permissionMode);
  return {
    id,
    name:
      typeof input.name === "string" && input.name.trim() ? input.name.trim() : "Untitled project",
    ...(typeof input.description === "string" && input.description.trim()
      ? { description: input.description.trim() }
      : {}),
    ...(typeof input.instructions === "string" && input.instructions.trim()
      ? { instructions: input.instructions.trim().slice(0, MAX_PROJECT_INSTRUCTION_CHARS) }
      : {}),
    paths: Array.isArray(input.paths)
      ? input.paths.filter(
          (value): value is string => typeof value === "string" && value.length > 0,
        )
      : [],
    hosts: Array.isArray(input.hosts)
      ? input.hosts.filter(
          (value): value is string => typeof value === "string" && value.length > 0,
        )
      : [],
    permissionMode,
    policy: {
      ...(["read", "write", "command", "network"] as const).reduce<Partial<Policy>>(
        (result, key) => {
          result[key] = allowed(rawPolicy[key]) ?? modePolicy[key];
          return result;
        },
        {},
      ),
    },
    createdAt: new Date().toISOString(),
  };
}
