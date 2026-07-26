import { createHmac, timingSafeEqual } from "node:crypto";

interface ApprovalLinkPayload {
  approvalId: string;
  expiresAt: number;
}

export class ApprovalLinkSigner {
  private readonly used = new Set<string>();

  constructor(
    private readonly secret: string,
    private readonly now: () => number = Date.now,
  ) {}

  create(approvalId: string, lifetimeMs = 15 * 60_000): string {
    const payload: ApprovalLinkPayload = { approvalId, expiresAt: this.now() + lifetimeMs };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${encoded}.${this.signature(encoded)}`;
  }

  verify(token: string): ApprovalLinkPayload | undefined {
    const [encoded, signature] = token.split(".");
    if (!encoded || !signature || this.used.has(token)) return undefined;
    const expected = this.signature(encoded);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    )
      return undefined;
    try {
      const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as
        ApprovalLinkPayload | undefined;
      if (
        !payload ||
        typeof payload.approvalId !== "string" ||
        typeof payload.expiresAt !== "number" ||
        payload.expiresAt <= this.now()
      )
        return undefined;
      return payload;
    } catch {
      return undefined;
    }
  }

  consume(token: string): ApprovalLinkPayload | undefined {
    const payload = this.verify(token);
    if (payload) this.used.add(token);
    return payload;
  }

  private signature(encoded: string): string {
    return createHmac("sha256", this.secret).update(encoded).digest("base64url");
  }
}
