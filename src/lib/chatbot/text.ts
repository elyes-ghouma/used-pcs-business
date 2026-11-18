import { formatPrice } from "../format";
import type { Locale } from "@/i18n/config";
import { createT } from "@/i18n/translate";
import type { BotProduct, BotSuggestion } from "./types";

/** Everything the chatbot says, in each language. Facts (names, prices, specs, policies) are always inserted from data. */
export type BotText = {
  statusOf: (p: BotProduct) => string;
  price: (amount: number | string, currency: string) => string;
  notListed: string;
  noSpecsListed: string;
  sellerRequested: string;
  noContactDetails: string;
  phone: string;
  whatsapp: string;
  location: string;
  hours: string;
  compareWhich: (names: string[]) => string;
  compareNone: string;
  aboutSuggestion: (name: string) => BotSuggestion;
  availabilityOf: (name: string, status: string) => string;
  whichPc: (names: string[]) => string;
  noneAvailable: string;
  budgetBetween: (a: string, b: string) => string;
  budgetUpTo: (a: string) => string;
  budgetFrom: (a: string) => string;
  budgetResults: (label: string, lines: string[]) => string;
  budgetNone: (label: string, cheapest: string, price: string) => string;
  budgetNothingAvailable: string;
  costs: (name: string, price: string, status: string) => string;
  warrantyOf: (name: string, text: string) => string;
  warrantyNone: (name: string, policy: string) => string;
  conditionOf: (text: string) => string;
  conditionNone: (name: string) => string;
  testingOf: (text: string) => string;
  testingNone: (name: string) => string;
  accessoriesOf: (text: string) => string;
  accessoriesNone: (name: string) => string;
  fieldNone: (label: string, name: string) => string;
  deliveryNone: string;
  paymentOf: (text: string) => string;
  paymentNone: string;
  warrantyPolicyNone: string;
  buyNone: string;
  foundMatching: (n: number, words: string) => string;
  fallback: string;
  specLabel: (key: string) => string;
  noSpecsForPc: string;
  suggestions: { budget: BotSuggestion; how: BotSuggestion; seller: BotSuggestion };
  describe: (name: string, price: string, status: string, specs: string) => string;
};

function build(locale: Locale): BotText {
  const t = createT(locale);
  const fr = locale === "fr";
  return {
    statusOf: (p) =>
      p.status === "available"
        ? fr ? "disponible" : "available"
        : p.status === "reserved"
          ? fr ? "actuellement réservé par un autre client" : "currently reserved for another customer"
          : fr ? "vendu" : "sold",
    price: (amount, currency) => formatPrice(amount, currency, locale),
    notListed: fr ? "non renseigné" : "not listed",
    noSpecsListed: fr ? "Aucune caractéristique n’est renseignée pour ce PC." : "No specifications are listed for this PC yet.",
    sellerRequested: fr
      ? "Bien sûr. Choisissez ci-dessous comment joindre le vendeur. Je ne peux pas dire s’il est en ligne en ce moment, les réponses ne sont donc pas instantanées."
      : "Of course. Choose how you want to reach the seller below. I can't say whether they are online right now, so replies are not instant.",
    noContactDetails: fr
      ? "Le vendeur n’a pas encore publié ses coordonnées ici. Vous pouvez quand même envoyer un message via le site, il le verra."
      : "The seller hasn't published contact details here yet. You can still send a message through the website and they will see it.",
    phone: fr ? "Téléphone" : "Phone",
    whatsapp: "WhatsApp",
    location: fr ? "Adresse" : "Location",
    hours: fr ? "Horaires" : "Working hours",
    compareWhich: (names) =>
      names.length
        ? fr ? `Dites-moi quels deux PC comparer, par leur nom. Actuellement en vente : ${names.join(", ")}.` : `Tell me which two PCs to compare, by name. Currently listed: ${names.join(", ")}.`
        : fr ? "Aucun PC n’est disponible à comparer pour le moment." : "There are no PCs available to compare right now.",
    compareNone: "",
    aboutSuggestion: (name) => ({ label: fr ? `Parlez-moi de ${name}` : `Tell me about ${name}`, action: "send", text: fr ? `Parlez-moi de ${name}` : `Tell me about ${name}` }),
    availabilityOf: (name, status) => (fr ? `${name} est ${status}.` : `${name} is ${status}.`),
    whichPc: (names) =>
      names.length
        ? fr ? `De quel PC parlez-vous ? Disponibles actuellement : ${names.join(", ")}.` : `Which PC do you mean? Available now: ${names.join(", ")}.`
        : fr ? "Aucun PC n’est indiqué comme disponible pour le moment." : "No PCs are listed as available right now.",
    noneAvailable: fr ? "Aucun PC n’est disponible pour le moment. Contactez le vendeur pour savoir ce qui arrive bientôt." : "There are no PCs available right now. Contact the seller to ask what is coming soon.",
    budgetBetween: (a, b) => (fr ? `entre ${a} et ${b}` : `between ${a} and ${b}`),
    budgetUpTo: (a) => (fr ? `jusqu’à ${a}` : `up to ${a}`),
    budgetFrom: (a) => (fr ? `à partir de ${a}` : `from ${a}`),
    budgetResults: (label, lines) =>
      fr ? `PC disponibles ${label}, du plus cher au moins cher :\n${lines.join("\n")}` : `Available PCs ${label}, highest price first:\n${lines.join("\n")}`,
    budgetNone: (label, cheapest, price) =>
      fr
        ? `Aucun PC disponible ne correspond à un budget ${label}. Le PC disponible le moins cher est ${cheapest} à ${price}.`
        : `No available PC matches a budget ${label}. The lowest-priced available PC is ${cheapest} at ${price}.`,
    budgetNothingAvailable: fr ? "Aucun PC n’est disponible pour le moment. Contactez le vendeur pour savoir ce qui arrive bientôt." : "There are no PCs available right now. Contact the seller to ask what is coming soon.",
    costs: (name, price, status) => (fr ? `${name} coûte ${price} et est ${status}.` : `${name} costs ${price} and is ${status}.`),
    warrantyOf: (name, text) => (fr ? `Garantie pour ${name} : ${text}` : `Warranty for ${name}: ${text}`),
    warrantyNone: (name, policy) =>
      fr
        ? `Aucune information de garantie n’est indiquée pour ${name}.${policy ? ` Politique générale de garantie : ${policy}` : " Demandez au vendeur."}`
        : `No warranty information is listed for ${name}.${policy ? ` General warranty policy: ${policy}` : " Please ask the seller."}`,
    conditionOf: (text) => (fr ? `État : ${text}` : `Condition: ${text}`),
    conditionNone: (name) => (fr ? `L’état de ${name} n’est pas indiqué. Demandez au vendeur.` : `The condition of ${name} isn't listed. Please ask the seller.`),
    testingOf: (text) => (fr ? `Tests : ${text}` : `Testing: ${text}`),
    testingNone: (name) => (fr ? `Aucune information sur les tests n’est indiquée pour ${name}. Demandez au vendeur.` : `No testing information is listed for ${name}. Please ask the seller.`),
    accessoriesOf: (text) => (fr ? `Inclus : ${text}` : `Included: ${text}`),
    accessoriesNone: (name) => (fr ? `Aucun accessoire inclus n’est indiqué pour ${name}. Demandez au vendeur.` : `No included accessories are listed for ${name}. Please ask the seller.`),
    fieldNone: (label, name) => (fr ? `${label} de ${name} n’est pas indiqué. Demandez au vendeur.` : `The ${label} of ${name} isn't listed. Please ask the seller.`),
    deliveryNone: fr ? "Le vendeur n’a pas publié ses conditions de livraison. Demandez-lui directement." : "The seller hasn't published delivery details. Please ask them directly.",
    paymentOf: (text) =>
      fr
        ? `Moyens de paiement acceptés : ${text}\nLe paiement se règle directement avec le vendeur ; il n’y a pas de paiement en ligne.`
        : `Accepted payment methods: ${text}\nPayment is arranged directly with the seller; there is no online checkout.`,
    paymentNone: fr
      ? "Le vendeur n’a pas publié ses moyens de paiement. Le paiement se règle directement avec lui, demandez-lui."
      : "The seller hasn't published payment details. Payment is arranged directly with the seller, so please ask them.",
    warrantyPolicyNone: fr ? "Aucune politique de garantie n’a encore été publiée. Demandez au vendeur pour le PC qui vous intéresse." : "No warranty policy has been published yet. Please ask the seller about the PC you like.",
    buyNone: fr ? "Contactez le vendeur pour acheter un PC." : "Contact the seller to buy a PC.",
    foundMatching: (n, words) => (fr ? `J’ai trouvé ${n} PC correspondant à « ${words} » :` : `I found ${n} PC${n > 1 ? "s" : ""} matching "${words}":`),
    fallback: fr
      ? "Je n’ai pas de réponse fiable à cette question. Je peux chercher dans le catalogue par budget ou caractéristiques, expliquer comment acheter, ou vous pouvez contacter directement le vendeur."
      : "I don't have a reliable answer for that. I can search the catalog by budget or specs, explain how buying works, or you can contact the seller directly.",
    specLabel: (key) => t(`spec.${key}` as Parameters<typeof t>[0]),
    noSpecsForPc: fr ? "Aucune caractéristique n’est renseignée pour ce PC." : "No specifications are listed for this PC yet.",
    suggestions: {
      budget: { label: t("chat.sug.budget"), action: "send", text: fr ? "PC à moins de 2000 dt" : "Show PCs under 2000" },
      how: { label: t("chat.sug.how"), action: "send", text: fr ? "Comment acheter ?" : "How do I buy?" },
      seller: { label: t("chat.sug.seller"), action: "seller" },
    },
    describe: (name, price, status, specs) => `${name} — ${price} (${status}). ${specs}`,
  };
}

const CACHE: Partial<Record<Locale, BotText>> = {};
export function botText(locale: Locale = "en"): BotText {
  return (CACHE[locale] ??= build(locale));
}
