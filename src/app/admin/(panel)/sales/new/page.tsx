import type { Metadata } from "next";
import Link from "next/link";
import { SaleForm } from "@/components/admin/SaleForm";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/data";

export const metadata: Metadata = { title: "Record a sale" };

export default async function NewSalePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const settings = await getSettings();
  const [{ data: products }, inquiryRes] = await Promise.all([
    supabase.from("products").select("id, name, price, status").eq("is_archived", false).in("status", ["available", "reserved"]).order("name"),
    sp.inquiry && /^[0-9a-f-]{36}$/.test(sp.inquiry)
      ? supabase.from("inquiries").select("id, name, phone, email, product_id").eq("id", sp.inquiry).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const inquiry = inquiryRes.data as { id: string; name: string; phone: string; email: string; product_id: string | null } | null;
  const defaultProductId = sp.product && /^[0-9a-f-]{36}$/.test(sp.product) ? sp.product : inquiry?.product_id ?? undefined;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/admin/sales" className="text-sm text-muted hover:text-text">&larr; Sales</Link>
        <h1 className="mt-1 text-5xl">Record a sale</h1>
        <p className="mt-1 text-muted">Use this after the customer has paid and received the PC.</p>
      </div>
      <SaleForm
        products={(products ?? []).map((p) => ({ id: p.id, name: p.name, price: Number(p.price), status: p.status }))}
        defaultProductId={defaultProductId}
        inquiry={inquiry}
        today={today}
        currency={settings.currency}
      />
    </div>
  );
}
