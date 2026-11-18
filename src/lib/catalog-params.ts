import type { ProductStatus } from "./types";

export type CatalogSort = "newest" | "price_asc" | "price_desc";

export type CatalogFilters = {
  q: string;
  cpu: string;
  gpu: string;
  ram: string;
  storage: string;
  minPrice: number | null;
  maxPrice: number | null;
  status: ProductStatus | "all";
  sort: CatalogSort;
  page: number;
};

export const CATALOG_PAGE_SIZE = 12;

type Raw = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const num = (v: string): number | null => {
  if (v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function parseCatalogParams(raw: Raw): CatalogFilters {
  const sort = first(raw.sort);
  const status = first(raw.status);
  const page = Math.floor(Number(first(raw.page)));
  return {
    q: first(raw.q).trim().slice(0, 80),
    cpu: first(raw.cpu).slice(0, 120),
    gpu: first(raw.gpu).slice(0, 120),
    ram: first(raw.ram).slice(0, 120),
    storage: first(raw.storage).slice(0, 120),
    minPrice: num(first(raw.min)),
    maxPrice: num(first(raw.max)),
    status: status === "available" || status === "reserved" || status === "sold" ? status : "all",
    sort: sort === "price_asc" || sort === "price_desc" ? sort : "newest",
    page: Number.isFinite(page) && page >= 1 && page <= 1000 ? page : 1,
  };
}

/** Removes characters that have meaning inside a PostgREST `or(...)` filter or an ILIKE pattern. */
export function sanitizeSearchTerm(term: string): string {
  return term.replace(/[%_\\,()*:"'`]/g, " ").replace(/\s+/g, " ").trim();
}
