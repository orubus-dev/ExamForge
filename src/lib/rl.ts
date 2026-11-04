/**
 * Simple sliding-window rate limiter.
 * Edge-isolate-local (per-colo instance) — good enough to blunt abuse.
 */
const buckets = new Map<string, number[]>();

export interface RateResult {
  ok: boolean;
  retryAfter: number; // seconds
}

export function rateLimit(
  key: string,
  limit = 30,
  windowMs = 60_000
): RateResult {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { ok: false, retryAfter: Math.max(1, Math.ceil((windowMs - (now - hits[0])) / 1000)) };
  }
  hits.push(now);
  buckets.set(key, hits);
  // Opportunistic cleanup so the map cannot grow unbounded.
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }
  return { ok: true, retryAfter: 0 };
}

export function ipFrom(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  return "local";
}
