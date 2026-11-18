"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocaleAction } from "@/app/actions/locale";
import { LOCALES, LOCALE_NAMES } from "@/i18n/config";
import { useLocale, useT } from "@/i18n/client";

/** Language buttons. Each button is labelled in its own language, so a visitor can always find theirs. */
export function LanguageSwitcher({ className = "", full = false }: { className?: string; full?: boolean }) {
  const locale = useLocale();
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div role="group" aria-label={t("lang.label")} className={`inline-flex overflow-hidden rounded border border-line ${className}`}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={l === locale}
          aria-label={LOCALE_NAMES[l]}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setLocaleAction(l);
              router.refresh();
            })
          }
          className={`min-h-9 px-3 text-sm font-semibold transition-colors ${
            l === locale ? "bg-accent text-accent-ink" : "bg-surface text-muted hover:text-text"
          }`}
        >
          {full ? LOCALE_NAMES[l] : l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
