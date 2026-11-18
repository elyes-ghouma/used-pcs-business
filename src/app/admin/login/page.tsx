import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { LogoMark } from "@/components/Logo";
import { getAdmin } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin sign in", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const configured = isSupabaseConfigured();
  if (configured && (await getAdmin())) redirect("/admin");
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4">
      <div className="panel w-full max-w-sm p-8">
        <LogoMark className="size-10 text-accent" />
        <h1 className="mt-4 text-4xl">Admin sign in</h1>
        <p className="mt-1 mb-6 text-sm text-muted">For the shop owner only.</p>
        {sp.link === "invalid" && <p role="alert" className="mb-4 rounded-md border border-warn/50 bg-warn/10 px-3 py-2 text-sm text-warn">That link is invalid or has expired. Request a new one from Forgot your password.</p>}
        {configured ? (
          <LoginForm />
        ) : (
          <p role="alert" className="text-warn">Supabase is not configured. Add the environment variables from the README first.</p>
        )}
      </div>
    </main>
  );
}
