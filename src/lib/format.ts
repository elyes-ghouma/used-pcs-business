import { DATE_LOCALE, NUMBER_LOCALE, type Locale } from "@/i18n/config";

/**
 * Prices are stored as numeric(12,3) (TND has millimes). PostgREST returns numerics as number or string.
 * French formatting puts the currency code after the amount and uses (narrow) no-break spaces, which are
 * normalised to a plain space so the text is easy to compare, copy and search.
 */
export function formatPrice(amount: number | string, currency = "TND", locale: Locale | string = "en"): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return "";
  const isWhole = Math.abs(n - Math.round(n)) < 0.0005;
  const intl = (NUMBER_LOCALE as Record<string, string>)[locale] ?? locale;
  try {
    return new Intl.NumberFormat(intl, {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: isWhole ? 0 : 3,
      maximumFractionDigits: 3,
    })
      .format(n)
      .replace(/[\u00a0\u202f]/g, " ");
  } catch {
    return `${n} ${currency}`;
  }
}

export function formatDate(iso: string, withTime = false, locale: Locale | string = "en"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const intl = (DATE_LOCALE as Record<string, string>)[locale] ?? "en-GB";
  return new Intl.DateTimeFormat(intl, {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(d);
}
