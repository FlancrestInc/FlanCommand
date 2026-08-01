import type { AgentEvent } from "@flancommand/event-schema";

export interface SessionEventRecord {
  cursor: number;
  event: AgentEvent;
}

type Subscriber = (record: SessionEventRecord) => void;

export class SessionEventHub {
  private readonly histories = new Map<string, SessionEventRecord[]>();
  private readonly subscribers = new Map<string, Set<Subscriber>>();
  private readonly cursors = new Map<string, number>();

  constructor(private readonly historyLimit = 256) {
    if (!Number.isInteger(historyLimit) || historyLimit < 1)
      throw new Error("session event history limit must be positive");
  }

  currentCursor(sessionId: string): number {
    return this.cursors.get(sessionId) ?? 0;
  }

  replay(sessionId: string, after = 0): SessionEventRecord[] {
    return (this.histories.get(sessionId) ?? []).filter((record) => record.cursor > after);
  }

  publish(sessionId: string, event: AgentEvent): number {
    const record = {
      cursor: (this.cursors.get(sessionId) ?? 0) + 1,
      event,
    } satisfies SessionEventRecord;
    this.cursors.set(sessionId, record.cursor);
    const history = this.histories.get(sessionId) ?? [];
    history.push(record);
    if (history.length > this.historyLimit) history.splice(0, history.length - this.historyLimit);
    this.histories.set(sessionId, history);
    for (const subscriber of this.subscribers.get(sessionId) ?? []) {
      try {
        subscriber(record);
      } catch {
        // A closed SSE response must not break other viewers.
      }
    }
    return record.cursor;
  }

  subscribe(sessionId: string, subscriber: Subscriber): () => void {
    const subscribers = this.subscribers.get(sessionId) ?? new Set<Subscriber>();
    subscribers.add(subscriber);
    this.subscribers.set(sessionId, subscribers);
    return () => {
      subscribers.delete(subscriber);
      if (!subscribers.size) this.subscribers.delete(sessionId);
    };
  }
}
