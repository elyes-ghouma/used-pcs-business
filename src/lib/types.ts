export type ProductStatus = "available" | "reserved" | "sold";
export type InquiryStatus = "new" | "contacted" | "negotiating" | "converted" | "closed";

export type Highlight = { title: string; description: string };
/** Optional translated versions of owner-written text, e.g. { fr: { description: "..." } }. */
export type Translations = Record<string, Record<string, unknown> | undefined>;
export type ExtraSpec = { label: string; value: string };

export type Settings = {
  business_name: string;
  tagline: string;
  description: string;
  hero_headline: string;
  hero_subheadline: string;
  logo_path: string | null;
  phone: string;
  whatsapp_number: string;
  facebook_url: string;
  messenger_url: string;
  instagram_url: string;
  location: string;
  working_hours: string;
  currency: string;
  delivery_info: string;
  payment_methods: string;
  warranty_policy: string;
  chatbot_welcome: string;
  show_sold_products: boolean;
  highlights: Highlight[];
  how_to_buy: Highlight[];
  /** Language for visitors whose browser does not say (and for link previews). */
  default_locale?: string;
  translations?: Translations;
};

export type ProductImage = { id: string; storage_path: string; position: number; is_primary: boolean };

export type Product = {
  id: string;
  slug: string;
  name: string;
  price: number | string;
  description: string;
  cpu: string;
  gpu: string;
  motherboard: string;
  ram: string;
  storage: string;
  psu: string;
  case_name: string;
  cooling: string;
  os: string;
  extra_specs: ExtraSpec[];
  accessories: string;
  condition: string;
  testing_info: string;
  warranty_info: string;
  status: ProductStatus;
  is_featured: boolean;
  is_archived: boolean;
  status_changed_at: string;
  created_at: string;
  updated_at: string;
  product_images?: ProductImage[];
  translations?: Translations;
};

export type Faq = { id: string; question: string; answer: string; keywords: string; sort_order: number; is_published: boolean; translations?: Translations };
export type Testimonial = { id: string; author_name: string; body: string; sort_order: number; is_published: boolean; translations?: Translations };

export const SPEC_FIELDS = [
  ["cpu", "CPU"],
  ["gpu", "GPU"],
  ["motherboard", "Motherboard"],
  ["ram", "RAM"],
  ["storage", "Storage"],
  ["psu", "Power supply"],
  ["case_name", "Case"],
  ["cooling", "Cooling"],
  ["os", "Operating system"],
] as const;

export type SpecKey = (typeof SPEC_FIELDS)[number][0];

export const STATUS_LABEL: Record<ProductStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
};

export const INQUIRY_STATUS_LABEL: Record<InquiryStatus, string> = {
  new: "New",
  contacted: "Contacted",
  negotiating: "Negotiating",
  converted: "Converted to sale",
  closed: "Closed",
};
