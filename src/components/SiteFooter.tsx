import Link from "next/link";
import { getT } from "@/i18n/server";
import { safeExternalUrl } from "@/lib/contact";
import type { Settings } from "@/lib/types";
import { Logo } from "./Logo";

export async function SiteFooter({ settings }: { settings: Settings }) {
  const { t } = await getT();
  const socials = [
    { label: "Facebook", href: safeExternalUrl(settings.facebook_url) },
    { label: "Instagram", href: safeExternalUrl(settings.instagram_url) },
    { label: "Messenger", href: safeExternalUrl(settings.messenger_url) },
  ].filter((s): s is { label: string; href: string } => Boolean(s.href));

  return (
    <footer className="border-t border-line bg-bg-deep">
      <div className="container-page grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-4">
          <Logo name={settings.business_name} logoPath={settings.logo_path} />
          {settings.description && <p className="max-w-md text-sm text-muted">{settings.description}</p>}
        </div>
        <div>
          <h2 className="mb-3 text-xl">{t("footer.visit")}</h2>
          <ul className="space-y-2 text-sm text-muted">
            {settings.location && <li>{settings.location}</li>}
            {settings.working_hours && <li className="whitespace-pre-line">{settings.working_hours}</li>}
            {settings.phone && <li>{settings.phone}</li>}
            {!settings.location && !settings.working_hours && !settings.phone && <li>{t("footer.soon")}</li>}
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-xl">{t("footer.browse")}</h2>
          <ul className="space-y-2 text-sm">
            <li><Link href="/catalog" className="text-muted hover:text-text">{t("footer.allPcs")}</Link></li>
            <li><Link href="/#how-to-buy" className="text-muted hover:text-text">{t("nav.howToBuy")}</Link></li>
            <li><Link href="/contact" className="text-muted hover:text-text">{t("footer.contactSeller")}</Link></li>
            {socials.map((s) => (
              <li key={s.label}>
                <a href={s.href} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-text">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-line-soft py-5 text-center text-xs text-muted">
        &copy; {new Date().getFullYear()} {settings.business_name}
      </div>
    </footer>
  );
}
