/** Prices are stored as numeric(12,3) (TND has millimes). PostgREST returns numerics as number or string. */
export function formatPrice(amount: number | string, currency = "TND", locale = "en"): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return "";
  const isWhole = Math.abs(n - Math.round(n)) < 0.0005;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: isWhole ? 0 : 3,
      maximumFractionDigits: 3,
    })
      .format(n)
      .replace(/\u00a0/g, " ");
  } catch {
    return `${n} ${currency}`;
  }
}

export function formatDate(iso: string, withTime = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(d);
}
