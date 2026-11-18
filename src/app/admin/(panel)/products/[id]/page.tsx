import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { archiveProductAction, setStatusAction, updateProductAction } from "@/app/admin/actions/products";
import { DeleteProductButton } from "@/components/admin/DeleteProductButton";
import { ImageManager } from "@/components/admin/ImageManager";
import { ProductForm } from "@/components/admin/ProductForm";
import { StatusBadge } from "@/components/StatusBadge";
import { requireAdmin } from "@/lib/auth";
import { getSettings, sortImages } from "@/lib/data";
import { formatDate, formatPrice } from "@/lib/format";
import { mediaUrl } from "@/lib/supabase/public";
import type { Product } from "@/lib/types";

export const metadata: Metadata = { title: "Edit PC" };

type HistoryRow = { id: number; from_status: string | null; to_status: string; note: string | null; created_at: string };

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase } = await requireAdmin();
  const settings = await getSettings();

  const [{ data }, { data: history }, { data: opts }] = await Promise.all([
    supabase.from("products").select("*, product_images(id, storage_path, position, is_primary)").eq("id", id).maybeSingle(),
    supabase.from("product_status_history").select("id, from_status, to_status, note, created_at").eq("product_id", id).order("id", { ascending: false }).limit(20),
    supabase.rpc("catalog_filter_options"),
  ]);
  if (!data) notFound();
  const product = data as Product;
  const images = sortImages(product)
    .map((i) => ({ id: i.id, url: mediaUrl(i.storage_path), is_primary: i.is_primary }))
    .filter((i): i is { id: string; url: string; is_primary: boolean } => Boolean(i.url));
  const suggestions = { cpu: opts?.cpu ?? [], gpu: opts?.gpu ?? [], ram: opts?.ram ?? [], storage: opts?.storage ?? [] };

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <Link href="/admin/products" className="text-sm text-muted hover:text-text">&larr; Products</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-5xl">{product.name}</h1>
          <StatusBadge status={product.status} />
          {product.is_archived && <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">Archived</span>}
        </div>
        <p className="mt-1 text-muted">{formatPrice(product.price, settings.currency)} &middot; added {formatDate(product.created_at)}</p>
        {sp.created && <p role="status" className="mt-3 rounded-md border border-ok/40 bg-ok/10 px-3 py-2 text-ok">Saved. You can now add photos below.</p>}
        {!product.is_archived && <p className="mt-2 text-sm"><Link href={`/pcs/${product.slug}`} target="_blank" className="text-accent hover:text-accent-strong">View on the website</Link></p>}
      </div>

      <section aria-labelledby="stock-heading" className="panel space-y-4 p-5">
        <h2 id="stock-heading" className="text-2xl">Stock status</h2>
        {product.status === "sold" ? (
          <p className="text-muted">This PC is sold. To undo it, void the sale in <Link href="/admin/sales" className="text-accent underline">Sales</Link>.</p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            {product.status === "available" ? (
              <form action={setStatusAction.bind(null, product.id, "reserved")} className="flex flex-wrap items-end gap-2">
                <div><label htmlFor="note" className="label">Note (optional)</label><input id="note" name="note" className="field" placeholder="e.g. Reserved for Ali until Friday" maxLength={300} /></div>
                <button className="btn-secondary">Mark as reserved</button>
              </form>
            ) : (
              <form action={setStatusAction.bind(null, product.id, "available")}><button className="btn-secondary">Make available again</button></form>
            )}
            <Link href={`/admin/sales/new?product=${product.id}`} className="btn-primary">Record sale</Link>
          </div>
        )}
        <details>
          <summary className="cursor-pointer text-sm text-muted">Status history</summary>
          <ul className="mt-2 divide-y divide-line-soft text-sm">
            {((history ?? []) as HistoryRow[]).map((h) => (
              <li key={h.id} className="py-2">
                <span className="font-medium">{h.from_status ? `${h.from_status} → ${h.to_status}` : h.to_status}</span>
                <span className="text-muted"> &middot; {formatDate(h.created_at, true)}{h.note ? ` · ${h.note}` : ""}</span>
              </li>
            ))}
          </ul>
        </details>
      </section>

      <ProductForm action={updateProductAction.bind(null, product.id)} product={product} suggestions={suggestions} submitLabel="Save changes" />

      <ImageManager productId={product.id} images={images} />

      <section aria-labelledby="danger-heading" className="panel space-y-4 border-bad/30 p-5">
        <h2 id="danger-heading" className="text-2xl">Archive or delete</h2>
        <p className="text-sm text-muted">Archiving hides the PC from the website but keeps its sales and customer history. Delete only works for PCs that were never sold.</p>
        <div className="flex flex-wrap items-start gap-3">
          <form action={archiveProductAction.bind(null, product.id, !product.is_archived)}>
            <button className="btn-secondary">{product.is_archived ? "Restore to the website" : "Archive"}</button>
          </form>
          <DeleteProductButton productId={product.id} productName={product.name} />
        </div>
      </section>
    </div>
  );
}
