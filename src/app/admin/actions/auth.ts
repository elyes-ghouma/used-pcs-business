"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/validation";

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ip = clientIp(await headers());
  if (!rateLimit(`login:${ip}`, 8, 10 * 60_000)) {
    return { ok: false, message: "Too many sign-in attempts. Wait a few minutes and try again." };
  }
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { ok: false, message: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: "Incorrect email or password." };

  // Signed in is not the same as admin: check the admins table, otherwise sign straight back out.
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) {
    await supabase.auth.signOut();
    return { ok: false, message: "This account does not have admin access." };
  }
  redirect("/admin");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
