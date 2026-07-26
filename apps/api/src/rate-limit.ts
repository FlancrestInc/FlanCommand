export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

interface Bucket {
  startedAt: number;
  count: number;
}

function boundedNumber(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, Math.round(parsed)))
    : fallback;
}

export function readRateLimitConfig(
  environment: Record<string, string | undefined> = process.env,
): RateLimitConfig {
  return {
    windowMs: boundedNumber(environment.FLANC_RATE_LIMIT_WINDOW_MS, 60_000, 1_000, 3_600_000),
    max: boundedNumber(environment.FLANC_RATE_LIMIT_MAX, 60, 1, 10_000),
  };
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly config: RateLimitConfig) {}

  check(key: string, now = Date.now()): RateLimitResult {
    const existing = this.buckets.get(key);
    const bucket =
      existing && now - existing.startedAt < this.config.windowMs
        ? existing
        : { startedAt: now, count: 0 };
    bucket.count += 1;
    this.buckets.set(key, bucket);
    const allowed = bucket.count <= this.config.max;
    const remaining = Math.max(0, this.config.max - bucket.count);
    const retryAfterSeconds = allowed
      ? 0
      : Math.max(1, Math.ceil((this.config.windowMs - (now - bucket.startedAt)) / 1000));
    return { allowed, limit: this.config.max, remaining, retryAfterSeconds };
  }
}
