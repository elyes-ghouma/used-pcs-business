"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createGatewayClient, isGatewayConfigured } from "@/lib/gateway";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/validation";

type EventType = "login_ok" | "login_failed" | "login_throttled" | "admin_denied";

/** Best effort: a logging problem must never stop (or reveal anything about) a login. */
async function logEvent(type: EventType, detail: string) {
  if (!isGatewayConfigured()) return;
  try {
    await (await createGatewayClient()).rpc("log_security_event", { p_type: type, p_detail: detail });
  } catch {
    // ignore
  }
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ip = clientIp(await headers());
  const tooMany: ActionState = { ok: false, message: "Too many sign-in attempts. Wait a few minutes and try again." };
  if (!rateLimit(`login:${ip}`, 8, 10 * 60_000)) return tooMany;

  const email = String(formData.get("email") ?? "").trim().slice(0, 200);
  const password = String(formData.get("password") ?? "").slice(0, 200);
  if (!email || !password) return { ok: false, message: "Enter your email and password." };

  // Short one-way fingerprint of the attempted account: lets the database throttle per account (credential stuffing)
  // and lets the owner see repeated targeting, without storing the email address in the logs.
  const acct = createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 16);

  // Throttle shared by every serverless instance (the in-memory limiter above only covers one).
  if (isGatewayConfigured()) {
    try {
      const { error } = await (await createGatewayClient()).rpc("check_login_allowed", { p_email_hash: acct });
      if (error && /rate_limited/.test(error.message)) {
        await logEvent("login_throttled", `acct:${acct.slice(0, 8)}`);
        return tooMany;
      }
    } catch {
      // If the throttle is unreachable we still let Supabase Auth (which rate-limits on its own) decide.
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Only a real credentials rejection (HTTP 400) is "incorrect"; anything else is a connection/config problem.
    if (error.status === 400 || error.code === "invalid_credentials") {
      await logEvent("login_failed", `acct:${acct.slice(0, 8)}`);
      return { ok: false, message: "Incorrect email or password." };
    }
    return { ok: false, message: "Could not reach the sign-in service. Check NEXT_PUBLIC_SUPABASE_URL in .env.local, then restart the server." };
  }

  // Signed in is not the same as admin: check the admins table, otherwise sign straight back out.
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) {
    await supabase.auth.signOut();
    await logEvent("admin_denied", `acct:${acct.slice(0, 8)}`);
    return { ok: false, message: "This account does not have admin access." };
  }
  await logEvent("login_ok", `acct:${acct.slice(0, 8)}`);
  redirect("/admin");
}

export async function logoutAction() {
  const supabase = await createClient();
  // Ends THIS session (and its refresh token). Changing the password is what signs out every other device.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/admin/login");
}
