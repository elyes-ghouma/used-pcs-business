import { redirect } from "next/navigation";
import { cache } from "react";
import { isAdminSessionFresh, passwordSignInTime } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-side admin check used by every admin page, server action and route handler.
 * Being signed in is not enough: the user must also be listed in public.admins, and the sign-in must be recent.
 */
export const getAdmin = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser(); // validates the JWT with the Auth server
  if (error || !data.user) return null;

  // Hard session lifetime, measured from the password entry (see src/lib/session.ts, unit tested).
  const { data: claimsData } = await supabase.auth.getClaims();
  const signedInAt = passwordSignInTime(claimsData?.claims?.amr, data.user.last_sign_in_at);
  if (!isAdminSessionFresh(signedInAt)) {
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
