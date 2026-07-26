import { describe, expect, it } from "vitest";

import { buildUnifiedDiff } from "../public/unified-diff.js";

describe("unified edit diff", () => {
  it("keeps unchanged lines in place and numbers additions", () => {
    expect(buildUnifiedDiff("one\nkeep\n", "one\nnew\nkeep\n")).toEqual([
      { kind: "context", text: "one", oldLine: 1, newLine: 1 },
      { kind: "add", text: "new", newLine: 2 },
      { kind: "context", text: "keep", oldLine: 2, newLine: 3 },
    ]);
  });

  it("represents replacements as a removal followed by an addition", () => {
    expect(buildUnifiedDiff("old\n", "new\n")).toEqual([
      { kind: "remove", text: "old", oldLine: 1 },
      { kind: "add", text: "new", newLine: 1 },
    ]);
  });
});
