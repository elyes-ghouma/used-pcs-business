import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Only these destinations are ever allowed after an emailed link (no open redirect).
const ALLOWED_NEXT = new Set(["/admin/reset-password", "/admin"]);

/** Landing point of the password-reset email: exchanges the one-time code for a session, then moves on. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/admin";
  const target = ALLOWED_NEXT.has(next) ? next : "/admin";

  if (code && code.length < 600) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(target, url.origin));
  }
  return NextResponse.redirect(new URL("/admin/login?link=invalid", url.origin));
}
