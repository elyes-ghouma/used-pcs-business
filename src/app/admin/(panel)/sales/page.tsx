import type { Metadata } from "next";
import Link from "next/link";
import { voidSaleAction } from "@/app/admin/actions/business";
import { requireAdmin } from "@/lib/auth";
import { sanitizeSearchTerm } from "@/lib/catalog-params";
import { getSettings } from "@/lib/data";
import { formatDate, formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Sales" };

type Sale = {
  id: string; product_id: string; product_name: string; listed_price: number | string; sale_price: number | string; sold_at: string;
  customer_name: string; customer_phone: string; customer_email: string; notes: string; is_voided: boolean; void_reason: string | null;
};
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function SalesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const settings = await getSettings();
  const q = sanitizeSearchTerm(one(sp.q).slice(0, 80));
  const from = one(sp.from);
  const to = one(sp.to);
  const showVoided = one(sp.voided) === "1";

  let query = supabase.from("sales").select("*").order("sold_at", { ascending: false }).limit(300);
  if (q) query = query.or(`product_name.ilike.%${q}%,customer_name.ilike.%${q}%,customer_phone.ilike.%${q}%,customer_email.ilike.%${q}%`);
  if (isDate(from)) query = query.gte("sold_at", `${from}T00:00:00`);
  if (isDate(to)) query = query.lte("sold_at", `${to}T23:59:59`);
  if (!showVoided) query = query.eq("is_voided", false);
  const { data, error } = await query;
  const sales = (data ?? []) as Sale[];

  const active = sales.filter((s) => !s.is_voided);
  const revenue = active.reduce((sum, s) => sum + Number(s.sale_price), 0);
  const cur = settings.currency;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-5xl">Sales</h1>
          {one(sp.recorded) && <p role="status" className="mt-1 text-ok">Sale recorded. The PC is now marked as sold.</p>}
        </div>
        <Link href="/admin/sales/new" className="btn-primary">Record a sale</Link>
      </div>

      <form method="get" className="panel grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto_auto]" aria-label="Filter sales">
        <div><label htmlFor="s-q" className="sr-only">Search</label><input id="s-q" name="q" defaultValue={q} placeholder="Search product or customer" className="field" /></div>
        <div><label htmlFor="s-from" className="sr-only">From date</label><input id="s-from" type="date" name="from" defaultValue={isDate(from) ? from : ""} className="field" aria-label="From date" /></div>
        <div><label htmlFor="s-to" className="sr-only">To date</label><input id="s-to" type="date" name="to" defaultValue={isDate(to) ? to : ""} className="field" aria-label="To date" /></div>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="voided" value="1" defaultChecked={showVoided} className="size-4 accent-[var(--copper)]" />Show voided</label>
        <button className="btn-secondary">Filter</button>
      </form>

      <div className="grid grid-cols-2 gap-3">
        <div className="panel p-4"><p className="text-sm text-muted">Sales in this view</p><p className="font-display text-4xl font-bold">{active.length}</p></div>
        <div className="panel p-4"><p className="text-sm text-muted">Revenue in this view</p><p className="font-display text-4xl font-bold text-copper-strong">{formatPrice(revenue, cur)}</p></div>
      </div>

      {error ? (
        <p role="alert" className="panel p-6 text-bad">Could not load sales.</p>
      ) : sales.length === 0 ? (
        <div className="panel p-8"><p className="font-display text-2xl font-bold">No sales found.</p><p className="mt-1 text-muted">When you sell a PC, record it here so your revenue stays accurate.</p></div>
      ) : (
        <ul className="grid gap-3">
          {sales.map((s) => (
            <li key={s.id} className={`panel p-4 ${s.is_voided ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg font-medium"><Link href={`/admin/products/${s.product_id}`} className="hover:text-copper-strong">{s.product_name}</Link>{s.is_voided && <span className="ml-2 rounded-full border border-bad/40 px-2 py-0.5 text-xs text-bad">Voided</span>}</p>
                  <p className="text-sm text-muted">{formatDate(s.sold_at)} &middot; {[s.customer_name, s.customer_phone, s.customer_email].filter(Boolean).join(" · ") || "No customer details"}</p>
                  {s.notes && <p className="mt-1 whitespace-pre-line text-sm">{s.notes}</p>}
                  {s.is_voided && s.void_reason && <p className="mt-1 text-sm text-muted">Reason: {s.void_reason}</p>}
                </div>
                <div className="text-right">
                  <p className={`font-display text-3xl font-bold ${s.is_voided ? "line-through" : "text-copper-strong"}`}>{formatPrice(s.sale_price, cur)}</p>
                  {Number(s.sale_price) !== Number(s.listed_price) && <p className="text-xs text-muted">Listed at {formatPrice(s.listed_price, cur)}</p>}
                </div>
              </div>
              {!s.is_voided && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-muted">Undo this sale</summary>
                  <form action={voidSaleAction.bind(null, s.id)} className="mt-2 flex flex-wrap items-end gap-2">
                    <div><label htmlFor={`r-${s.id}`} className="label">Reason</label><input id={`r-${s.id}`} name="reason" className="field" placeholder="e.g. Buyer backed out" maxLength={500} /></div>
                    <button className="btn-danger btn-sm">Void sale and restore the PC</button>
                  </form>
                  <p className="hint">The sale stays in your history as voided, is removed from revenue, and the PC becomes available again.</p>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
