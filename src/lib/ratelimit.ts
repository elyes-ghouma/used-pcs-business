/**
 * Best-effort in-memory limiter: protects a single server instance from bursts.
 * It is NOT shared between serverless instances, so the real limits live in the database RPCs.
 */
const hits = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return true;
}

/** Rejects cross-site POSTs to cookie-based public endpoints (browsers always send Origin on cross-site POSTs). */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // non-browser clients and same-origin GET-like requests
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
