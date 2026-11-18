import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/ProductCard";
import { CATALOG_PAGE_SIZE, parseCatalogParams } from "@/lib/catalog-params";
import { getFilterOptions, getSettings, listProducts } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/public";
import type { Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return {
    title: `Used gaming PCs for sale | ${s.business_name}`,
    description: `Browse all used gaming PCs from ${s.business_name}. Filter by price, CPU, GPU, RAM and storage.`,
    alternates: { canonical: "/catalog" },
  };
}

type SP = Promise<Record<string, string | string[] | undefined>>;

function Select({ name, label, options, value }: { name: string; label: string; options: string[]; value: string }) {
  return (
    <div>
      <label htmlFor={`f-${name}`} className="label">{label}</label>
      <select id={`f-${name}`} name={name} defaultValue={value} className="field">
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

export default async function CatalogPage({ searchParams }: { searchParams: SP }) {
  const filters = parseCatalogParams(await searchParams);
  const settings = await getSettings();

  let products: Product[] = [];
  let total = 0;
  let failed = false;
  let options = { cpu: [] as string[], gpu: [] as string[], ram: [] as string[], storage: [] as string[] };
  if (isSupabaseConfigured()) {
    try {
      [{ products, total }, options] = await Promise.all([listProducts(filters), getFilterOptions()]);
    } catch {
      failed = true;
    }
  }

  const pages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
  const pageHref = (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({
      q: filters.q, cpu: filters.cpu, gpu: filters.gpu, ram: filters.ram, storage: filters.storage,
      min: filters.minPrice ?? "", max: filters.maxPrice ?? "", status: filters.status === "all" ? "" : filters.status,
      sort: filters.sort === "newest" ? "" : filters.sort, page: page > 1 ? page : "",
    })) if (v !== "") p.set(k, String(v));
    const qs = p.toString();
    return qs ? `/catalog?${qs}` : "/catalog";
  };
  const hasFilters = Boolean(filters.q || filters.cpu || filters.gpu || filters.ram || filters.storage || filters.minPrice !== null || filters.maxPrice !== null || filters.status !== "all");

  return (
    <div className="container-page py-10">
      <h1 className="text-5xl">Gaming PCs</h1>
      <p className="mt-2 text-muted">
        {failed ? "" : total === 1 ? "1 PC" : `${total} PCs`}
        {hasFilters && !failed ? " match your filters" : ""}
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[17rem_1fr]">
        <form method="get" action="/catalog" className="panel h-fit space-y-4 p-4" aria-label="Filter PCs">
          <div>
            <label htmlFor="f-q" className="label">Search</label>
            <input id="f-q" name="q" type="search" defaultValue={filters.q} placeholder="Name, CPU, GPU..." className="field" maxLength={80} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="f-min" className="label">Min price</label>
              <input id="f-min" name="min" inputMode="decimal" defaultValue={filters.minPrice ?? ""} className="field" placeholder="0" />
            </div>
            <div>
              <label htmlFor="f-max" className="label">Max price</label>
              <input id="f-max" name="max" inputMode="decimal" defaultValue={filters.maxPrice ?? ""} className="field" placeholder="Any" />
            </div>
          </div>
          <Select name="cpu" label="CPU" options={options.cpu} value={filters.cpu} />
          <Select name="gpu" label="GPU" options={options.gpu} value={filters.gpu} />
          <Select name="ram" label="RAM" options={options.ram} value={filters.ram} />
          <Select name="storage" label="Storage" options={options.storage} value={filters.storage} />
          <div>
            <label htmlFor="f-status" className="label">Availability</label>
            <select id="f-status" name="status" defaultValue={filters.status} className="field">
              <option value="all">All</option>
              <option value="available">Available</option>
              <option value="reserved">Reserved</option>
              {settings.show_sold_products && <option value="sold">Sold</option>}
            </select>
          </div>
          <div>
            <label htmlFor="f-sort" className="label">Sort by</label>
            <select id="f-sort" name="sort" defaultValue={filters.sort} className="field">
              <option value="newest">Newest first</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex-1">Apply filters</button>
            {hasFilters && <Link href="/catalog" className="btn-secondary">Reset</Link>}
          </div>
        </form>

        <section aria-label="Results">
          {failed ? (
            <div role="alert" className="panel p-8">
              <p className="font-medium">We couldn&apos;t load the catalog.</p>
              <p className="mt-1 text-muted">Please refresh the page in a moment, or contact the seller directly.</p>
            </div>
          ) : products.length === 0 ? (
            <div className="panel p-8">
              <p className="text-xl font-display font-bold">{hasFilters ? "No PCs match these filters." : "No PCs are listed yet."}</p>
              <p className="mt-1 text-muted">
                {hasFilters ? "Try a wider price range or remove a filter." : "New PCs are added regularly. Contact the seller to ask what is coming."}
              </p>
              {hasFilters && <Link href="/catalog" className="btn-secondary mt-4">Reset filters</Link>}
            </div>
          ) : (
            <>
              <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {products.map((p, i) => (
                  <li key={p.id}><ProductCard product={p} currency={settings.currency} priority={i < 3} /></li>
                ))}
              </ul>
              {pages > 1 && (
                <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-3">
                  {filters.page > 1 && <Link href={pageHref(filters.page - 1)} className="btn-secondary btn-sm">Previous</Link>}
                  <span className="text-sm text-muted">Page {filters.page} of {pages}</span>
                  {filters.page < pages && <Link href={pageHref(filters.page + 1)} className="btn-secondary btn-sm">Next</Link>}
                </nav>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
