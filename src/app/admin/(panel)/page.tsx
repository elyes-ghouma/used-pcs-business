import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { formatDate, formatPrice } from "@/lib/format";
import { INQUIRY_STATUS_LABEL, type InquiryStatus, type ProductStatus } from "@/lib/types";

type Stats = {
  products_total: number; products_available: number; products_reserved: number; products_sold: number;
  sales_count: number; revenue: number | string; open_inquiries: number; new_inquiries: number; chats_needing_attention: number;
  monthly_revenue: { month: string; revenue: number | string; count: number }[];
};

function Stat({ label, value, href, tone }: { label: string; value: string | number; href?: string; tone?: string }) {
  const body = (
    <div className="panel p-4 transition-colors hover:border-accent/60">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 font-display text-4xl font-bold ${tone ?? ""}`}>{value}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function DashboardPage() {
  const { supabase } = await requireAdmin();
  const settings = await getSettings();
  const [statsRes, interestRes, inquiries, sales, products] = await Promise.all([
    supabase.rpc("admin_dashboard_stats"),
    supabase.rpc("admin_product_interest"),
    supabase.from("inquiries").select("id, name, product_name, status, created_at").order("created_at", { ascending: false }).limit(5),
    supabase.from("sales").select("id, product_name, sale_price, sold_at, is_voided").order("sold_at", { ascending: false }).limit(5),
    supabase.from("products").select("id, name, status, created_at").eq("is_archived", false).order("created_at", { ascending: false }).limit(5),
  ]);
  const stats = statsRes.data as Stats | null;
  const interest = (interestRes.data ?? []) as { product_id: string; product_name: string; inquiries: number; contact_clicks: number; chats: number }[];
  const cur = settings.currency;

  if (!stats) {
    return <p role="alert" className="panel p-6 text-bad">Could not load the dashboard numbers. Refresh the page.</p>;
  }
  const maxRevenue = Math.max(1, ...stats.monthly_revenue.map((m) => Number(m.revenue)));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-5xl">Dashboard</h1>
        <p className="mt-1 text-muted">A quick look at stock, sales and customers.</p>
      </div>

      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total products" value={stats.products_total} href="/admin/products" />
        <Stat label="Available" value={stats.products_available} href="/admin/products?status=available" tone="text-ok" />
        <Stat label="Reserved" value={stats.products_reserved} href="/admin/products?status=reserved" tone="text-warn" />
        <Stat label="Sold" value={stats.products_sold} href="/admin/products?status=sold" tone="text-bad" />
        <Stat label="Recorded sales" value={stats.sales_count} href="/admin/sales" />
        <Stat label="Revenue" value={formatPrice(stats.revenue, cur)} href="/admin/sales" tone="text-accent-strong" />
        <Stat label="Open inquiries" value={stats.open_inquiries} href="/admin/inquiries" />
        <Stat label="Chats needing a reply" value={stats.chats_needing_attention} href="/admin/inbox" tone={stats.chats_needing_attention > 0 ? "text-accent-strong" : ""} />
      </section>

      <section aria-labelledby="rev-heading" className="panel p-5">
        <h2 id="rev-heading" className="text-2xl">Revenue, last 6 months</h2>
        {stats.monthly_revenue.length === 0 ? (
          <p className="mt-3 text-muted">No sales recorded yet. Record a sale and it will show here.</p>
        ) : (
          <>
            <ul className="mt-4 flex h-44 items-end gap-3" aria-hidden>
              {stats.monthly_revenue.map((m) => (
                <li key={m.month} className="flex h-full flex-1 flex-col justify-end gap-1.5 text-center">
                  <div className="rounded-t bg-accent" style={{ height: `${Math.max(4, (Number(m.revenue) / maxRevenue) * 100)}%` }} />
                  <span className="text-xs text-muted">{m.month}</span>
                </li>
              ))}
            </ul>
            <table className="sr-only">
              <caption>Revenue by month</caption>
              <thead><tr><th>Month</th><th>Revenue</th><th>Sales</th></tr></thead>
              <tbody>
                {stats.monthly_revenue.map((m) => (
                  <tr key={m.month}><td>{m.month}</td><td>{formatPrice(m.revenue, cur)}</td><td>{m.count}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="inq-heading" className="panel p-5">
          <div className="flex items-center justify-between"><h2 id="inq-heading" className="text-2xl">Recent inquiries</h2><Link href="/admin/inquiries" className="text-sm text-accent">View all</Link></div>
          {(inquiries.data ?? []).length === 0 ? <p className="mt-3 text-muted">No inquiries yet.</p> : (
            <ul className="mt-3 divide-y divide-line-soft">
              {(inquiries.data ?? []).map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0"><span className="block truncate font-medium">{i.name}</span><span className="block truncate text-muted">{i.product_name || "General question"} &middot; {formatDate(i.created_at)}</span></span>
                  <span className="shrink-0 text-muted">{INQUIRY_STATUS_LABEL[i.status as InquiryStatus]}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="sales-heading" className="panel p-5">
          <div className="flex items-center justify-between"><h2 id="sales-heading" className="text-2xl">Recent sales</h2><Link href="/admin/sales" className="text-sm text-accent">View all</Link></div>
          {(sales.data ?? []).length === 0 ? <p className="mt-3 text-muted">No sales recorded yet.</p> : (
            <ul className="mt-3 divide-y divide-line-soft">
              {(sales.data ?? []).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0"><span className="block truncate font-medium">{s.product_name}</span><span className="block text-muted">{formatDate(s.sold_at)}{s.is_voided ? " (voided)" : ""}</span></span>
                  <span className={`shrink-0 font-semibold ${s.is_voided ? "text-muted line-through" : "text-accent-strong"}`}>{formatPrice(s.sale_price, cur)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="new-heading" className="panel p-5">
          <div className="flex items-center justify-between"><h2 id="new-heading" className="text-2xl">Recently added products</h2><Link href="/admin/products" className="text-sm text-accent">View all</Link></div>
          {(products.data ?? []).length === 0 ? <p className="mt-3 text-muted">No products yet. <Link href="/admin/products/new" className="text-accent underline">Add your first PC</Link>.</p> : (
            <ul className="mt-3 divide-y divide-line-soft">
              {(products.data ?? []).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <Link href={`/admin/products/${p.id}`} className="min-w-0 truncate font-medium hover:text-accent-strong">{p.name}</Link>
                  <StatusBadge status={p.status as ProductStatus} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="interest-heading" className="panel p-5">
          <h2 id="interest-heading" className="text-2xl">Most interest</h2>
          <p className="mt-1 text-xs text-muted">Inquiries and chats are real messages. Button clicks only show that someone tapped WhatsApp, Messenger or call; they can&apos;t be matched to messages.</p>
          {interest.filter((i) => i.inquiries + i.contact_clicks + i.chats > 0).length === 0 ? <p className="mt-3 text-muted">Nothing yet.</p> : (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-muted"><tr><th className="pb-2 font-medium">PC</th><th className="pb-2 text-right font-medium">Inquiries</th><th className="pb-2 text-right font-medium">Chats</th><th className="pb-2 text-right font-medium">Clicks</th></tr></thead>
              <tbody className="divide-y divide-line-soft">
                {interest.filter((i) => i.inquiries + i.contact_clicks + i.chats > 0).map((i) => (
                  <tr key={i.product_id}><td className="max-w-0 truncate py-2"><Link href={`/admin/products/${i.product_id}`} className="hover:text-accent-strong">{i.product_name}</Link></td><td className="py-2 text-right">{i.inquiries}</td><td className="py-2 text-right">{i.chats}</td><td className="py-2 text-right">{i.contact_clicks}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
