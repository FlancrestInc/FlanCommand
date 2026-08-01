function parseEvent(event, fallback) {
  try {
    return JSON.parse(event.data);
  } catch {
    return fallback;
  }
}

export function createSessionEventStream(sessionId, options = {}) {
  const EventSourceClass = options.EventSourceClass || globalThis.EventSource;
  const source = new EventSourceClass(`/api/sessions/${encodeURIComponent(sessionId)}/events`);
  source.addEventListener("snapshot", (event) => {
    const snapshot = parseEvent(event, null);
    if (snapshot) options.onSnapshot?.(snapshot);
  });
  source.addEventListener("agent", (event) => {
    const agentEvent = parseEvent(event, null);
    if (agentEvent) options.onAgent?.(agentEvent, event.lastEventId || "");
  });
  source.onerror = () => options.onError?.();
  return {
    close() {
      source.close();
    },
  };
}
