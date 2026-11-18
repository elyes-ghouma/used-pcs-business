import { en, type MessageKey } from "./messages/en";
import { fr } from "./messages/fr";
import type { Locale } from "./config";

const DICTIONARIES: Record<Locale, Record<string, string>> = { en, fr };

export type TFunction = (key: MessageKey, params?: Record<string, string | number>) => string;

function fill(text: string, params?: Record<string, string | number>): string {
  return params ? text.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`)) : text;
}

/** Typed translator: only known keys are accepted, so a typo is a compile error. */
export function createT(locale: Locale): TFunction {
  const dict = DICTIONARIES[locale];
  return (key, params) => fill(dict[key] ?? en[key], params);
}

/** For keys that arrive as data (for example an error code from the server): unknown keys come back unchanged. */
export function translateIfKey(locale: Locale, maybeKey: string | undefined): string {
  if (!maybeKey) return "";
  const dict = DICTIONARIES[locale];
  return dict[maybeKey] ?? (en as Record<string, string>)[maybeKey] ?? maybeKey;
}
