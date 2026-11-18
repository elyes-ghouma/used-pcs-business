import { SPEC_FIELDS } from "../types";
import { botText, type BotText } from "./text";
import type { BotContext, BotProduct, BotProductCard, BotReply } from "./types";

/**
 * Deterministic, database-backed chatbot. Rules that never change:
 *  - every price, spec, status and policy in a reply is copied from `ctx` (database data);
 *  - when a value is missing the reply says it is missing and points to the seller;
 *  - nothing is guessed, estimated or "recommended" beyond what the stored data supports.
 *
 * Questions are understood in English and French (patterns are written without accents because `normalize` strips
 * them); the reply language follows `ctx.locale`.
 */

const STOPWORDS = new Set(
  [
    // English
    "a an the i me my we you your is are am do does did can could would will to of for in on at with and or but not it its this that these those there here have has had be been what which who how when where why please pls hi hello hey want need looking look find show give tell about any some one ones pc pcs computer computers gaming game games gamer sell selling buy price cost much many very just also more most less than under below over above around approximately about budget max maximum min minimum between from up us mine",
    // French
    "le la les un une des de du d l au aux et ou je tu il elle nous vous ils est sont etes avez avoir ai as cherche cherchez voudrais voulez veux besoin pour avec sans sur dans par ce cet cette ces mon ma mes votre vos quel quelle quels quelles qui que quoi comment pourquoi bonjour salut svp stp moi pc gamer ordinateur ordinateurs jeu jeux vendre acheter prix cout combien moins plus entre environ autour maximum minimum",
  ]
    .join(" ")
    .split(" "),
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
  const hasBudgetWord = /(under|below|less than|max|maximum|up to|budget|around|about|within|moins de|moins que|pas plus de|jusqu|environ|autour de|a peu pres|entre|between|from|dt|tnd|dinar|dinars|\bk\b|\d\s?k\b|for)/.test(m);
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
  if (/(over|above|more than|at least|minimum|plus de|au moins|au dessus|a partir de)/.test(m)) return { min: nums[0], max: null };
  return { min: null, max: nums[0] };
}

/** Which question words ask about which spec (English and French, accent-free). */
const SPEC_ASK: Record<string, RegExp> = {
  cpu: /\b(cpu|processor|processeur)\b/,
  gpu: /\b(gpu|graphics|graphic|graphique|carte graphique|video card)\b/,
  motherboard: /\b(motherboard|carte mere)\b/,
  ram: /\b(ram|memory|memoire)\b/,
  storage: /\b(storage|ssd|hdd|disk|disque|stockage)\b/,
  psu: /\b(psu|power supply|alimentation)\b/,
  case_name: /\b(case|boitier)\b/,
  cooling: /\b(cooling|cooler|refroidissement|ventirad)\b/,
  os: /\b(os|windows|systeme)\b/,
};

function describe(p: BotProduct, ctx: BotContext, T: BotText): string {
  const price = T.price(p.price, ctx.settings.currency);
  const parts = SPEC_FIELDS.map(([k]) => (p[k as keyof BotProduct] ? `${T.specLabel(k)}: ${p[k as keyof BotProduct]}` : null)).filter(Boolean);
  return T.describe(p.name, price, T.statusOf(p), parts.length ? parts.join("; ") + "." : T.noSpecsListed);
}

export function respond(message: string, ctx: BotContext): BotReply {
  const T = botText(ctx.locale ?? "en");
  const msg = normalize(message);
  const { settings } = ctx;
  const current = ctx.currentProductId ? ctx.products.find((p) => p.id === ctx.currentProductId) : undefined;
  const mentions = mentionedProducts(message, ctx.products);
  const refersToCurrent = has(msg, /\b(this|it|that one|this one|this pc|celui|celui ci|ce pc|ce modele|cette machine|cet ordinateur)\b/);
  const subject: BotProduct | undefined = mentions[0] ?? (refersToCurrent || !mentions.length ? current : undefined);
  const noSeller = (text: string): BotReply => ({ text, action: "offer_seller", suggestions: [T.suggestions.seller] });

  // 1. The visitor wants a person.
  if (
    has(msg, /\b(human|real person|someone|talk to|speak to|speak with|seller|owner|agent|vendeur|responsable|conseiller|humain|une vraie personne|quelqu un|parler au|parler a|parler avec|discuter avec|rappelez)\b/) &&
    !has(msg, /\b(number|phone|whatsapp|hours|location|address|numero|telephone|horaires|adresse)\b/)
  ) {
    return { text: T.sellerRequested, action: "offer_seller" };
  }

  // 2. Contact details, hours, location (only what the owner configured).
  if (
    has(msg, /\b(phone|number|whatsapp|call|contact|hours|open|opening|location|address|where are you|where is|shop|store|adresse|horaires|telephone|numero|ouvert|ouverture|localisation|ou etes vous|ou se trouve|magasin|boutique|joindre|appeler|coordonnees)\b/) &&
    !has(msg, /\b(warranty|delivery|garantie|livraison)\b/)
  ) {
    const lines: string[] = [];
    if (settings.phone) lines.push(`${T.phone}: ${settings.phone}`);
    if (settings.whatsapp_number) lines.push(`${T.whatsapp}: ${settings.whatsapp_number}`);
    if (settings.location) lines.push(`${T.location}: ${settings.location}`);
    if (settings.working_hours) lines.push(`${T.hours}: ${settings.working_hours}`);
    if (lines.length === 0) return noSeller(T.noContactDetails);
    return { text: lines.join("\n"), action: "offer_seller" };
  }

  // 3. Compare two products.
  if (has(msg, /\b(compare|comparison|versus|vs|difference|better|lequel|comparer|comparaison|mieux)\b/)) {
    const pair = mentions.length >= 2 ? mentions.slice(0, 2) : mentions.length === 1 && current && current.id !== mentions[0].id ? [current, mentions[0]] : [];
    if (pair.length === 2) {
      const [a, b] = pair;
      const rows = SPEC_FIELDS.map(([k]) => {
        const av = (a[k as keyof BotProduct] as string) || T.notListed;
        const bv = (b[k as keyof BotProduct] as string) || T.notListed;
        return `${T.specLabel(k)}: ${av}  |  ${bv}`;
      });
      return {
        text: `${a.name} (${T.price(a.price, settings.currency)}, ${T.statusOf(a)})  vs  ${b.name} (${T.price(b.price, settings.currency)}, ${T.statusOf(b)})\n${rows.join("\n")}`,
        products: [card(a), card(b)],
      };
    }
    const names = ctx.products.filter((p) => p.status === "available").slice(0, 5).map((p) => p.name);
    return { text: T.compareWhich(names), suggestions: names.slice(0, 3).map(T.aboutSuggestion) };
  }

  // 4. Availability of a specific PC.
  if (has(msg, /\b(available|availability|in stock|still|disponible|disponibilite|en stock|encore|toujours|sold|reserved|vendu|reserve)\b/)) {
    if (subject) return { text: T.availabilityOf(subject.name, T.statusOf(subject)), products: [card(subject)] };
    const names = ctx.products.filter((p) => p.status === "available").slice(0, 5).map((p) => p.name);
    return { text: T.whichPc(names), action: names.length ? undefined : "offer_seller" };
  }

  // 5. Budget recommendation.
  const budget = extractBudget(message);
  if (budget && !subject) {
    const pool = ctx.products.filter((p) => p.status === "available");
    const fits = pool
      .filter((p) => (budget.max === null || Number(p.price) <= budget.max) && (budget.min === null || Number(p.price) >= budget.min))
      .sort((a, b) => Number(b.price) - Number(a.price))
      .slice(0, 3);
    const cur = settings.currency;
    const label =
      budget.min !== null && budget.max !== null
        ? T.budgetBetween(T.price(budget.min, cur), T.price(budget.max, cur))
        : budget.max !== null
          ? T.budgetUpTo(T.price(budget.max, cur))
          : T.budgetFrom(T.price(budget.min ?? 0, cur));
    if (fits.length > 0) return { text: T.budgetResults(label, fits.map((p) => `• ${describe(p, ctx, T)}`)), products: fits.map(card) };
    const cheapest = [...pool].sort((a, b) => Number(a.price) - Number(b.price))[0];
    return cheapest
      ? { text: T.budgetNone(label, cheapest.name, T.price(cheapest.price, cur)), products: [card(cheapest)] }
      : noSeller(T.budgetNothingAvailable);
  }

  // 6. Questions about a specific PC (price, specs, condition, warranty, tests, accessories).
  const askPrice = has(msg, /\b(price|prix|how much|cost|combien|tarif|coute|cout)\b/);
  const askSpecs = has(msg, /\b(spec|specs|specification|specifications|caracteristiques|details|detail|cpu|processor|processeur|gpu|graphics|graphic|graphique|card|ram|memory|memoire|storage|stockage|ssd|hdd|disk|disque|psu|power supply|alimentation|motherboard|carte mere|cooling|cooler|refroidissement|case|boitier|os|windows|systeme|tell me about|about|parle moi de|parlez moi de|infos|informations)\b/);
  const askCondition = has(msg, /\b(condition|state|etat|used|new|scratches|rayures)\b/);
  const askTested = has(msg, /\b(test|tested|testing|benchmark|temperature|temps|teste|tests|essai|essais)\b/);
  const askAccessories = has(msg, /\b(accessories|accessory|included|include|comes with|cable|cables|keyboard|mouse|monitor|accessoires|inclus|fournis|clavier|souris|ecran)\b/);
  const askWarranty = has(msg, /\b(warranty|guarantee|garantie)\b/);
  if (subject && (askPrice || askSpecs || askCondition || askTested || askAccessories || askWarranty || mentions.length > 0)) {
    const lines: string[] = [];
    let missing = false;
    if (askPrice) lines.push(T.costs(subject.name, T.price(subject.price, settings.currency), T.statusOf(subject)));
    if (askWarranty) {
      if (!subject.warranty_info) missing = true;
      lines.push(subject.warranty_info ? T.warrantyOf(subject.name, subject.warranty_info) : T.warrantyNone(subject.name, settings.warranty_policy));
    }
    if (askCondition) {
      if (!subject.condition) missing = true;
      lines.push(subject.condition ? T.conditionOf(subject.condition) : T.conditionNone(subject.name));
    }
    if (askTested) {
      if (!subject.testing_info) missing = true;
      lines.push(subject.testing_info ? T.testingOf(subject.testing_info) : T.testingNone(subject.name));
    }
    if (askAccessories) {
      if (!subject.accessories) missing = true;
      lines.push(subject.accessories ? T.accessoriesOf(subject.accessories) : T.accessoriesNone(subject.name));
    }
    if (askSpecs || lines.length === 0) {
      const asked = SPEC_FIELDS.map(([k]) => k).filter((k) => SPEC_ASK[k]?.test(msg));
      if (asked.length > 0 && askSpecs) {
        for (const k of asked) {
          const v = subject[k as keyof BotProduct] as string;
          if (!v) missing = true;
          lines.push(v ? `${T.specLabel(k)}: ${v}` : T.fieldNone(T.specLabel(k), subject.name));
        }
      } else {
        lines.push(describe(subject, ctx, T));
      }
    }
    return { text: lines.join("\n"), products: [card(subject)], action: missing ? "offer_seller" : undefined };
  }

  // 7. Owner-written FAQ (keywords + question words).
  const faq = bestFaq(msg, ctx);
  if (faq) return { text: faq.answer, action: undefined };

  // 8. Policies from settings.
  if (has(msg, /\b(deliver|delivery|shipping|ship|livraison|livrer|livrez|livrons|expedition|expedier|expediez|envoi|envoyez)\b/)) {
    return settings.delivery_info ? { text: settings.delivery_info } : noSeller(T.deliveryNone);
  }
  if (has(msg, /\b(pay|payment|paiement|payer|payez|reglement|regler|installment|cash|card payment|transfer|accept|acceptez|especes|virement|carte bancaire|facilite|acompte)\b/)) {
    return settings.payment_methods ? { text: T.paymentOf(settings.payment_methods) } : noSeller(T.paymentNone);
  }
  if (askWarranty) {
    return settings.warranty_policy ? { text: settings.warranty_policy } : noSeller(T.warrantyPolicyNone);
  }
  if (has(msg, /\b(how|comment)\b.*\b(buy|purchase|order|acheter|commander)\b|\b(buy|purchase|order|checkout|process|steps|achat|etapes|procedure|processus)\b/)) {
    const steps = settings.how_to_buy.map((s, i) => `${i + 1}. ${s.title}${s.description ? ` — ${s.description}` : ""}`);
    return { text: steps.length ? steps.join("\n") : T.buyNone, action: "offer_seller" };
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
        text: `${T.foundMatching(scored.length, words.join(" "))}\n${scored.map((x) => `• ${describe(x.p, ctx, T)}`).join("\n")}`,
        products: scored.map((x) => card(x.p)),
      };
    }
  }

  // 10. Greeting.
  if (has(msg, /^(hi|hello|hey|salut|bonjour|bonsoir|salam|aslema|ahla|good (morning|evening|afternoon))\b/) && tokens(message).length <= 4) {
    return { text: settings.chatbot_welcome, suggestions: [T.suggestions.budget, T.suggestions.how, T.suggestions.seller] };
  }

  // 11. Honest fallback.
  return { text: T.fallback, action: "offer_seller", suggestions: [T.suggestions.how, T.suggestions.seller] };
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
