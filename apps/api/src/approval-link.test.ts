import { describe, expect, it } from "vitest";
import { ApprovalLinkSigner } from "./approval-link.js";

describe("approval link signer", () => {
  it("creates a token that verifies once before its expiry", () => {
    const signer = new ApprovalLinkSigner("test-secret", () => 1_700_000_000_000);
    const token = signer.create("approval-1", 60_000);

    expect(signer.verify(token)).toEqual({
      approvalId: "approval-1",
      expiresAt: 1_700_000_060_000,
    });
    expect(signer.consume(token)).toEqual({
      approvalId: "approval-1",
      expiresAt: 1_700_000_060_000,
    });
    expect(signer.consume(token)).toBeUndefined();
  });

  it("rejects altered and expired tokens", () => {
    let now = 1_700_000_000_000;
    const signer = new ApprovalLinkSigner("test-secret", () => now);
    const token = signer.create("approval-1", 60_000);

    expect(signer.verify(`${token}x`)).toBeUndefined();
    now += 60_001;
    expect(signer.verify(token)).toBeUndefined();
  });
});
