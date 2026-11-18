import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { archiveProductAction, setStatusAction } from "@/app/admin/actions/products";
import { StatusBadge } from "@/components/StatusBadge";
import { requireAdmin } from "@/lib/auth";
import { getSettings, sortImages } from "@/lib/data";
import { formatPrice } from "@/lib/format";
import { sanitizeSearchTerm } from "@/lib/catalog-params";
import { mediaUrl } from "@/lib/supabase/public";
import type { Product } from "@/lib/types";

export const metadata: Metadata = { title: "Products" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ProductsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const settings = await getSettings();
  const q = sanitizeSearchTerm(one(sp.q).slice(0, 80));
  const status = one(sp.status);
  const view = one(sp.view) === "archived" ? "archived" : "active";

  let query = supabase.from("products").select("*, product_images(id, storage_path, position, is_primary)").eq("is_archived", view === "archived").order("created_at", { ascending: false }).limit(200);
  if (q) query = query.or(`name.ilike.%${q}%,cpu.ilike.%${q}%,gpu.ilike.%${q}%`);
  if (status === "available" || status === "reserved" || status === "sold") query = query.eq("status", status);
  const { data, error } = await query;
  const products = (data ?? []) as Product[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-5xl">Products</h1>
          {one(sp.deleted) && <p role="status" className="mt-1 text-ok">Product deleted.</p>}
        </div>
        <Link href="/admin/products/new" className="btn-primary">Add a PC</Link>
      </div>

      <form method="get" className="panel grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto]" aria-label="Filter products">
        <div>
          <label htmlFor="p-q" className="sr-only">Search</label>
          <input id="p-q" name="q" defaultValue={q} placeholder="Search by name, CPU or GPU" className="field" />
        </div>
        <select name="status" defaultValue={status} className="field sm:w-40" aria-label="Status">
          <option value="">Any status</option><option value="available">Available</option><option value="reserved">Reserved</option><option value="sold">Sold</option>
        </select>
        <select name="view" defaultValue={view} className="field sm:w-40" aria-label="Show">
          <option value="active">Active</option><option value="archived">Archived</option>
        </select>
        <button className="btn-secondary">Filter</button>
      </form>

      {error ? (
        <p role="alert" className="panel p-6 text-bad">Could not load products.</p>
      ) : products.length === 0 ? (
        <div className="panel p-8">
          <p className="font-display text-2xl font-bold">{q || status ? "No products match." : view === "archived" ? "No archived products." : "No products yet."}</p>
          {!q && !status && view === "active" && <p className="mt-1 text-muted">Add your first PC to show it on the website.</p>}
        </div>
      ) : (
        <ul className="grid gap-3">
          {products.map((p) => {
            const img = mediaUrl(sortImages(p)[0]?.storage_path);
            return (
              <li key={p.id} className="panel flex flex-wrap items-center gap-4 p-3 sm:flex-nowrap">
                <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-raised">
                  {img && <Image src={img} alt="" fill sizes="64px" className="object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/products/${p.id}`} className="block truncate text-lg font-medium hover:text-accent-strong">{p.name}</Link>
                  <p className="truncate text-sm text-muted">{[p.cpu, p.gpu, p.ram].filter(Boolean).join(" | ") || "No specs listed"}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-display text-2xl font-bold text-accent-strong">{formatPrice(p.price, settings.currency)}</span>
                  <div className="flex items-center gap-2">{p.is_featured && <span className="text-xs text-accent">Featured</span>}<StatusBadge status={p.status} /></div>
                </div>
                <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
                  {p.status === "available" && (
                    <form action={setStatusAction.bind(null, p.id, "reserved")}><button className="btn-secondary btn-sm">Reserve</button></form>
                  )}
                  {p.status === "reserved" && (
                    <form action={setStatusAction.bind(null, p.id, "available")}><button className="btn-secondary btn-sm">Make available</button></form>
                  )}
                  {p.status !== "sold" && <Link href={`/admin/sales/new?product=${p.id}`} className="btn-secondary btn-sm">Record sale</Link>}
                  <Link href={`/admin/products/${p.id}`} className="btn-secondary btn-sm">Edit</Link>
                  <form action={archiveProductAction.bind(null, p.id, !p.is_archived)}><button className="btn-secondary btn-sm">{p.is_archived ? "Restore" : "Archive"}</button></form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
