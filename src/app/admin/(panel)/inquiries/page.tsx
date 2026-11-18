import type { Metadata } from "next";
import Link from "next/link";
import { updateInquiryAction } from "@/app/admin/actions/business";
import { requireAdmin } from "@/lib/auth";
import { sanitizeSearchTerm } from "@/lib/catalog-params";
import { formatDate } from "@/lib/format";
import { INQUIRY_STATUS_LABEL, type InquiryStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Inquiries" };

type Inquiry = {
  id: string; product_id: string | null; product_name: string; name: string; phone: string; email: string;
  message: string; source: "form" | "chat"; status: InquiryStatus; internal_notes: string; created_at: string;
};
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const STATUSES = Object.keys(INQUIRY_STATUS_LABEL) as InquiryStatus[];

export default async function InquiriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const q = sanitizeSearchTerm(one(sp.q).slice(0, 80));
  const status = one(sp.status) as InquiryStatus;

  let query = supabase.from("inquiries").select("*").order("created_at", { ascending: false }).limit(200);
  if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%,message.ilike.%${q}%,product_name.ilike.%${q}%`);
  if (STATUSES.includes(status)) query = query.eq("status", status);
  const { data, error } = await query;
  const inquiries = (data ?? []) as Inquiry[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-5xl">Inquiries</h1>
        <p className="mt-1 max-w-2xl text-muted">Messages sent through the website contact forms and chat. Messages sent in WhatsApp or Messenger are not shown here because the website can&apos;t read them.</p>
      </div>

      <form method="get" className="panel grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto]" aria-label="Filter inquiries">
        <div><label htmlFor="i-q" className="sr-only">Search</label><input id="i-q" name="q" defaultValue={q} placeholder="Search name, contact, message or PC" className="field" /></div>
        <select name="status" defaultValue={STATUSES.includes(status) ? status : ""} className="field sm:w-48" aria-label="Status">
          <option value="">Any status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{INQUIRY_STATUS_LABEL[s]}</option>)}
        </select>
        <button className="btn-secondary">Filter</button>
      </form>

      {error ? (
        <p role="alert" className="panel p-6 text-bad">Could not load inquiries.</p>
      ) : inquiries.length === 0 ? (
        <div className="panel p-8"><p className="font-display text-2xl font-bold">No inquiries found.</p><p className="mt-1 text-muted">When a visitor sends a message from the website it will appear here.</p></div>
      ) : (
        <ul className="grid gap-3">
          {inquiries.map((i) => (
            <li key={i.id} className="panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-lg font-medium">{i.name}{i.source === "chat" && <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-xs text-muted">From chat</span>}</p>
                  <p className="text-sm text-muted">{[i.phone, i.email].filter(Boolean).join(" · ")} &middot; {formatDate(i.created_at, true)}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${i.status === "new" ? "border-copper text-copper-strong" : "border-line text-muted"}`}>{INQUIRY_STATUS_LABEL[i.status]}</span>
              </div>
              <p className="mt-3 whitespace-pre-line">{i.message}</p>
              <p className="mt-2 text-sm text-muted">
                About: {i.product_id ? <Link href={`/admin/products/${i.product_id}`} className="text-copper hover:text-copper-strong">{i.product_name || "product"}</Link> : i.product_name || "No specific PC"}
              </p>
              <form action={updateInquiryAction.bind(null, i.id)} className="mt-4 grid gap-3 border-t border-line-soft pt-4 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
                <div>
                  <label htmlFor={`st-${i.id}`} className="label">Status</label>
                  <select id={`st-${i.id}`} name="status" defaultValue={i.status} className="field">
                    {STATUSES.map((s) => <option key={s} value={s}>{INQUIRY_STATUS_LABEL[s]}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor={`nt-${i.id}`} className="label">Internal notes</label>
                  <textarea id={`nt-${i.id}`} name="internal_notes" rows={2} defaultValue={i.internal_notes} className="field" maxLength={2000} />
                </div>
                <div className="flex gap-2">
                  <button className="btn-secondary">Save</button>
                  {i.status !== "converted" && i.product_id && <Link href={`/admin/sales/new?inquiry=${i.id}`} className="btn-primary">Record sale</Link>}
                </div>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
