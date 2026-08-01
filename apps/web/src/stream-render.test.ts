import { describe, expect, it } from "vitest";

import { createFrameBatcher } from "../public/stream-render.js";

describe("stream rendering", () => {
  it("renders only the newest value once per scheduled frame", () => {
    const frames: Array<() => void> = [];
    const rendered: string[] = [];
    const batcher = createFrameBatcher<string>(
      (value) => rendered.push(value),
      (callback) => frames.push(callback),
    );

    batcher.request("H");
    batcher.request("He");
    batcher.request("Hermes");

    expect(rendered).toEqual([]);
    expect(frames).toHaveLength(1);
    frames[0]!();
    expect(rendered).toEqual(["Hermes"]);
  });

  it("flushes a pending value before the stream ends", () => {
    const frames: Array<() => void> = [];
    const rendered: string[] = [];
    const batcher = createFrameBatcher<string>(
      (value) => rendered.push(value),
      (callback) => frames.push(callback),
    );

    batcher.request("complete response");
    batcher.flush();

    expect(rendered).toEqual(["complete response"]);
    expect(frames).toHaveLength(1);
  });
});
