/** An admin session lives at most this long after the password sign-in, whatever the Supabase plan allows. */
export const ADMIN_SESSION_MAX_HOURS = 12;

/**
 * When the password was actually entered, in milliseconds (0 when unknown).
 * The JWT's `amr` claim records that moment and does NOT change when the token is refreshed, so refreshing cannot
 * extend a session. `last_sign_in_at` is only a fallback for tokens without the claim.
 */
export function passwordSignInTime(amr: unknown, lastSignInAt: string | null | undefined): number {
  const entry = Array.isArray(amr)
    ? amr.find((a) => a && typeof a === "object" && (a as { method?: unknown }).method === "password")
    : undefined;
  const seconds = entry && typeof (entry as { timestamp?: unknown }).timestamp === "number" ? (entry as { timestamp: number }).timestamp : 0;
  if (seconds > 0) return seconds * 1000;
  const fallback = lastSignInAt ? new Date(lastSignInAt).getTime() : 0;
  return Number.isFinite(fallback) ? fallback : 0;
}

/** False when the sign-in time is unknown or older than the allowed lifetime. */
export function isAdminSessionFresh(signedInAtMs: number, now: number = Date.now(), maxHours: number = ADMIN_SESSION_MAX_HOURS): boolean {
  return signedInAtMs > 0 && now - signedInAtMs <= maxHours * 3_600_000;
}
