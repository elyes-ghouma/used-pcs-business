import type { Metadata } from "next";
import Link from "next/link";
import { FiltersPanel } from "@/components/FiltersPanel";
import { ProductCard } from "@/components/ProductCard";
import { CATALOG_PAGE_SIZE, parseCatalogParams } from "@/lib/catalog-params";
import { getPublicSettings, getT } from "@/i18n/server";
import { getFilterOptions, listProducts } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/public";
import type { Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getPublicSettings();
  const { t } = await getT();
  return {
    title: t("catalog.meta.title", { name: s.business_name }),
    description: t("catalog.meta.desc", { name: s.business_name }),
    alternates: { canonical: "/catalog" },
  };
}

type SP = Promise<Record<string, string | string[] | undefined>>;

function Select({ name, label, options, value, any }: { name: string; label: string; options: string[]; value: string; any: string }) {
  return (
    <div>
      <label htmlFor={`f-${name}`} className="label">{label}</label>
      <select id={`f-${name}`} name={name} defaultValue={value} className="field">
        <option value="">{any}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

export default async function CatalogPage({ searchParams }: { searchParams: SP }) {
  const filters = parseCatalogParams(await searchParams);
  const settings = await getPublicSettings();
  const { t } = await getT();

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

  const activeCount = [filters.q, filters.cpu, filters.gpu, filters.ram, filters.storage, filters.minPrice !== null ? "x" : "", filters.maxPrice !== null ? "x" : "", filters.status !== "all" ? "x" : ""].filter(Boolean).length;

  return (
    <div className="container-page py-10">
      <h1 className="text-5xl">{t("catalog.title")}</h1>
      <p className="mt-2 text-muted">
        {failed ? "" : t(`${hasFilters ? "catalog.countFiltered" : "catalog.count"}.${total === 1 ? "one" : "other"}`, { n: total })}
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[17rem_1fr]">
        <FiltersPanel activeCount={activeCount}>
        <form method="get" action="/catalog" className="panel space-y-4 p-4" aria-label={t("catalog.filterAria")}>
          <div>
            <label htmlFor="f-q" className="label">{t("catalog.search")}</label>
            <input id="f-q" name="q" type="search" defaultValue={filters.q} placeholder={t("catalog.searchPlaceholder")} className="field" maxLength={80} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="f-min" className="label">{t("catalog.minPrice")}</label>
              <input id="f-min" name="min" inputMode="decimal" defaultValue={filters.minPrice ?? ""} className="field" placeholder="0" />
            </div>
            <div>
              <label htmlFor="f-max" className="label">{t("catalog.maxPrice")}</label>
              <input id="f-max" name="max" inputMode="decimal" defaultValue={filters.maxPrice ?? ""} className="field" placeholder={t("common.any")} />
            </div>
          </div>
          <Select name="cpu" label={t("spec.cpu")} options={options.cpu} value={filters.cpu} any={t("common.any")} />
          <Select name="gpu" label={t("spec.gpu")} options={options.gpu} value={filters.gpu} any={t("common.any")} />
          <Select name="ram" label={t("spec.ram")} options={options.ram} value={filters.ram} any={t("common.any")} />
          <Select name="storage" label={t("spec.storage")} options={options.storage} value={filters.storage} any={t("common.any")} />
          <div>
            <label htmlFor="f-status" className="label">{t("catalog.availability")}</label>
            <select id="f-status" name="status" defaultValue={filters.status} className="field">
              <option value="all">{t("catalog.all")}</option>
              <option value="available">{t("status.available")}</option>
              <option value="reserved">{t("status.reserved")}</option>
              {settings.show_sold_products && <option value="sold">{t("status.sold")}</option>}
            </select>
          </div>
          <div>
            <label htmlFor="f-sort" className="label">{t("catalog.sort")}</label>
            <select id="f-sort" name="sort" defaultValue={filters.sort} className="field">
              <option value="newest">{t("catalog.sort.newest")}</option>
              <option value="price_asc">{t("catalog.sort.priceAsc")}</option>
              <option value="price_desc">{t("catalog.sort.priceDesc")}</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex-1">{t("catalog.apply")}</button>
            {hasFilters && <Link href="/catalog" className="btn-secondary">{t("catalog.reset")}</Link>}
          </div>
        </form>
        </FiltersPanel>

        <section aria-label={t("catalog.results")}>
          {failed ? (
            <div role="alert" className="panel p-8">
              <p className="font-medium">{t("catalog.error.title")}</p>
              <p className="mt-1 text-muted">{t("catalog.error.text")}</p>
            </div>
          ) : products.length === 0 ? (
            <div className="panel p-8">
              <p className="text-xl font-display font-bold">{hasFilters ? t("catalog.empty.filtered") : t("catalog.empty.none")}</p>
              <p className="mt-1 text-muted">
                {hasFilters ? t("catalog.empty.filteredHint") : t("catalog.empty.noneHint")}
              </p>
              {hasFilters && <Link href="/catalog" className="btn-secondary mt-4">{t("catalog.resetFilters")}</Link>}
            </div>
          ) : (
            <>
              <ul className="grid gap-6 md:grid-cols-2 min-[1500px]:grid-cols-3">
                {products.map((p, i) => (
                  <li key={p.id}><ProductCard product={p} currency={settings.currency} priority={i < 3} /></li>
                ))}
              </ul>
              {pages > 1 && (
                <nav aria-label={t("catalog.pagination")} className="mt-8 flex items-center justify-center gap-3">
                  {filters.page > 1 && <Link href={pageHref(filters.page - 1)} className="btn-secondary btn-sm">{t("catalog.prev")}</Link>}
                  <span className="text-sm text-muted">{t("catalog.page", { p: filters.page, n: pages })}</span>
                  {filters.page < pages && <Link href={pageHref(filters.page + 1)} className="btn-secondary btn-sm">{t("catalog.next")}</Link>}
                </nav>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
