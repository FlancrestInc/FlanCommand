import { describe, expect, it } from "vitest";

import { recoveryForSendFailure } from "../public/chat-recovery.js";

describe("chat send recovery", () => {
  it("preserves a submitted prompt after a connection failure", () => {
    expect(recoveryForSendFailure({ name: "TypeError" }, "check the logs")).toEqual({
      draft: "check the logs",
      needsRefresh: true,
    });
  });

  it("does not offer reconnect recovery when the user stopped the request", () => {
    expect(recoveryForSendFailure({ name: "AbortError" }, "check the logs")).toBeNull();
  });
});
