export interface SessionEventStreamOptions {
  EventSourceClass?: new (url: string) => {
    addEventListener(type: string, listener: (event: MessageEvent) => void): void;
    close(): void;
    onerror?: (() => void) | null;
  };
  onSnapshot?: (snapshot: { session: Record<string, unknown>; cursor: number }) => void;
  onAgent?: (event: Record<string, unknown>, cursor: string) => void;
  onError?: () => void;
}

export function createSessionEventStream(
  sessionId: string,
  options?: SessionEventStreamOptions,
): { close(): void };
