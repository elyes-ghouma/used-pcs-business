import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/admin/PasswordForms";
import { LogoMark } from "@/components/Logo";
import { isSupabaseConfigured } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reset admin password", robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4">
      <div className="panel w-full max-w-sm p-8">
        <LogoMark className="size-10 text-accent" />
        <h1 className="mt-4 text-4xl">Reset password</h1>
        <p className="mt-1 mb-6 text-sm text-muted">We email a one-time link to the admin address.</p>
        {isSupabaseConfigured() ? <ForgotPasswordForm /> : <p role="alert" className="text-warn">Supabase is not configured.</p>}
        <p className="mt-6 text-sm"><Link href="/admin/login" className="text-accent hover:text-accent-strong">Back to sign in</Link></p>
      </div>
    </main>
  );
}
