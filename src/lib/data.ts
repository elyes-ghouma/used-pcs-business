import { cache } from "react";
import { createPublicClient, isSupabaseConfigured } from "@/lib/supabase/public";
import { CATALOG_PAGE_SIZE, sanitizeSearchTerm, type CatalogFilters } from "@/lib/catalog-params";
import type { Faq, Product, Settings, Testimonial } from "@/lib/types";

export const DEFAULT_SETTINGS: Settings = {
  business_name: "Used Gaming PCs",
  tagline: "",
  description: "",
  hero_headline: "Tested used gaming PCs",
  hero_subheadline: "",
  logo_path: null,
  phone: "",
  whatsapp_number: "",
  facebook_url: "",
  messenger_url: "",
  instagram_url: "",
  location: "",
  working_hours: "",
  currency: "TND",
  delivery_info: "",
  payment_methods: "",
  warranty_policy: "",
  chatbot_welcome: "Hi! I can help you find a PC from the current stock. Tell me your budget or what you want to play.",
  show_sold_products: false,
  highlights: [],
  how_to_buy: [],
};

export const PRODUCT_SELECT = "*, product_images(id, storage_path, position, is_primary)";

/** Public read: database problems must never take the whole storefront down. */
export const getSettings = cache(async (): Promise<Settings> => {
  if (!isSupabaseConfigured()) return DEFAULT_SETTINGS;
  try {
    const { data } = await createPublicClient().from("business_settings").select("*").eq("id", 1).maybeSingle();
    return data ? { ...DEFAULT_SETTINGS, ...(data as Settings) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
});

export const getFaqs = cache(async (): Promise<Faq[]> => {
  if (!isSupabaseConfigured()) return [];
  const { data } = await createPublicClient().from("faqs").select("*").order("sort_order").order("created_at");
  return (data ?? []) as Faq[];
});

export const getTestimonials = cache(async (): Promise<Testimonial[]> => {
  if (!isSupabaseConfigured()) return [];
  const { data } = await createPublicClient().from("testimonials").select("*").order("sort_order").order("created_at");
  return (data ?? []) as Testimonial[];
});

export function sortImages(p: Pick<Product, "product_images">) {
  return [...(p.product_images ?? [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.position - b.position);
}

export async function listProducts(f: CatalogFilters): Promise<{ products: Product[]; total: number }> {
  let query = createPublicClient().from("products").select(PRODUCT_SELECT, { count: "exact" });
  const term = sanitizeSearchTerm(f.q);
  if (term) {
    const like = `%${term}%`;
    query = query.or(["name", "cpu", "gpu", "ram", "storage", "description"].map((c) => `${c}.ilike.${like}`).join(","));
  }
  if (f.cpu) query = query.eq("cpu", f.cpu);
  if (f.gpu) query = query.eq("gpu", f.gpu);
  if (f.ram) query = query.eq("ram", f.ram);
  if (f.storage) query = query.eq("storage", f.storage);
  if (f.status !== "all") query = query.eq("status", f.status);
  if (f.minPrice !== null) query = query.gte("price", f.minPrice);
  if (f.maxPrice !== null) query = query.lte("price", f.maxPrice);

  if (f.sort === "price_asc") query = query.order("price", { ascending: true });
  else if (f.sort === "price_desc") query = query.order("price", { ascending: false });
  else query = query.order("status", { ascending: true }).order("created_at", { ascending: false }); // available first

  const from = (f.page - 1) * CATALOG_PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + CATALOG_PAGE_SIZE - 1);
  if (error) throw new Error("catalog_query_failed");
  return { products: (data ?? []) as Product[], total: count ?? 0 };
}

export async function getFeatured(limit = 6): Promise<Product[]> {
  const { data } = await createPublicClient()
    .from("products").select(PRODUCT_SELECT)
    .eq("is_featured", true).eq("status", "available")
    .order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as Product[];
}

export async function getRecent(limit = 8): Promise<Product[]> {
  const { data } = await createPublicClient()
    .from("products").select(PRODUCT_SELECT)
    .in("status", ["available", "reserved"])
    .order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as Product[];
}

/** Real numbers for the hero readout: how many publicly visible PCs are available / reserved right now. */
export async function getStockCounts(): Promise<{ available: number; reserved: number }> {
  const { data } = await createPublicClient().from("products").select("status").limit(500);
  const rows = (data ?? []) as { status: string }[];
  return {
    available: rows.filter((r) => r.status === "available").length,
    reserved: rows.filter((r) => r.status === "reserved").length,
  };
}

export const getProductBySlug = cache(async (slug: string): Promise<Product | null> => {
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return null;
  const { data } = await createPublicClient().from("products").select(PRODUCT_SELECT).eq("slug", slug).maybeSingle();
  return (data as Product | null) ?? null;
});

export async function getFilterOptions(): Promise<{ cpu: string[]; gpu: string[]; ram: string[]; storage: string[]; min_price: number | null; max_price: number | null }> {
  const { data } = await createPublicClient().rpc("catalog_filter_options");
  return data ?? { cpu: [], gpu: [], ram: [], storage: [], min_price: null, max_price: null };
}

/** Every publicly visible product, for the chatbot (small shop: capped at 200). */
export async function getAllVisibleProducts(): Promise<Product[]> {
  const { data } = await createPublicClient().from("products").select("*").order("created_at", { ascending: false }).limit(200);
  return (data ?? []) as Product[];
}
