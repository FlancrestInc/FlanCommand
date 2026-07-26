import { describe, expect, it } from "vitest";

import { RateLimiter, readRateLimitConfig } from "./rate-limit.js";

describe("rate limits", () => {
  it("allows a bounded number of requests and reports retry timing", () => {
    const limiter = new RateLimiter({ windowMs: 1_000, max: 2 });
    expect(limiter.check("127.0.0.1", 100)).toMatchObject({
      allowed: true,
      remaining: 1,
      retryAfterSeconds: 0,
    });
    expect(limiter.check("127.0.0.1", 200)).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.check("127.0.0.1", 300)).toMatchObject({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 1,
    });
    expect(limiter.check("127.0.0.1", 1_100)).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("keeps separate clients and supports deployment overrides", () => {
    expect(readRateLimitConfig({})).toEqual({ windowMs: 60_000, max: 60 });
    expect(
      readRateLimitConfig({ FLANC_RATE_LIMIT_WINDOW_MS: "5000", FLANC_RATE_LIMIT_MAX: "8" }),
    ).toEqual({ windowMs: 5_000, max: 8 });
    const limiter = new RateLimiter({ windowMs: 1_000, max: 1 });
    expect(limiter.check("a", 10).allowed).toBe(true);
    expect(limiter.check("b", 10).allowed).toBe(true);
  });
});
