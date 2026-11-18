import Link from "next/link";
import { getT } from "@/i18n/server";
import { telUrl, whatsappUrl } from "@/lib/contact";
import type { Settings } from "@/lib/types";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Logo } from "./Logo";

export async function SiteHeader({ settings }: { settings: Settings }) {
  const { t } = await getT();
  const links = [
    { href: "/catalog", label: t("nav.catalog") },
    { href: "/#how-to-buy", label: t("nav.howToBuy") },
    { href: "/contact", label: t("nav.contact") },
  ];
  const wa = whatsappUrl(settings.whatsapp_number);
  const tel = telUrl(settings.phone);
  const cta = wa
    ? { href: wa, label: t("header.whatsapp"), external: true }
    : tel
      ? { href: tel, label: t("header.call"), external: false }
      : { href: "/contact", label: t("nav.contact"), external: false };

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Logo name={settings.business_name} logoPath={settings.logo_path} />
        <nav aria-label={t("nav.main")} className="hidden items-center gap-7 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-[0.95rem] font-medium text-muted hover:text-text">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <LanguageSwitcher className="hidden sm:inline-flex" />
          <a
            href={cta.href}
            className="btn-primary btn-sm hidden sm:inline-flex"
            {...(cta.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {cta.label}
          </a>
          <details className="group relative md:hidden">
            <summary className="btn-secondary btn-sm list-none [&::-webkit-details-marker]:hidden" aria-label={t("common.menu")}>
              {t("common.menu")}
            </summary>
            <nav aria-label={t("nav.mobile")} className="panel absolute right-0 top-12 grid w-60 gap-1 p-2 shadow-xl shadow-black/40">
              {links.map((l) => (
                <Link key={l.href} href={l.href} className="rounded-md px-3 py-2.5 hover:bg-raised">
                  {l.label}
                </Link>
              ))}
              <a href={cta.href} className="btn-primary mt-1" {...(cta.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                {cta.label}
              </a>
              <LanguageSwitcher full className="mt-1 w-full [&>button]:flex-1" />
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
