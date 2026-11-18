import { z } from "zod";

const text = (max: number) => z.string().trim().max(max).default("");
const requiredText = (min: number, max: number) => z.string().trim().min(min).max(max);

/** "1 250,500" or "1250.5" -> number. Prices have at most 3 decimals (millimes). */
export const priceSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/\s/g, "").replace(",", "."))
  .refine((s) => /^\d+(\.\d{1,3})?$/.test(s), "Enter a valid price (up to 3 decimals).")
  .transform(Number)
  .refine((n) => n <= 999_999_999, "Price is too large.");

const extraSpecsSchema = z
  .string()
  .default("")
  .transform((s) =>
    s
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 20)
      .map((line) => {
        const i = line.indexOf(":");
        return i > 0
          ? { label: line.slice(0, i).trim().slice(0, 60), value: line.slice(i + 1).trim().slice(0, 200) }
          : { label: "Other", value: line.slice(0, 200) };
      }),
  );

export const productSchema = z.object({
  name: requiredText(2, 160),
  price: priceSchema,
  description: text(5000),
  cpu: text(120),
  gpu: text(120),
  motherboard: text(120),
  ram: text(120),
  storage: text(120),
  psu: text(120),
  case_name: text(120),
  cooling: text(120),
  os: text(120),
  extra_specs: extraSpecsSchema,
  accessories: text(1000),
  condition: text(500),
  testing_info: text(2000),
  warranty_info: text(1000),
  is_featured: z.boolean(),
});
export type ProductInput = z.infer<typeof productSchema>;

/** Error messages here are message KEYS (see src/i18n): the public form translates them for the visitor. */
export const inquirySchema = z
  .object({
    name: z.string().trim().min(2, "err.name").max(100, "err.tooLong"),
    phone: z.string().trim().max(25, "err.phone").default(""),
    email: z.string().trim().max(200, "err.email").default(""),
    message: z.string().trim().min(3, "err.message").max(2000, "err.tooLong"),
    productId: z.string().uuid().nullable().default(null),
  })
  .refine((v) => v.phone || v.email, { message: "err.contactRequired", path: ["phone"] })
  .refine((v) => !v.phone || /^[0-9+()\-\s.]{6,25}$/.test(v.phone), { message: "err.phone", path: ["phone"] })
  .refine((v) => !v.email || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email), { message: "err.email", path: ["email"] });

export const saleSchema = z.object({
  productId: z.string().uuid("Choose a product."),
  salePrice: priceSchema,
  soldAt: z.string().trim().min(1, "Choose the sale date."),
  customerName: text(120),
  customerPhone: text(40),
  customerEmail: text(200),
  notes: text(2000),
  inquiryId: z.string().uuid().nullable().default(null),
});

const urlOrEmpty = z
  .string()
  .trim()
  .max(300)
  .default("")
  .refine((v) => v === "" || /^https?:\/\//i.test(v), "Must start with https:// (or leave empty).");

/** One entry per line, "Title | description". */
const pairs = z
  .string()
  .default("")
  .transform((s) =>
    s
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 8)
      .map((line) => {
        const i = line.indexOf("|");
        return i > 0
          ? { title: line.slice(0, i).trim().slice(0, 80), description: line.slice(i + 1).trim().slice(0, 300) }
          : { title: line.slice(0, 80), description: "" };
      }),
  );

/** Max lengths of the optional French versions (same limits as the main text). Keys are the column names. */
export const SETTINGS_FR_TEXT = { tagline: 160, description: 1000, hero_headline: 120, hero_subheadline: 300, working_hours: 500, delivery_info: 2000, payment_methods: 1000, warranty_policy: 2000, chatbot_welcome: 500 };
export const SETTINGS_FR_LISTS = ["highlights", "how_to_buy"];
export const PRODUCT_FR_TEXT = { description: 5000, condition: 500, testing_info: 2000, accessories: 1000, warranty_info: 1000 };
export const FAQ_FR_TEXT = { question: 200, answer: 2000, keywords: 300 };
export const TESTIMONIAL_FR_TEXT = { body: 600 };

/** Optional French text from the admin forms (`fr_<field>` inputs) as the `translations` JSON column. Empty fields are left out. */
export function buildTranslations(get: (key: string) => string, text: Record<string, number>, lists: string[] = []) {
  const fr: Record<string, unknown> = {};
  for (const [field, max] of Object.entries(text)) {
    const v = get(`fr_${field}`).trim().slice(0, max);
    if (v) fr[field] = v;
  }
  for (const field of lists) {
    const items = pairs.parse(get(`fr_${field}`));
    if (items.length) fr[field] = items;
  }
  return Object.keys(fr).length ? { fr } : {};
}

export const settingsSchema = z.object({
  default_locale: z.enum(["en", "fr"]).default("en"),
  business_name: requiredText(1, 80),
  tagline: text(160),
  description: text(1000),
  hero_headline: requiredText(1, 120),
  hero_subheadline: text(300),
  phone: text(30),
  whatsapp_number: text(30),
  facebook_url: urlOrEmpty,
  messenger_url: urlOrEmpty,
  instagram_url: urlOrEmpty,
  location: text(300),
  working_hours: text(500),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code, e.g. TND."),
  delivery_info: text(2000),
  payment_methods: text(1000),
  warranty_policy: text(2000),
  chatbot_welcome: requiredText(1, 500),
  show_sold_products: z.boolean(),
  highlights: pairs,
  how_to_buy: pairs,
});

export const faqSchema = z.object({
  question: requiredText(3, 200),
  answer: requiredText(1, 2000),
  keywords: text(300),
});

export const testimonialSchema = z.object({
  author_name: requiredText(1, 80),
  body: requiredText(3, 600),
});

export type FieldErrors = Record<string, string[] | undefined>;
export type ActionState = { ok: boolean; message?: string; fieldErrors?: FieldErrors };

export function flattenErrors(err: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? "form");
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
