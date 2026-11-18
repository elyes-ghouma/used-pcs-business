import type { MetadataRoute } from "next";
import { createPublicClient, isSupabaseConfigured } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/catalog`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/contact`, changeFrequency: "monthly", priority: 0.5 },
  ];
  if (!isSupabaseConfigured()) return entries;
  try {
    const { data } = await createPublicClient().from("products").select("slug, updated_at").order("created_at", { ascending: false }).limit(1000);
    for (const p of data ?? []) {
      entries.push({ url: `${base}/pcs/${p.slug}`, lastModified: new Date(p.updated_at), changeFrequency: "weekly", priority: 0.7 });
    }
  } catch {
    // a sitemap without products is better than a failing sitemap
  }
  return entries;
}
