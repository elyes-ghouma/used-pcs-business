import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/app/admin/actions/auth";
import { AdminNav } from "@/components/admin/AdminNav";
import { LogoMark } from "@/components/Logo";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Admin", template: "%s | Admin" }, robots: { index: false, follow: false } };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { user, supabase } = await requireAdmin();
  const [{ count: newInquiries }, { count: chats }] = await Promise.all([
    supabase.from("inquiries").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("needs_attention", true).eq("status", "open"),
  ]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="relative border-b border-line bg-surface lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:flex-col lg:items-start lg:py-5">
          <Link href="/admin" className="flex items-center gap-2">
            <LogoMark className="size-7 text-copper" />
            <span className="font-display text-xl font-bold">Admin</span>
          </Link>
          <AdminNav badges={{ inquiries: newInquiries ?? 0, inbox: chats ?? 0 }} />
        </div>
        <div className="hidden border-t border-line p-4 text-sm lg:absolute lg:bottom-0 lg:left-0 lg:right-0 lg:block">
          <p className="truncate text-muted" title={user.email ?? ""}>{user.email}</p>
          <div className="mt-2 flex gap-2">
            <Link href="/" target="_blank" className="btn-secondary btn-sm flex-1">View site</Link>
            <form action={logoutAction}><button className="btn-secondary btn-sm">Sign out</button></form>
          </div>
        </div>
      </aside>
      <main id="main" className="min-w-0 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
