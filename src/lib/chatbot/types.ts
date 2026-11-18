import type { Faq, Product, ProductStatus, Settings } from "../types";

/** The only product data the bot is allowed to talk about. It always comes from the database. */
export type BotProduct = Pick<
  Product,
  | "id" | "slug" | "name" | "price" | "status" | "cpu" | "gpu" | "ram" | "storage" | "motherboard"
  | "psu" | "case_name" | "cooling" | "os" | "condition" | "warranty_info" | "testing_info" | "accessories"
>;

export type BotContext = {
  settings: Pick<
    Settings,
    | "currency" | "phone" | "whatsapp_number" | "location" | "working_hours" | "delivery_info"
    | "payment_methods" | "warranty_policy" | "how_to_buy" | "chatbot_welcome"
  >;
  faqs: Pick<Faq, "question" | "answer" | "keywords">[];
  /** Every publicly visible product (what a visitor could see in the catalog). */
  products: BotProduct[];
  /** Product the visitor is currently looking at, if any. */
  currentProductId?: string | null;
};

export type BotProductCard = {
  id: string;
  slug: string;
  name: string;
  price: number;
  status: ProductStatus;
  summary: string[];
};

export type BotReply = {
  text: string;
  products?: BotProductCard[];
  /** Tells the UI to show the "contact the seller" options. */
  action?: "offer_seller";
  suggestions?: string[];
};

/**
 * Plug-in point for a future AI provider. It is only consulted when the deterministic engine has no
 * confident answer, runs on the server only, and must fall back (return null) on any failure.
 */
export interface FallbackResponder {
  respond(message: string, ctx: BotContext): Promise<BotReply | null>;
}
