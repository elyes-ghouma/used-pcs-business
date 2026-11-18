import type { Locale } from "@/i18n/config";
import { createT } from "@/i18n/translate";

export type ContactSettings = {
  phone: string;
  whatsapp_number: string;
  messenger_url: string;
  facebook_url: string;
  instagram_url: string;
};

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function productInterestMessage(productName?: string | null, locale: Locale = "en"): string {
  const t = createT(locale);
  return productName ? t("message.interest", { name: productName }) : t("message.interestGeneric");
}

/** wa.me needs the number in international format, digits only (e.g. 21620123456). */
export function whatsappUrl(number: string, message?: string): string | null {
  const digits = digitsOnly(number);
  if (digits.length < 7) return null;
  return `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

export function telUrl(phone: string): string | null {
  const cleaned = phone.replace(/[^\d+]/g, "");
  return digitsOnly(cleaned).length >= 6 ? `tel:${cleaned}` : null;
}

/** Only http(s) links are ever rendered as links; anything else (javascript:, data:) is dropped. */
export function safeExternalUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
