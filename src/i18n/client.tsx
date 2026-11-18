"use client";

import { createContext, useContext, useMemo } from "react";
import type { Locale } from "./config";
import { createT, translateIfKey, type TFunction } from "./translate";

type Ctx = { locale: Locale; t: TFunction; tKey: (maybeKey: string | undefined) => string };
const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = useMemo<Ctx>(() => ({ locale, t: createT(locale), tKey: (k) => translateIfKey(locale, k) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useCtx() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used inside <I18nProvider>");
  return ctx;
}

export const useT = () => useCtx().t;
export const useLocale = () => useCtx().locale;
/** Translates a string that may be a message key (for example an error code returned by the server). */
export const useTKey = () => useCtx().tKey;
