export type UnifiedDiffLine =
  | { kind: "context"; text: string; oldLine: number; newLine: number }
  | { kind: "remove"; text: string; oldLine: number }
  | { kind: "add"; text: string; newLine: number };
export function buildUnifiedDiff(beforeText: string, afterText: string): UnifiedDiffLine[];
