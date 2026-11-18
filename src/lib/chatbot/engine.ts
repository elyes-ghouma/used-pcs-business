import { formatPrice } from "../format";
import { SPEC_FIELDS } from "../types";
import type { BotContext, BotProduct, BotProductCard, BotReply } from "./types";

/**
 * Deterministic, database-backed chatbot. Rules that never change:
 *  - every price, spec, status and policy in a reply is copied from `ctx` (database data);
 *  - when a value is missing the reply says it is missing and points to the seller;
 *  - nothing is guessed, estimated or "recommended" beyond what the stored data supports.
 */

const STOPWORDS = new Set(
  "a an the i me my we you your is are am do does did can could would will to of for in on at with and or but not it its this that these those there here have has had be been what which who how when where why please pls hi hello hey want need looking look find show give tell about any some one ones pc pcs computer computers gaming game games gamer sell selling buy price cost much many very just also more most less than under below over above around approximately about budget max maximum min minimum between from up us mine".split(
    " ",
  ),
);

const normalize = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ.,\s+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokens = (s: string) => normalize(s).replace(/[.,]/g, " ").split(" ").filter(Boolean);

const has = (msg: string, re: RegExp) => re.test(msg);

function card(p: BotProduct): BotProductCard {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: Number(p.price),
    status: p.status,
    summary: [p.cpu, p.gpu, p.ram, p.storage].filter(Boolean),
  };
}

const statusText = (p: BotProduct) =>
  p.status === "available" ? "available" : p.status === "reserved" ? "currently reserved for another customer" : "sold";

function mentionedProducts(msg: string, products: BotProduct[]): BotProduct[] {
  const msgTokens = new Set(tokens(msg));
  const scored: { p: BotProduct; score: number }[] = [];
  for (const p of products) {
    const nameTokens = tokens(p.name).filter((t) => !STOPWORDS.has(t));
    if (nameTokens.length === 0) continue;
    const matched = nameTokens.filter((t) => msgTokens.has(t)).length;
    const fraction = matched / nameTokens.length;
    if (normalize(msg).includes(normalize(p.name)) || (matched >= 1 && fraction >= 0.6)) {
      scored.push({ p, score: fraction + matched / 10 });
    }
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.p);
}

type Budget = { min: number | null; max: number | null };

export function extractBudget(msg: string): Budget | null {
  const m = normalize(msg);
  const hasBudgetWord = /(under|below|less than|max|maximum|up to|budget|around|about|within|moins de|maximum|jusqu|entre|between|from|dt|tnd|dinar|dinars|\bk\b|\d\s?k\b|for)/.test(m);
  const nums: number[] = [];
  const re = /(\d{1,3}(?:[ .,]\d{3})+|\d+(?:[.,]\d+)?)\s?(k)?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(m))) {
    let raw = match[1];
    // "1 500", "1.500", "1,500" -> thousands separators; "1.5k" -> decimal
    if (/^\d{1,3}([ .,]\d{3})+$/.test(raw)) raw = raw.replace(/[ .,]/g, "");
    else raw = raw.replace(",", ".");
    let n = Number(raw);
    if (match[2]) n *= 1000;
    if (Number.isFinite(n) && n >= 100) nums.push(n);
  }
  if (nums.length === 0 || !hasBudgetWord) return null;
  if (nums.length >= 2 && /(between|entre|from)/.test(m)) {
    return { min: Math.min(nums[0], nums[1]), max: Math.max(nums[0], nums[1]) };
  }
  if (/(over|above|more than|at least|minimum|plus de)/.test(m)) return { min: nums[0], max: null };
  return { min: null, max: nums[0] };
}

function describe(p: BotProduct, ctx: BotContext): string {
  const price = formatPrice(p.price, ctx.settings.currency);
  const parts = SPEC_FIELDS.map(([k, label]) => (p[k as keyof BotProduct] ? `${label}: ${p[k as keyof BotProduct]}` : null)).filter(Boolean);
  return `${p.name} — ${price} (${statusText(p)}). ${parts.length ? parts.join("; ") + "." : "No specifications are listed for this PC yet."}`;
}

const SELLER_SUGGESTIONS = ["Talk to the seller"];

export function respond(message: string, ctx: BotContext): BotReply {
  const msg = normalize(message);
  const { settings } = ctx;
  const current = ctx.currentProductId ? ctx.products.find((p) => p.id === ctx.currentProductId) : undefined;
  const mentions = mentionedProducts(message, ctx.products);
  const refersToCurrent = has(msg, /\b(this|it|that one|this one|this pc|celui|celui ci|ce pc)\b/);
  const subject: BotProduct | undefined = mentions[0] ?? (refersToCurrent || !mentions.length ? current : undefined);
  const noSeller = (text: string): BotReply => ({ text, action: "offer_seller", suggestions: SELLER_SUGGESTIONS });

  // 1. The visitor wants a person.
  if (has(msg, /\b(human|real person|someone|talk to|speak to|speak with|seller|owner|agent|vendeur|responsable|call me|contact you)\b/) && !has(msg, /\b(number|phone|whatsapp|hours|location|address)\b/)) {
    return {
      text: "Of course. Choose how you want to reach the seller below. I can't say whether they are online right now, so replies are not instant.",
      action: "offer_seller",
    };
  }

  // 2. Contact details, hours, location (only what the owner configured).
  if (has(msg, /\b(phone|number|whatsapp|call|contact|hours|open|opening|location|address|where are you|where is|shop|store|adresse|horaires|telephone)\b/) && !has(msg, /\b(warranty|delivery)\b/)) {
    const lines: string[] = [];
    if (settings.phone) lines.push(`Phone: ${settings.phone}`);
    if (settings.whatsapp_number) lines.push(`WhatsApp: ${settings.whatsapp_number}`);
    if (settings.location) lines.push(`Location: ${settings.location}`);
    if (settings.working_hours) lines.push(`Working hours: ${settings.working_hours}`);
    if (lines.length === 0) {
      return noSeller("The seller hasn't published contact details here yet. You can still send a message through the website and they will see it.");
    }
    return { text: lines.join("\n"), action: "offer_seller" };
  }

  // 3. Compare two products.
  if (has(msg, /\b(compare|comparison|versus|vs|difference|better|lequel)\b/)) {
    const pair = mentions.length >= 2 ? mentions.slice(0, 2) : mentions.length === 1 && current && current.id !== mentions[0].id ? [current, mentions[0]] : [];
    if (pair.length === 2) {
      const [a, b] = pair;
      const rows = SPEC_FIELDS.map(([k, label]) => {
        const av = (a[k as keyof BotProduct] as string) || "not listed";
        const bv = (b[k as keyof BotProduct] as string) || "not listed";
        return `${label}: ${av}  |  ${bv}`;
      });
      return {
        text: `${a.name} (${formatPrice(a.price, settings.currency)}, ${statusText(a)})  vs  ${b.name} (${formatPrice(b.price, settings.currency)}, ${statusText(b)})\n${rows.join("\n")}`,
        products: [card(a), card(b)],
      };
    }
    const names = ctx.products.filter((p) => p.status === "available").slice(0, 5).map((p) => p.name);
    return {
      text: names.length
        ? `Tell me which two PCs to compare, by name. Currently listed: ${names.join(", ")}.`
        : "There are no PCs available to compare right now.",
      suggestions: names.slice(0, 3).map((n) => `Tell me about ${n}`),
    };
  }

  // 4. Availability of a specific PC.
  if (has(msg, /\b(available|availability|in stock|still|disponible|sold|reserved|vendu|reserve)\b/)) {
    if (subject) {
      return { text: `${subject.name} is ${statusText(subject)}.`, products: [card(subject)] };
    }
    const names = ctx.products.filter((p) => p.status === "available").slice(0, 5).map((p) => p.name);
    return {
      text: names.length ? `Which PC do you mean? Available now: ${names.join(", ")}.` : "No PCs are listed as available right now.",
      action: names.length ? undefined : "offer_seller",
    };
  }

  // 5. Budget recommendation.
  const budget = extractBudget(message);
  if (budget && !subject) {
    const pool = ctx.products.filter((p) => p.status === "available");
    const fits = pool
      .filter((p) => (budget.max === null || Number(p.price) <= budget.max) && (budget.min === null || Number(p.price) >= budget.min))
      .sort((a, b) => Number(b.price) - Number(a.price))
      .slice(0, 3);
    const label =
      budget.min !== null && budget.max !== null
        ? `between ${formatPrice(budget.min, settings.currency)} and ${formatPrice(budget.max, settings.currency)}`
        : budget.max !== null
          ? `up to ${formatPrice(budget.max, settings.currency)}`
          : `from ${formatPrice(budget.min ?? 0, settings.currency)}`;
    if (fits.length > 0) {
      return {
        text: `Available PCs ${label}, highest price first:\n${fits.map((p) => `• ${describe(p, ctx)}`).join("\n")}`,
        products: fits.map(card),
      };
    }
    const cheapest = [...pool].sort((a, b) => Number(a.price) - Number(b.price))[0];
    return cheapest
      ? { text: `No available PC matches a budget ${label}. The lowest-priced available PC is ${cheapest.name} at ${formatPrice(cheapest.price, settings.currency)}.`, products: [card(cheapest)] }
      : noSeller("There are no PCs available right now. Contact the seller to ask what is coming soon.");
  }

  // 6. Questions about a specific PC (price, specs, condition, warranty, tests, accessories).
  const askPrice = has(msg, /\b(price|prix|how much|cost|combien|tarif)\b/);
  const askSpecs = has(msg, /\b(spec|specs|specification|specifications|details|detail|cpu|processor|gpu|graphics|graphic|card|ram|memory|storage|ssd|hdd|disk|psu|power supply|motherboard|cooling|cooler|case|os|windows|tell me about|about)\b/);
  const askCondition = has(msg, /\b(condition|state|etat|used|new|scratches)\b/);
  const askTested = has(msg, /\b(test|tested|testing|benchmark|temperature|temps)\b/);
  const askAccessories = has(msg, /\b(accessories|accessory|included|include|comes with|cable|cables|keyboard|mouse|monitor)\b/);
  const askWarranty = has(msg, /\b(warranty|guarantee|garantie)\b/);
  if (subject && (askPrice || askSpecs || askCondition || askTested || askAccessories || askWarranty || mentions.length > 0)) {
    const lines: string[] = [];
    if (askPrice) lines.push(`${subject.name} costs ${formatPrice(subject.price, settings.currency)} and is ${statusText(subject)}.`);
    if (askWarranty) {
      lines.push(subject.warranty_info ? `Warranty for ${subject.name}: ${subject.warranty_info}` : `No warranty information is listed for ${subject.name}.${settings.warranty_policy ? ` General warranty policy: ${settings.warranty_policy}` : " Please ask the seller."}`);
    }
    if (askCondition) lines.push(subject.condition ? `Condition: ${subject.condition}` : `The condition of ${subject.name} isn't listed. Please ask the seller.`);
    if (askTested) lines.push(subject.testing_info ? `Testing: ${subject.testing_info}` : `No testing information is listed for ${subject.name}. Please ask the seller.`);
    if (askAccessories) lines.push(subject.accessories ? `Included: ${subject.accessories}` : `No included accessories are listed for ${subject.name}. Please ask the seller.`);
    if (askSpecs || lines.length === 0) {
      const asked = SPEC_FIELDS.filter(([k, label]) => has(msg, new RegExp(`\\b${label.toLowerCase().split(" ")[0]}\\b`)) || (k === "cpu" && has(msg, /\bprocessor\b/)) || (k === "gpu" && has(msg, /\b(graphics|card)\b/)) || (k === "storage" && has(msg, /\b(ssd|hdd|disk)\b/)) || (k === "ram" && has(msg, /\bmemory\b/)));
      if (asked.length > 0 && askSpecs) {
        for (const [k, label] of asked) {
          const v = subject[k as keyof BotProduct] as string;
          lines.push(v ? `${label}: ${v}` : `The ${label} of ${subject.name} isn't listed. Please ask the seller.`);
        }
      } else {
        lines.push(describe(subject, ctx));
      }
    }
    return { text: lines.join("\n"), products: [card(subject)], action: lines.some((l) => /isn't listed|No .* listed/.test(l)) ? "offer_seller" : undefined };
  }

  // 7. Owner-written FAQ (keywords + question words).
  const faq = bestFaq(msg, ctx);
  if (faq) return { text: faq.answer, action: undefined };

  // 8. Policies from settings.
  if (has(msg, /\b(deliver|delivery|shipping|ship|livraison)\b/)) {
    return settings.delivery_info ? { text: settings.delivery_info } : noSeller("The seller hasn't published delivery details. Please ask them directly.");
  }
  if (has(msg, /\b(pay|payment|paiement|installment|cash|card payment|transfer|accept)\b/)) {
    return settings.payment_methods ? { text: `Accepted payment methods: ${settings.payment_methods}\nPayment is arranged directly with the seller; there is no online checkout.` } : noSeller("The seller hasn't published payment details. Payment is arranged directly with the seller, so please ask them.");
  }
  if (askWarranty) {
    return settings.warranty_policy ? { text: settings.warranty_policy } : noSeller("No warranty policy has been published yet. Please ask the seller about the PC you like.");
  }
  if (has(msg, /\b(how|comment)\b.*\b(buy|purchase|order|acheter|commander)\b|\b(buy|purchase|order|checkout|process|steps)\b/)) {
    const steps = settings.how_to_buy.map((s, i) => `${i + 1}. ${s.title}${s.description ? ` — ${s.description}` : ""}`);
    return { text: steps.length ? steps.join("\n") : "Contact the seller to buy a PC.", action: "offer_seller" };
  }

  // 9. Keyword search over the catalog (e.g. "rtx 3060", "ryzen 5", "16gb").
  const words = tokens(message).filter((t) => !STOPWORDS.has(t) && t.length >= 2);
  if (words.length > 0) {
    const scored = ctx.products
      .map((p) => {
        const hay = normalize([p.name, p.cpu, p.gpu, p.ram, p.storage].join(" "));
        return { p, score: words.filter((w) => hay.includes(w)).length };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || Number(a.p.price) - Number(b.p.price))
      .slice(0, 4);
    if (scored.length > 0) {
      return {
        text: `I found ${scored.length} PC${scored.length > 1 ? "s" : ""} matching "${words.join(" ")}":\n${scored.map((x) => `• ${describe(x.p, ctx)}`).join("\n")}`,
        products: scored.map((x) => card(x.p)),
      };
    }
  }

  // 10. Greeting.
  if (has(msg, /^(hi|hello|hey|salut|bonjour|salam|aslema|ahla|good (morning|evening|afternoon))\b/) && tokens(message).length <= 4) {
    return { text: settings.chatbot_welcome, suggestions: ["Show PCs under 2000", "How do I buy?", "Talk to the seller"] };
  }

  // 11. Honest fallback.
  return {
    text: "I don't have a reliable answer for that. I can search the catalog by budget or specs, explain how buying works, or you can contact the seller directly.",
    action: "offer_seller",
    suggestions: ["How do I buy?", "Talk to the seller"],
  };
}

function bestFaq(msg: string, ctx: BotContext) {
  const msgTokens = new Set(tokens(msg).filter((t) => !STOPWORDS.has(t) && t.length > 2));
  let best: { score: number; answer: string } | null = null;
  for (const f of ctx.faqs) {
    const kw = f.keywords.split(",").map((k) => normalize(k)).filter(Boolean);
    let score = kw.filter((k) => msg.includes(k)).length * 3;
    const qTokens = tokens(f.question).filter((t) => !STOPWORDS.has(t) && t.length > 2);
    score += qTokens.filter((t) => msgTokens.has(t)).length;
    const needed = Math.max(2, Math.ceil(qTokens.length * 0.6));
    if ((kw.some((k) => msg.includes(k)) || score >= needed) && (!best || score > best.score)) best = { score, answer: f.answer };
  }
  return best;
}
