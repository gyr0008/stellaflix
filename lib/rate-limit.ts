import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

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
  const windowKey = `ratelimit:${key}:${Math.floor(now / windowSeconds)}`;

  const pipeline = redis.pipeline();
  pipeline.incr(windowKey);
  pipeline.expire(windowKey, windowSeconds);
  const results = await pipeline.exec();

  const count = results?.[0]?.[1] as number;
  const remaining = Math.max(0, limit - count);
  const reset = (Math.floor(now / windowSeconds) + 1) * windowSeconds;

  return {
    success: count <= limit,
    remaining,
    reset,
  };
}
