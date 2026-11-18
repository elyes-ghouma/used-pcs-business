import { describe, expect, it } from "vitest";
import { respond } from "@/lib/chatbot/engine";
import type { BotContext, BotProduct } from "@/lib/chatbot/types";
import { formatDate, formatPrice } from "@/lib/format";
import { productInterestMessage } from "@/lib/contact";
import { pickFromAcceptLanguage } from "@/i18n/config";
import { EN_DEFAULTS, FR_DEFAULTS, localizeFaq, localizeProduct, localizeSettings } from "@/i18n/content";
import { en } from "@/i18n/messages/en";
import { fr } from "@/i18n/messages/fr";
import { createT, translateIfKey } from "@/i18n/translate";
import { DEFAULT_SETTINGS } from "@/lib/data";
import { buildTranslations } from "@/lib/validation";

describe("dictionaries", () => {
  it("French defines exactly the same keys as English", () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });

  it("every translation keeps the same {placeholders} as the English text", () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(vars(fr[key]), key).toEqual(vars(en[key]));
    }
  });

  it("no French text is left empty or identical to English by accident (apart from brand words)", () => {
    const sameOk = new Set(["contact.meta.title", "header.whatsapp", "chat.button", "chat.dialog", "chat.title", "chat.panel.whatsapp", "chat.panel.messenger", "product.meta.title", "catalog.title"]);
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(fr[key].trim(), key).not.toBe("");
      if (fr[key] === en[key] && !sameOk.has(key)) {
        // allowed only for strings that are universally identical (single words like "Messenger") or pure placeholders
        expect(en[key].split(" ").length <= 2 || /^\{/.test(en[key]), `${key} looks untranslated: "${fr[key]}"`).toBe(true);
      }
    }
  });

  it("translates with parameters and falls back to English for unknown keys", () => {
    expect(createT("fr")("gallery.alt", { name: "Falcon", i: 2, n: 5 })).toBe("Falcon, photo 2 sur 5");
    expect(translateIfKey("fr", "err.phone")).toBe("Indiquez un numéro de téléphone valide.");
    expect(translateIfKey("fr", "not.a.key")).toBe("not.a.key");
    expect(translateIfKey("fr", undefined)).toBe("");
  });
});

describe("language choice", () => {
  it("reads the browser's preferred language", () => {
    expect(pickFromAcceptLanguage("fr-FR,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(pickFromAcceptLanguage("en-US,en;q=0.9,fr;q=0.8")).toBe("en");
    expect(pickFromAcceptLanguage("ar-TN,ar;q=0.9,fr;q=0.5")).toBe("fr"); // first supported language by preference
    expect(pickFromAcceptLanguage("de,es;q=0.8")).toBeNull();
    expect(pickFromAcceptLanguage("*")).toBeNull();
    expect(pickFromAcceptLanguage(null)).toBeNull();
    expect(pickFromAcceptLanguage("fr;q=0, en;q=0.4")).toBe("en"); // q=0 means "not acceptable"
  });
});

describe("formatting", () => {
  it("French prices read the Tunisian way, with no invisible characters", () => {
    const p = formatPrice(1850, "TND", "fr");
    expect(p).toBe("1 850 TND");
    expect(formatPrice("1180.500", "TND", "fr")).toBe("1 180,500 TND");
    expect(formatPrice(4250.5, "TND", "fr")).toBe("4 250,500 TND");
    for (const s of [p, formatPrice(1234567.891, "TND", "fr")]) expect(s).not.toMatch(/[  ]/);
  });

  it("English prices are unchanged", () => {
    expect(formatPrice(1850, "TND")).toBe("TND 1,850");
    expect(formatPrice("1850.500", "TND", "en")).toBe("TND 1,850.500");
  });

  it("dates follow the language", () => {
    expect(formatDate("2026-11-18T10:00:00Z", false, "en")).toMatch(/18 Nov 2026/);
    expect(formatDate("2026-11-18T10:00:00Z", false, "fr")).toMatch(/18 nov\.? 2026/);
  });

  it("the prefilled WhatsApp message follows the language and names the product", () => {
    expect(productInterestMessage("Falcon RTX 3060")).toBe("Hello, I'm interested in Falcon RTX 3060 listed on your website. Is it still available?");
    expect(productInterestMessage("Falcon RTX 3060", "fr")).toBe("Bonjour, je suis intéressé(e) par Falcon RTX 3060 sur votre site. Est-il toujours disponible ?");
  });
});

describe("owner content in French", () => {
  const settings = { ...DEFAULT_SETTINGS, how_to_buy: EN_DEFAULTS.how_to_buy, hero_headline: EN_DEFAULTS.hero_headline, chatbot_welcome: EN_DEFAULTS.chatbot_welcome };

  it("English visitors always get the main text", () => {
    const withFr = { ...settings, hero_headline: "Main headline", translations: { fr: { hero_headline: "Titre" } } };
    expect(localizeSettings(withFr, "en").hero_headline).toBe("Main headline");
  });

  it("uses the owner's French text when present and falls back to the main text when it is empty", () => {
    const s = { ...settings, hero_headline: "Main headline", delivery_info: "Delivery in Tunis", translations: { fr: { hero_headline: "Titre principal", delivery_info: "   " } } };
    const out = localizeSettings(s, "fr");
    expect(out.hero_headline).toBe("Titre principal");
    expect(out.delivery_info).toBe("Delivery in Tunis"); // blank translation ignored
  });

  it("shows the French default for an untouched English default, but never overrides the owner's own text", () => {
    const untouched = localizeSettings(settings, "fr");
    expect(untouched.hero_headline).toBe(FR_DEFAULTS.hero_headline);
    expect(untouched.chatbot_welcome).toBe(FR_DEFAULTS.chatbot_welcome);
    expect(untouched.how_to_buy).toEqual(FR_DEFAULTS.how_to_buy);

    const edited = localizeSettings({ ...settings, hero_headline: "My own headline", how_to_buy: [{ title: "Step", description: "" }] }, "fr");
    expect(edited.hero_headline).toBe("My own headline");
    expect(edited.how_to_buy).toEqual([{ title: "Step", description: "" }]);
  });

  it("localizes product text and FAQs, merging keywords from both languages", () => {
    const p = { description: "Quiet PC", condition: "Good", testing_info: "", accessories: "", warranty_info: "", translations: { fr: { description: "PC silencieux", condition: "" } } };
    const lp = localizeProduct(p, "fr");
    expect(lp.description).toBe("PC silencieux");
    expect(lp.condition).toBe("Good");
    const f = localizeFaq({ question: "Can I test it?", answer: "Yes.", keywords: "test", translations: { fr: { question: "Puis-je le tester ?", answer: "Oui.", keywords: "tester, essayer" } } }, "fr");
    expect(f).toMatchObject({ question: "Puis-je le tester ?", answer: "Oui.", keywords: "test, tester, essayer" });
  });
});

describe("French chatbot", () => {
  const base = { cpu: "", gpu: "", ram: "", storage: "", motherboard: "", psu: "", case_name: "", cooling: "", os: "", condition: "", warranty_info: "", testing_info: "", accessories: "" };
  const product = (over: Partial<BotProduct> & Pick<BotProduct, "id" | "name" | "price">): BotProduct => ({ slug: over.name.toLowerCase().replace(/\s+/g, "-"), status: "available", ...base, ...over });
  const alpha = product({ id: "a", name: "Falcon RTX 3060", price: 1800, cpu: "Ryzen 5 5600", gpu: "RTX 3060", ram: "16GB DDR4", storage: "512GB NVMe", condition: "Très bon état", testing_info: "Testé 2 heures" });
  const beta = product({ id: "b", name: "Hawk GTX 1660", price: 1100, cpu: "Core i5 10400F", gpu: "GTX 1660 Super", ram: "16GB DDR4" });
  const gamma = product({ id: "c", name: "Titan RTX 4070", price: 3500.5, cpu: "Core i7 13700K", gpu: "RTX 4070", ram: "32GB DDR5", storage: "1TB NVMe" });
  const sold = product({ id: "d", name: "Ghost GTX 1060", price: 700, status: "sold", gpu: "GTX 1060" });
  const reserved = product({ id: "e", name: "Reserved RX 580", price: 900, status: "reserved", gpu: "RX 580" });
  const ctx = (over: Partial<BotContext> = {}): BotContext => ({
    locale: "fr",
    settings: { currency: "TND", phone: "", whatsapp_number: "", location: "", working_hours: "", delivery_info: "", payment_methods: "", warranty_policy: "", how_to_buy: [{ title: "Choisir", description: "Parcourir" }, { title: "Contacter", description: "" }], chatbot_welcome: "Bienvenue !" },
    faqs: [],
    products: [alpha, beta, gamma, sold, reserved],
    ...over,
  });

  it("answers a budget in French with real data, available PCs only, prices in French format", () => {
    const r = respond("Je cherche un PC à moins de 2000 dt", ctx());
    expect(r.products?.map((p) => p.id)).toEqual(["a", "b"]);
    expect(r.text).toContain("jusqu’à 2 000 TND");
    expect(r.text).toContain("1 800 TND");
    expect(r.text).not.toContain("Ghost"); // sold
    expect(r.text).not.toContain("Reserved RX");
    expect(r.text).not.toContain("Titan"); // over budget
    expect(r.text).not.toMatch(/Available|highest price/); // no English leaks
  });

  it("is honest when nothing fits or nothing exists", () => {
    expect(respond("moins de 1000 dinars", ctx()).text).toMatch(/Aucun PC disponible ne correspond.*Hawk GTX 1660 à 1 100 TND/);
    expect(respond("budget 2000", ctx({ products: [] })).text).toMatch(/Aucun PC n’est disponible/);
  });

  it("answers availability from the database in French", () => {
    expect(respond("Est-ce que le Falcon RTX 3060 est toujours disponible ?", ctx()).text).toBe("Falcon RTX 3060 est disponible.");
    expect(respond("Ghost GTX 1060 est-il disponible", ctx()).text).toBe("Ghost GTX 1060 est vendu.");
    expect(respond("Reserved RX 580 disponible ?", ctx()).text).toContain("réservé");
  });

  it("answers price and spec questions with stored values and French labels", () => {
    expect(respond("combien coûte le Hawk GTX 1660", ctx()).text).toBe("Hawk GTX 1660 coûte 1 100 TND et est disponible.");
    expect(respond("quelle carte graphique a le Falcon RTX 3060", ctx()).text).toBe("Carte graphique: RTX 3060");
    expect(respond("quel processeur pour le Titan RTX 4070", ctx()).text).toBe("Processeur: Core i7 13700K");
  });

  it("never invents a missing field: says it is not listed and offers the seller", () => {
    const r = respond("quelle alimentation pour le Hawk GTX 1660", ctx());
    expect(r.text).toMatch(/n’est pas indiqué/);
    expect(r.action).toBe("offer_seller");
    const w = respond("garantie du Hawk GTX 1660 ?", ctx());
    expect(w.text).toMatch(/Aucune information de garantie/);
    expect(w.text).not.toMatch(/\d+ (mois|ans)/);
  });

  it("uses the PC being viewed for 'ce PC' / 'celui-ci'", () => {
    expect(respond("est-il encore disponible, celui-ci ?", ctx({ currentProductId: "c" })).text).toBe("Titan RTX 4070 est disponible.");
  });

  it("compares two named PCs", () => {
    const r = respond("comparer Falcon RTX 3060 et Hawk GTX 1660", ctx());
    expect(r.products?.map((p) => p.id)).toEqual(["a", "b"]);
    expect(r.text).toContain("Carte graphique: RTX 3060  |  GTX 1660 Super");
    expect(r.text).toContain("non renseigné");
  });

  it("asks which PCs to compare instead of guessing", () => {
    const r = respond("comparer", ctx());
    expect(r.products).toBeUndefined();
    expect(r.text).toMatch(/quels deux PC comparer/);
  });

  it("policies are 'not published' when unset and verbatim when set", () => {
    expect(respond("vous livrez ?", ctx()).text).toMatch(/pas publié ses conditions de livraison/);
    expect(respond("comment payer", ctx()).text).toMatch(/pas publié ses moyens de paiement/);
    expect(respond("quelle est votre garantie", ctx()).text).toMatch(/Aucune politique de garantie/);
    expect(respond("quelle est votre adresse", ctx()).text).toMatch(/pas encore publié ses coordonnées/);
    const c = ctx({ settings: { ...ctx().settings, delivery_info: "Livraison à Tunis, 15 TND.", phone: "+216 20 000 000", location: "Sfax" } });
    expect(respond("vous livrez ?", c).text).toBe("Livraison à Tunis, 15 TND.");
    expect(respond("quel est votre numéro de téléphone", c).text).toContain("Téléphone: +216 20 000 000");
    expect(respond("où se trouve la boutique", c).text).toContain("Adresse: Sfax");
  });

  it("explains how to buy from the configured steps", () => {
    const r = respond("comment acheter ?", ctx());
    expect(r.text).toContain("1. Choisir");
    expect(r.text).toContain("2. Contacter");
  });

  it("the owner's FAQ keywords work in French and win over generic answers", () => {
    const c = ctx({ faqs: [{ question: "Puis-je tester le PC avant d’acheter ?", answer: "Oui, venez à la boutique.", keywords: "tester avant, essayer" }] });
    expect(respond("je peux essayer avant de payer ?", c).text).toBe("Oui, venez à la boutique.");
  });

  it("offers the seller with a stable action, whatever the language of the label", () => {
    const r = respond("je veux parler à un humain", ctx());
    expect(r.action).toBe("offer_seller");
    const f = respond("quel est le sens de la vie", ctx());
    expect(f.text).toMatch(/Je n’ai pas de réponse fiable/);
    expect(f.suggestions?.find((s) => s.action === "seller")?.label).toBe("Parler au vendeur");
    expect(f.suggestions?.find((s) => s.action === "send")?.text).toBe("Comment acheter ?");
  });

  it("greets with the (French) welcome message and French chips", () => {
    const r = respond("bonjour", ctx());
    expect(r.text).toBe("Bienvenue !");
    expect(r.suggestions?.map((s) => s.label)).toEqual(["PC à moins de 2000", "Comment acheter ?", "Parler au vendeur"]);
  });

  it("still understands English questions on a French page, and answers in French", () => {
    const r = respond("is the Falcon RTX 3060 available?", ctx());
    expect(r.text).toBe("Falcon RTX 3060 est disponible.");
  });

  it("French keyword search finds PCs by spec", () => {
    expect(respond("avez-vous quelque chose avec une rtx 4070", ctx()).products?.[0].id).toBe("c");
  });
});

describe("admin French fields", () => {
  const form = (o: Record<string, string>) => (k: string) => o[k] ?? "";

  it("keeps only the filled French fields and trims them", () => {
    const tr = buildTranslations(form({ fr_description: "  Bon état  ", fr_condition: "" }), { description: 100, condition: 100 });
    expect(tr).toEqual({ fr: { description: "Bon état" } });
  });

  it("returns an empty object when nothing is filled, so the main text is used", () => {
    expect(buildTranslations(form({}), { description: 100 })).toEqual({});
  });

  it("cuts text at the same limit as the main field and parses Title | description lines", () => {
    const tr = buildTranslations(form({ fr_tagline: "x".repeat(300), fr_highlights: "Testé | Chaque PC est vérifié\nGarantie" }), { tagline: 160 }, ["highlights"]);
    expect((tr as { fr: { tagline: string } }).fr.tagline).toHaveLength(160);
    expect((tr as { fr: { highlights: unknown } }).fr.highlights).toEqual([
      { title: "Testé", description: "Chaque PC est vérifié" },
      { title: "Garantie", description: "" },
    ]);
  });
});
