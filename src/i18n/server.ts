import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { getSettings } from "@/lib/data";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, pickFromAcceptLanguage, type Locale } from "./config";
import { localizeSettings } from "./content";
import { createT } from "./translate";

/**
 * Which language to show: the visitor's saved choice, else their browser's language, else the shop's default
 * language (what link-preview crawlers, which send no preference, get), else English.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  const fromBrowser = pickFromAcceptLanguage((await headers()).get("accept-language"));
  if (fromBrowser) return fromBrowser;
  const configured = (await getSettings()).default_locale;
  return isLocale(configured) ? configured : DEFAULT_LOCALE;
});

export async function getT() {
  const locale = await getLocale();
  return { t: createT(locale), locale };
}

/** Business settings as the visitor should see them (French text where the owner provided it). */
export async function getPublicSettings() {
  return localizeSettings(await getSettings(), await getLocale());
}
