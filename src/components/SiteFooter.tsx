import Link from "next/link";
import { safeExternalUrl } from "@/lib/contact";
import type { Settings } from "@/lib/types";
import { Logo } from "./Logo";

export function SiteFooter({ settings }: { settings: Settings }) {
  const socials = [
    { label: "Facebook", href: safeExternalUrl(settings.facebook_url) },
    { label: "Instagram", href: safeExternalUrl(settings.instagram_url) },
    { label: "Messenger", href: safeExternalUrl(settings.messenger_url) },
  ].filter((s): s is { label: string; href: string } => Boolean(s.href));

  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <div className="container-page grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-4">
          <Logo name={settings.business_name} logoPath={settings.logo_path} />
          {settings.description && <p className="max-w-md text-sm text-muted">{settings.description}</p>}
        </div>
        <div>
          <h2 className="mb-3 text-xl">Visit and contact</h2>
          <ul className="space-y-2 text-sm text-muted">
            {settings.location && <li>{settings.location}</li>}
            {settings.working_hours && <li className="whitespace-pre-line">{settings.working_hours}</li>}
            {settings.phone && <li>{settings.phone}</li>}
            {!settings.location && !settings.working_hours && !settings.phone && <li>Contact details are coming soon.</li>}
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-xl">Browse</h2>
          <ul className="space-y-2 text-sm">
            <li><Link href="/catalog" className="text-muted hover:text-text">All PCs</Link></li>
            <li><Link href="/#how-to-buy" className="text-muted hover:text-text">How to buy</Link></li>
            <li><Link href="/contact" className="text-muted hover:text-text">Contact the seller</Link></li>
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
