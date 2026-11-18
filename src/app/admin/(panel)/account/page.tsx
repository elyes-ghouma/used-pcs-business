import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/admin/PasswordForms";
import { requireAdmin } from "@/lib/auth";
import { ADMIN_SESSION_MAX_HOURS } from "@/lib/session";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const { user } = await requireAdmin();
  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-5xl">Account</h1>
        <p className="mt-1 text-muted">Signed in as {user.email}. Sessions end automatically {ADMIN_SESSION_MAX_HOURS} hours after you sign in.</p>
      </div>
      <section aria-labelledby="pw-heading" className="panel space-y-4 p-5">
        <div>
          <h2 id="pw-heading" className="text-2xl">Change password</h2>
          <p className="hint">Changing it signs out every other device.</p>
        </div>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
