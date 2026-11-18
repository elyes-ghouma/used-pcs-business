import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/admin/PasswordForms";
import { LogoMark } from "@/components/Logo";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Set a new admin password", robots: { index: false, follow: false } };

export default async function ResetPasswordPage() {
  // Reachable only with the short session created by the emailed one-time link.
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/admin/login?link=invalid");
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4">
      <div className="panel w-full max-w-sm p-8">
        <LogoMark className="size-10 text-accent" />
        <h1 className="mt-4 text-4xl">New password</h1>
        <p className="mt-1 mb-6 text-sm text-muted">Choose a strong password for {data.user.email}.</p>
        <ResetPasswordForm />
      </div>
    </main>
  );
}
