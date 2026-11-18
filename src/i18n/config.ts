export const LOCALES = ["en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "lang";

export const LOCALE_NAMES: Record<Locale, string> = { en: "English", fr: "Français" };

/** Intl locales used for numbers and dates. fr-TN writes prices the Tunisian way (1 850,500 TND). */
export const NUMBER_LOCALE: Record<Locale, string> = { en: "en", fr: "fr-TN" };
export const DATE_LOCALE: Record<Locale, string> = { en: "en-GB", fr: "fr-FR" };
/** Open Graph locales for link previews. */
export const OG_LOCALE: Record<Locale, string> = { en: "en_GB", fr: "fr_FR" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Picks the best supported language from an Accept-Language header, or null when it names none of ours. */
export function pickFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = Number(params.find((p) => p.trim().startsWith("q="))?.trim().slice(2) ?? "1");
      return { lang: tag.trim().toLowerCase().split("-")[0], q: Number.isFinite(q) ? q : 0 };
    })
    .filter((x) => x.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { lang } of ranked) if (isLocale(lang)) return lang;
  return null;
}
