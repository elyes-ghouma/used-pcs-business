import { createHash } from "node:crypto";

/**
 * The visitor's address as seen by the platform. On Vercel, x-vercel-forwarded-for / x-real-ip are set by the edge
 * and cannot be spoofed by the visitor; on other hosts they can, so only the global caps are reliable there.
 */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/** A stable pseudonymous id for rate limiting: salted hash of the IP. The raw IP is never stored or sent to the database. */
export function clientIdFor(ip: string, salt: string): string {
  return createHash("sha256").update(`${salt}|${ip}`).digest("hex").slice(0, 32);
}
