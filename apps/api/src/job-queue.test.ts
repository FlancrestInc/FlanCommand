import { describe, expect, it } from "vitest";
import { JobQueue } from "./job-queue.js";

describe("job queue", () => {
  it("runs only the configured number of jobs at once and preserves order", async () => {
    const queue = new JobQueue(1);
    const started: string[] = [];
    const release: Array<() => void> = [];

    const first = queue.enqueue("first", async () => {
      started.push("first");
      await new Promise<void>((resolve) => release.push(resolve));
    });
    const second = queue.enqueue("second", async () => {
      started.push("second");
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toEqual(["first"]);
    expect(queue.activeCount).toBe(1);
    expect(queue.queuedCount).toBe(1);

    release[0]!();
    await Promise.all([first, second]);
    expect(started).toEqual(["first", "second"]);
    expect(queue.activeCount).toBe(0);
    expect(queue.queuedCount).toBe(0);
  });

  it("rejects an invalid concurrency limit", () => {
    expect(() => new JobQueue(0)).toThrow("job concurrency must be positive");
  });
});
