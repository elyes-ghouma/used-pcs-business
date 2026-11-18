import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/format";
import { makeProductSlug, slugify } from "@/lib/slug";
import { productInterestMessage, safeExternalUrl, telUrl, whatsappUrl } from "@/lib/contact";
import { detectImageKind, isValidMediaPath, validateImageFile } from "@/lib/images";
import { rateLimit } from "@/lib/ratelimit";
import { parseCatalogParams, sanitizeSearchTerm } from "@/lib/catalog-params";
import { inquirySchema, priceSchema, productSchema, saleSchema, settingsSchema } from "@/lib/validation";

describe("formatPrice", () => {
  it("formats TND with the currency code and keeps millimes only when present", () => {
    expect(formatPrice(1500, "TND")).toBe("TND 1,500");
    expect(formatPrice("1850.500", "TND")).toBe("TND 1,850.500");
    expect(formatPrice(99.9, "TND")).toBe("TND 99.900");
  });
  it("respects a configured currency and survives bad input", () => {
    expect(formatPrice(10, "EUR")).toBe("EUR 10");
    expect(formatPrice("abc", "TND")).toBe("");
    expect(formatPrice(5, "???")).toBe("5 ???");
  });
});

describe("slug", () => {
  it("slugifies accents and symbols", () => {
    expect(slugify("PC Gamer Ryzen 5 / RTX 3060 — Édition!")).toBe("pc-gamer-ryzen-5-rtx-3060-edition");
    expect(slugify("!!!")).toBe("");
  });
  it("makes unique, valid slugs", () => {
    const a = makeProductSlug("Falcon RTX 3060", () => 0.1);
    const b = makeProductSlug("Falcon RTX 3060", () => 0.9);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(makeProductSlug("???")).toMatch(/^pc-[a-z0-9]{5}$/);
  });
});

describe("contact links", () => {
  it("builds a WhatsApp link that identifies the product", () => {
    const url = whatsappUrl("+216 20 123 456", productInterestMessage("Falcon RTX 3060"))!;
    expect(url.startsWith("https://wa.me/21620123456?text=")).toBe(true);
    expect(decodeURIComponent(url.split("text=")[1])).toBe("Hello, I'm interested in Falcon RTX 3060 listed on your website. Is it still available?");
  });
  it("returns null for unusable numbers so no dead button is rendered", () => {
    expect(whatsappUrl("")).toBeNull();
    expect(whatsappUrl("12")).toBeNull();
    expect(telUrl("")).toBeNull();
    expect(telUrl("+216 20 123 456")).toBe("tel:+21620123456");
  });
  it("only allows http(s) links", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,x")).toBeNull();
    expect(safeExternalUrl("not a url")).toBeNull();
    expect(safeExternalUrl("https://m.me/shop")).toBe("https://m.me/shop");
  });
});

describe("images", () => {
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const webp = new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]);
  it("detects real formats by magic bytes", () => {
    expect(detectImageKind(jpg)).toBe("jpg");
    expect(detectImageKind(png)).toBe("png");
    expect(detectImageKind(webp)).toBe("webp");
  });
  it("rejects disguised files", () => {
    expect(detectImageKind(new Uint8Array(Buffer.from("<svg onload=alert(1)>")))).toBeNull();
    expect(detectImageKind(new Uint8Array(Buffer.from("GIF89a......")))).toBeNull();
    expect(detectImageKind(new Uint8Array())).toBeNull();
  });
  it("validates type and size", () => {
    expect(validateImageFile({ type: "image/png", size: 1000 })).toBeNull();
    expect(validateImageFile({ type: "image/svg+xml", size: 1000 })).toMatch(/JPG, PNG or WebP/);
    expect(validateImageFile({ type: "image/png", size: 6 * 1024 * 1024 })).toMatch(/5 MB/);
    expect(validateImageFile({ type: "image/png", size: 0 })).toMatch(/empty/);
  });
  it("accepts only the storage paths this app generates", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(isValidMediaPath(`products/${id}/${id}.jpg`, `products/${id}`)).toBe(true);
    expect(isValidMediaPath(`products/${id}/../../x.jpg`, `products/${id}`)).toBe(false);
    expect(isValidMediaPath(`branding/${id}.png`, "branding")).toBe(true);
    expect(isValidMediaPath(`branding/${id}.svg`, "branding")).toBe(false);
  });
});

describe("rateLimit", () => {
  it("allows up to max hits per window, then blocks, then recovers", () => {
    const key = "t-" + Math.random();
    expect([1, 2, 3].map((i) => rateLimit(key, 3, 1000, i))).toEqual([true, true, true]);
    expect(rateLimit(key, 3, 1000, 4)).toBe(false);
    expect(rateLimit(key, 3, 1000, 1500)).toBe(true);
  });
});

describe("catalog params", () => {
  it("parses and clamps URL parameters", () => {
    const f = parseCatalogParams({ q: "  rtx ", min: "500", max: "2000,5", sort: "price_asc", page: "3", status: "sold" });
    expect(f).toMatchObject({ q: "rtx", minPrice: 500, maxPrice: 2000.5, sort: "price_asc", page: 3, status: "sold" });
  });
  it("falls back to safe defaults on junk", () => {
    const f = parseCatalogParams({ sort: "DROP TABLE", page: "-4", min: "abc", status: "x" });
    expect(f).toMatchObject({ sort: "newest", page: 1, minPrice: null, status: "all" });
  });
  it("strips PostgREST filter syntax from search text", () => {
    expect(sanitizeSearchTerm("rtx),status.eq.sold,(name.ilike.%")).not.toMatch(/[(),%]/);
  });
});

describe("validation", () => {
  it("parses prices with comma decimals and spaces, up to 3 decimals", () => {
    expect(priceSchema.parse("1 250,5")).toBe(1250.5);
    expect(priceSchema.parse("99.999")).toBe(99.999);
    expect(priceSchema.safeParse("12.3456").success).toBe(false);
    expect(priceSchema.safeParse("-5").success).toBe(false);
    expect(priceSchema.safeParse("abc").success).toBe(false);
  });
  it("product requires only a name and price; specs are optional", () => {
    const ok = productSchema.safeParse({ name: "Falcon", price: "1500", is_featured: false });
    expect(ok.success).toBe(true);
    expect(productSchema.safeParse({ name: "F", price: "1500", is_featured: false }).success).toBe(false);
  });
  it("parses extra specs lines", () => {
    const r = productSchema.parse({ name: "Falcon", price: "1", is_featured: false, extra_specs: "Monitor: 24in 144Hz\nKeyboard" });
    expect(r.extra_specs).toEqual([{ label: "Monitor", value: "24in 144Hz" }, { label: "Other", value: "Keyboard" }]);
  });
  it("inquiry needs a way to reply", () => {
    expect(inquirySchema.safeParse({ name: "Sami", message: "Hello there" }).success).toBe(false);
    expect(inquirySchema.safeParse({ name: "Sami", message: "Hello there", phone: "20 123 456" }).success).toBe(true);
    expect(inquirySchema.safeParse({ name: "Sami", message: "Hello there", email: "bad" }).success).toBe(false);
  });
  it("sale validation", () => {
    const base = { productId: "123e4567-e89b-12d3-a456-426614174000", salePrice: "1800", soldAt: "2026-11-18" };
    expect(saleSchema.safeParse(base).success).toBe(true);
    expect(saleSchema.safeParse({ ...base, productId: "x" }).success).toBe(false);
    expect(saleSchema.safeParse({ ...base, salePrice: "-1" }).success).toBe(false);
  });
  it("settings: currency code and https links", () => {
    const base = { business_name: "Shop", hero_headline: "Hi", currency: "tnd", chatbot_welcome: "Hello", show_sold_products: false };
    expect(settingsSchema.parse(base).currency).toBe("TND");
    expect(settingsSchema.safeParse({ ...base, currency: "TUNISIAN" }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...base, facebook_url: "javascript:alert(1)" }).success).toBe(false);
    expect(settingsSchema.parse({ ...base, highlights: "Tested | Every PC is tested\nFair prices" }).highlights).toEqual([
      { title: "Tested", description: "Every PC is tested" },
      { title: "Fair prices", description: "" },
    ]);
  });
});
