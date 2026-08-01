import type { AgentEvent } from "@flancommand/event-schema";
import { describe, expect, it } from "vitest";

import { SessionEventHub } from "./session-events.js";

const event = (text: string): AgentEvent => ({
  type: "message.delta",
  runId: "run-1",
  sessionId: "session-1",
  text,
});

describe("SessionEventHub", () => {
  it("publishes events to subscribers with increasing cursors", () => {
    const hub = new SessionEventHub();
    const received: Array<{ cursor: number; event: AgentEvent }> = [];

    hub.subscribe("session-1", (record) => received.push(record));
    expect(hub.publish("session-1", event("one"))).toBe(1);
    expect(hub.publish("session-1", event("two"))).toBe(2);

    expect(received.map((record) => record.cursor)).toEqual([1, 2]);
    expect(received.map((record) => record.event)).toEqual([event("one"), event("two")]);
  });

  it("replays only events after the requested cursor", () => {
    const hub = new SessionEventHub();
    hub.publish("session-1", event("one"));
    hub.publish("session-1", event("two"));

    expect(hub.replay("session-1", 1)).toEqual([{ cursor: 2, event: event("two") }]);
  });

  it("stops delivery after unsubscribe and bounds history", () => {
    const hub = new SessionEventHub(2);
    const received: AgentEvent[] = [];
    const unsubscribe = hub.subscribe("session-1", (record) => received.push(record.event));

    hub.publish("session-1", event("one"));
    unsubscribe();
    hub.publish("session-1", event("two"));
    hub.publish("session-1", event("three"));

    expect(received).toEqual([event("one")]);
    expect(hub.replay("session-1", 0).map((record) => record.event)).toEqual([
      event("two"),
      event("three"),
    ]);
  });
});
