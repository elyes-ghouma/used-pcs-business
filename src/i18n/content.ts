import type { Faq, Product, Settings, Testimonial } from "@/lib/types";
import type { Locale } from "./config";

/**
 * Owner-written content (hero text, policies, FAQ, product descriptions) is stored once in the main language plus an
 * optional French version in a `translations` JSON column. These pure helpers pick what a visitor should see:
 * the French text when it exists, otherwise the main text.
 */
type Tr = Record<string, Record<string, unknown> | undefined> | null | undefined;

const text = (tr: Tr, lang: string, field: string): string | undefined => {
  const v = tr?.[lang]?.[field];
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
};
const list = (tr: Tr, lang: string, field: string): { title: string; description: string }[] | undefined => {
  const v = tr?.[lang]?.[field];
  return Array.isArray(v) && v.length > 0 ? (v as { title: string; description: string }[]) : undefined;
};

/** The English defaults shipped in the database. While the owner has not edited them, a French visitor sees the French default. */
export const EN_DEFAULTS = {
  hero_headline: "Tested used gaming PCs",
  chatbot_welcome: "Hi! I can help you find a PC from the current stock. Tell me your budget or what you want to play.",
  how_to_buy: [
    { title: "Pick a PC", description: "Browse the catalog and open the one you like." },
    { title: "Contact the seller", description: "Message or call the seller to check availability and ask questions." },
    { title: "Arrange payment and delivery", description: "Payment and delivery are agreed directly with the seller. There is no online checkout." },
  ],
};

export const FR_DEFAULTS = {
  hero_headline: "Des PC gamer d’occasion testés",
  chatbot_welcome: "Bonjour ! Je peux vous aider à trouver un PC dans le stock actuel. Donnez-moi votre budget ou ce que vous voulez jouer.",
  how_to_buy: [
    { title: "Choisissez un PC", description: "Parcourez le catalogue et ouvrez celui qui vous plaît." },
    { title: "Contactez le vendeur", description: "Écrivez ou appelez le vendeur pour vérifier la disponibilité et poser vos questions." },
    { title: "Réglez paiement et livraison", description: "Le paiement et la livraison se règlent directement avec le vendeur. Il n’y a pas de paiement en ligne." },
  ],
};

const sameSteps = (a: { title: string; description: string }[], b: { title: string; description: string }[]) =>
  a.length === b.length && a.every((s, i) => s.title === b[i].title && s.description === b[i].description);

export const SETTINGS_TEXT_FIELDS = [
  "tagline", "description", "hero_headline", "hero_subheadline", "working_hours",
  "delivery_info", "payment_methods", "warranty_policy", "chatbot_welcome",
] as const;
export const SETTINGS_LIST_FIELDS = ["highlights", "how_to_buy"] as const;
export const PRODUCT_TEXT_FIELDS = ["description", "condition", "testing_info", "accessories", "warranty_info"] as const;

export function localizeSettings(s: Settings, locale: Locale): Settings {
  if (locale === "en") return s;
  const out: Settings = { ...s };
  for (const f of SETTINGS_TEXT_FIELDS) {
    const v = text(s.translations, locale, f);
    if (v) out[f] = v;
  }
  for (const f of SETTINGS_LIST_FIELDS) {
    const v = list(s.translations, locale, f);
    if (v) out[f] = v;
  }
  // Untouched English defaults are shown in French rather than leaving an English hero under a French interface.
  if (!text(s.translations, locale, "hero_headline") && s.hero_headline === EN_DEFAULTS.hero_headline) out.hero_headline = FR_DEFAULTS.hero_headline;
  if (!text(s.translations, locale, "chatbot_welcome") && s.chatbot_welcome === EN_DEFAULTS.chatbot_welcome) out.chatbot_welcome = FR_DEFAULTS.chatbot_welcome;
  if (!list(s.translations, locale, "how_to_buy") && sameSteps(s.how_to_buy, EN_DEFAULTS.how_to_buy)) out.how_to_buy = FR_DEFAULTS.how_to_buy;
  return out;
}

export function localizeProduct<T extends Pick<Product, "description" | "condition" | "testing_info" | "accessories" | "warranty_info"> & { translations?: Tr }>(p: T, locale: Locale): T {
  if (locale === "en") return p;
  const out = { ...p };
  for (const f of PRODUCT_TEXT_FIELDS) {
    const v = text(p.translations, locale, f);
    if (v) out[f] = v;
  }
  return out;
}

export function localizeFaq<T extends Pick<Faq, "question" | "answer" | "keywords"> & { translations?: Tr }>(f: T, locale: Locale): T {
  if (locale === "en") return f;
  return {
    ...f,
    question: text(f.translations, locale, "question") ?? f.question,
    answer: text(f.translations, locale, "answer") ?? f.answer,
    // keywords from both languages help the chatbot recognise the question whatever language it is asked in
    keywords: [f.keywords, text(f.translations, locale, "keywords")].filter(Boolean).join(", "),
  };
}

export function localizeTestimonial<T extends Pick<Testimonial, "body"> & { translations?: Tr }>(t: T, locale: Locale): T {
  if (locale === "en") return t;
  return { ...t, body: text(t.translations, locale, "body") ?? t.body };
}
