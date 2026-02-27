import type { FastifyReply, FastifyRequest } from "fastify";

type Bucket = {
  tokens: number;
  updatedAt: number;
};

const refillPerSecond = 10;
const capacity = 20;
const buckets = new Map<string, Bucket>();

function getBucket(apiKey: string): Bucket {
  const existing = buckets.get(apiKey);
  if (existing) return existing;
  const initial = { tokens: capacity, updatedAt: Date.now() };
  buckets.set(apiKey, initial);
  return initial;
}

function consumeToken(apiKey: string): { allowed: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  const bucket = getBucket(apiKey);
  const elapsedSec = Math.max((now - bucket.updatedAt) / 1000, 0);
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillPerSecond);
  bucket.updatedAt = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return {
      allowed: true,
      remaining: Math.max(Math.floor(bucket.tokens), 0),
      retryAfterSec: 0,
    };
  }

  const missingTokens = 1 - bucket.tokens;
  return {
    allowed: false,
    remaining: 0,
    retryAfterSec: Math.max(Math.ceil(missingTokens / refillPerSecond), 1),
  };
}

export function enforceApiKeyRateLimit(request: FastifyRequest, reply: FastifyReply): boolean {
  const apiKey = request.headers["x-api-key"];
  if (!apiKey || typeof apiKey !== "string") return true;

  const result = consumeToken(apiKey);
  reply.header("x-ratelimit-limit", String(capacity));
  reply.header("x-ratelimit-remaining", String(result.remaining));

  if (result.allowed) return true;

  reply.header("retry-after", String(result.retryAfterSec));
  void reply.code(429).send({
    error: {
      code: "RATE_LIMITED",
      message: "API key rate limit exceeded",
      details: {
        sustainedPerSec: refillPerSecond,
        burst: capacity,
        retryAfterSec: result.retryAfterSec,
      },
    },
  });
  return false;
}

export const apiKeyRateLimitConfig = {
  sustainedPerSec: refillPerSecond,
  burst: capacity,
};
