export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly now: () => number;

  public constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? Date.now;
  }

  public hit(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = this.now();
    const current = this.buckets.get(key);
    const bucket =
      current === undefined || current.resetAt <= now
        ? { count: 0, resetAt: now + windowMs }
        : current;

    bucket.count += 1;
    this.buckets.set(key, bucket);

    return {
      allowed: bucket.count <= limit,
      remaining: Math.max(0, limit - bucket.count),
      resetAt: bucket.resetAt,
    };
  }

  public reset(key: string): void {
    this.buckets.delete(key);
  }
}
