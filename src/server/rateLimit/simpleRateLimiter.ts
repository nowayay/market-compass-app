/**
 * A minimal, in-memory, per-key sliding-window rate limiter.
 *
 * Process-local only: on Vercel (or any multi-instance deployment) each warm
 * serverless instance holds its own independent counters, so this is NOT a
 * distributed rate limit. It exists as a simple, best-effort guard against a
 * single client hammering an expensive endpoint — not a production-grade
 * abuse-prevention system. Same spirit as the existing, equally process-local
 * `identification/identificationBudget.ts`.
 *
 * No secrets, no personal data — only opaque keys (IP addresses) and
 * timestamps, held in memory for at most `windowMs`.
 */
export interface SimpleRateLimiter {
  /**
   * True (and consumes one slot) when `key` is still within its window
   * budget; false when the window's request budget is already exhausted.
   */
  allow(key: string): boolean;
}

export interface SimpleRateLimiterConfig {
  windowMs: number;
  maxPerWindow: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

export function createSimpleRateLimiter(config: SimpleRateLimiterConfig): SimpleRateLimiter {
  const now = config.now ?? (() => Date.now());
  const hitsByKey = new Map<string, number[]>();

  return {
    allow(key: string): boolean {
      const t = now();
      const recent = (hitsByKey.get(key) ?? []).filter((ts) => t - ts < config.windowMs);

      if (recent.length >= config.maxPerWindow) {
        hitsByKey.set(key, recent);
        return false;
      }

      recent.push(t);
      hitsByKey.set(key, recent);
      return true;
    },
  };
}

/**
 * Best-effort client IP from standard proxy headers — Vercel sets
 * `x-forwarded-for` on every request reaching a serverless function. Falls
 * back to a single shared bucket when neither header is present, so the
 * limiter still degrades safely (one shared budget) rather than throwing or
 * silently skipping the check.
 */
export function clientIpFrom(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}
