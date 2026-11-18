import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** An admin session lives at most this long after the password sign-in, whatever the Supabase plan allows. */
export const ADMIN_SESSION_MAX_HOURS = 12;

/**
 * Server-side admin check used by every admin page, server action and route handler.
 * Being signed in is not enough: the user must also be listed in public.admins, and the sign-in must be recent.
 */
export const getAdmin = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser(); // validates the JWT with the Auth server
  if (error || !data.user) return null;

  // The JWT's `amr` claim records when the password was actually entered and does not change when the token is
  // refreshed, so it cannot be used to extend a session. Fall back to last_sign_in_at if it is missing.
  const { data: claimsData } = await supabase.auth.getClaims();
  const amrEntry = claimsData?.claims?.amr?.find((a) => typeof a !== "string" && a.method === "password");
  const amrSeconds = typeof amrEntry === "object" ? amrEntry.timestamp : undefined;
  const signedInAt = amrSeconds
    ? amrSeconds * 1000
    : data.user.last_sign_in_at
      ? new Date(data.user.last_sign_in_at).getTime()
      : 0;
  if (!signedInAt || Date.now() - signedInAt > ADMIN_SESSION_MAX_HOURS * 3_600_000) {
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    return null;
  }

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) return null;
  return { user: data.user, supabase };
});

export async function requireAdmin() {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

/** For server actions: never redirect mid-action; return an error state instead. */
export async function requireAdminForAction() {
  const admin = await getAdmin();
  if (!admin) throw new Error("not_authorized");
  return admin;
}
