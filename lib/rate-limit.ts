// Simple in-memory rate limiter (no Redis dependency)
const hits = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

export async function rateLimit(
  key: string,
  limit = 10,
  windowSeconds = 60
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / windowSeconds) * windowSeconds;
  const reset = windowStart + windowSeconds;

  const entry = hits.get(key);

  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: reset });
    return { success: true, remaining: limit - 1, reset };
  }

  entry.count++;
  const remaining = Math.max(0, limit - entry.count);

  return {
    success: entry.count <= limit,
    remaining,
    reset: entry.resetAt,
  };
}
