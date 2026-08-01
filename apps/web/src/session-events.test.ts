import { describe, expect, it } from "vitest";

import { createSessionEventStream } from "../../web/public/session-events.js";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, Array<(event: MessageEvent) => void>>();
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data: unknown): void {
    for (const listener of this.listeners.get(type) ?? [])
      listener(new MessageEvent(type, { data: JSON.stringify(data) }));
  }
}

describe("session event stream", () => {
  it("forwards snapshots and agent events", () => {
    const snapshots: unknown[] = [];
    const events: unknown[] = [];
    createSessionEventStream("session-1", {
      EventSourceClass: FakeEventSource,
      onSnapshot: (snapshot) => snapshots.push(snapshot),
      onAgent: (event) => events.push(event),
    });

    const source = FakeEventSource.instances[0]!;
    source.emit("snapshot", { session: { id: "session-1" }, cursor: 3 });
    source.emit("agent", { type: "run.started", runId: "run-1" });

    expect(snapshots).toEqual([{ session: { id: "session-1" }, cursor: 3 }]);
    expect(events).toEqual([{ type: "run.started", runId: "run-1" }]);
  });

  it("closes the source without stopping the server run", () => {
    const stream = createSessionEventStream("session-1", {
      EventSourceClass: FakeEventSource,
    });

    stream.close();

    expect(FakeEventSource.instances.at(-1)!.closed).toBe(true);
  });
});
