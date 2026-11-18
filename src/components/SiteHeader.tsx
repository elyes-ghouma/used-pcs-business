import Link from "next/link";
import { telUrl, whatsappUrl } from "@/lib/contact";
import type { Settings } from "@/lib/types";
import { Logo } from "./Logo";

const links = [
  { href: "/catalog", label: "Catalog" },
  { href: "/#how-to-buy", label: "How to buy" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader({ settings }: { settings: Settings }) {
  const wa = whatsappUrl(settings.whatsapp_number);
  const tel = telUrl(settings.phone);
  const cta = wa ? { href: wa, label: "WhatsApp", external: true } : tel ? { href: tel, label: "Call", external: false } : { href: "/contact", label: "Contact", external: false };

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Logo name={settings.business_name} logoPath={settings.logo_path} />
        <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-[0.95rem] font-medium text-muted hover:text-text">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a
            href={cta.href}
            className="btn-primary btn-sm hidden sm:inline-flex"
            {...(cta.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {cta.label}
          </a>
          <details className="group relative md:hidden">
            <summary className="btn-secondary btn-sm list-none [&::-webkit-details-marker]:hidden" aria-label="Menu">
              Menu
            </summary>
            <nav aria-label="Mobile" className="panel absolute right-0 top-12 grid w-56 gap-1 p-2 shadow-xl shadow-black/40">
              {links.map((l) => (
                <Link key={l.href} href={l.href} className="rounded-md px-3 py-2.5 hover:bg-raised">
                  {l.label}
                </Link>
              ))}
              <a href={cta.href} className="btn-primary mt-1" {...(cta.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                {cta.label}
              </a>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
