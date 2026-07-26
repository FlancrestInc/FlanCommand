import { describe, expect, it } from "vitest";
import { applyProjectInstructions } from "./project-context.js";

describe("project context", () => {
  it("adds bounded project instructions to normal messages", () => {
    expect(applyProjectInstructions("Do the work", "Use the project style.")).toContain(
      "Use the project style.",
    );
    expect(applyProjectInstructions("Do the work", "Use the project style.")).toContain(
      "Do the work",
    );
  });

  it("does not alter slash commands or empty instructions", () => {
    expect(applyProjectInstructions("/memory", "Ignore this.")).toBe("/memory");
    expect(applyProjectInstructions("Do the work", "   ")).toBe("Do the work");
  });

  it("bounds oversized instructions", () => {
    const instructions = "x".repeat(20_000);
    expect(applyProjectInstructions("Do the work", instructions).length).toBeLessThan(17_000);
  });
});
