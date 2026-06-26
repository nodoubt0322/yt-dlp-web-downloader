import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";

interface FixedWindowRateLimiterOptions {
  limit: number;
  windowMs: number;
  now?: () => number;
}

interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
  remaining: number;
}

interface WindowState {
  count: number;
  resetAt: number;
}

export function createFixedWindowRateLimiter(options: FixedWindowRateLimiterOptions) {
  const windows = new Map<string, WindowState>();
  const now = options.now ?? Date.now;

  return (key: string): RateLimitResult => {
    if (options.limit <= 0) {
      return { allowed: true, retryAfterMs: 0, remaining: Number.POSITIVE_INFINITY };
    }

    const currentTime = now();
    const current = windows.get(key);

    if (!current || currentTime >= current.resetAt) {
      windows.set(key, { count: 1, resetAt: currentTime + options.windowMs });
      return { allowed: true, retryAfterMs: 0, remaining: options.limit - 1 };
    }

    if (current.count >= options.limit) {
      return {
        allowed: false,
        retryAfterMs: current.resetAt - currentTime,
        remaining: 0
      };
    }

    current.count += 1;
    return {
      allowed: true,
      retryAfterMs: 0,
      remaining: options.limit - current.count
    };
  };
}

export async function registerRateLimitPlugin(app: FastifyInstance, config: AppConfig) {
  const analyzeLimiter = createFixedWindowRateLimiter({
    limit: config.rateLimitAnalyzePerMinute,
    windowMs: 60_000
  });
  const jobCreateLimiter = createFixedWindowRateLimiter({
    limit: config.rateLimitJobCreatePerMinute,
    windowMs: 60_000
  });

  app.addHook("onRequest", async (request, reply) => {
    const limiter = selectLimiter(request, analyzeLimiter, jobCreateLimiter);

    if (!limiter) {
      return;
    }

    const result = limiter(getClientKey(request));

    if (!result.allowed) {
      reply
        .code(429)
        .header("retry-after", Math.ceil(result.retryAfterMs / 1000))
        .send({
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests"
          }
        });
    }
  });
}

function selectLimiter(
  request: FastifyRequest,
  analyzeLimiter: ReturnType<typeof createFixedWindowRateLimiter>,
  jobCreateLimiter: ReturnType<typeof createFixedWindowRateLimiter>
) {
  if (request.method === "POST" && request.url === "/analyze") {
    return analyzeLimiter;
  }

  if (request.method === "POST" && request.url === "/jobs") {
    return jobCreateLimiter;
  }

  return undefined;
}

function getClientKey(request: FastifyRequest) {
  const subject = request.headers.authorization ?? request.ip;

  // Hashing keeps bearer tokens out of in-memory keys and diagnostics.
  return createHash("sha256").update(subject).digest("hex");
}
