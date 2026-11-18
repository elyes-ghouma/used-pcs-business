"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/auth";
import { createGatewayClient, isGatewayConfigured } from "@/lib/gateway";
import { validatePassword } from "@/lib/password";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/validation";

const SAME_ANSWER = "If that email belongs to an admin account, a reset link is on its way. The link works once and expires soon.";

/** Always answers the same way, so it cannot be used to discover which emails have accounts. */
export async function requestPasswordResetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ip = clientIp(await headers());
  if (!rateLimit(`reset:${ip}`, 3, 10 * 60_000)) return { ok: false, message: "Too many requests. Wait a few minutes and try again." };
  const email = String(formData.get("email") ?? "").trim().slice(0, 200);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, message: "Enter a valid email address." };

  // Shares the database login throttle, so reset emails cannot be used to spam an account or burn email quota.
  if (isGatewayConfigured()) {
    try {
      const acct = createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 16);
      const { error } = await (await createGatewayClient()).rpc("check_login_allowed", { p_email_hash: acct });
      if (error && /rate_limited/.test(error.message)) return { ok: false, message: "Too many requests. Wait a few minutes and try again." };
    } catch {
      // fall through: Supabase rate-limits reset emails itself
    }
  }

  const site = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${site}/auth/callback?next=/admin/reset-password` });
  return { ok: true, message: SAME_ANSWER };
}

function checkNewPassword(formData: FormData, email?: string | null): { password?: string; error?: ActionState } {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const problem = validatePassword(password, email ?? undefined);
  if (problem) return { error: { ok: false, message: problem } };
  if (password !== confirm) return { error: { ok: false, message: "The two passwords do not match." } };
  return { password };
}

/** After clicking the emailed link the user holds a short recovery session; this sets the new password. */
export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, message: "This reset link has expired. Request a new one." };
  const checked = checkNewPassword(formData, data.user.email);
  if (checked.error) return checked.error;

  const { error } = await supabase.auth.updateUser({ password: checked.password! });
  if (error) return { ok: false, message: "Could not set the new password. Request a new reset link and try again." };
  await supabase.auth.signOut({ scope: "others" }); // any other session (a possible intruder) is ended
  redirect("/admin");
}

/** Signed-in admin changes their password: must prove the current one first. */
export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, message: "Your session expired. Sign in again." };
  if (!rateLimit(`chgpw:${admin.user.id}`, 5, 10 * 60_000)) return { ok: false, message: "Too many attempts. Wait a few minutes." };

  const current = String(formData.get("current") ?? "");
  const checked = checkNewPassword(formData, admin.user.email);
  if (checked.error) return checked.error;
  if (checked.password === current) return { ok: false, message: "Choose a password different from the current one." };

  const { error: reauth } = await admin.supabase.auth.signInWithPassword({ email: admin.user.email ?? "", password: current });
  if (reauth) return { ok: false, message: "The current password is incorrect." };

  const { error } = await admin.supabase.auth.updateUser({ password: checked.password! });
  if (error) return { ok: false, message: "Could not change the password. Try again." };
  await admin.supabase.auth.signOut({ scope: "others" });
  return { ok: true, message: "Password changed. Your other sessions were signed out." };
}
