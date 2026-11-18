import type { Metadata } from "next";
import Link from "next/link";
import { ContactActions } from "@/components/ContactActions";
import { ProductCard } from "@/components/ProductCard";
import { StockReadout } from "@/components/StockReadout";
import { localizeFaq, localizeTestimonial } from "@/i18n/content";
import { getPublicSettings, getT } from "@/i18n/server";
import { OG_LOCALE } from "@/i18n/config";
import { getFaqs, getFeatured, getRecent, getStockCounts, getTestimonials } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/public";
import type { Faq, Product, Testimonial } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getPublicSettings();
  const { t, locale } = await getT();
  const description = s.description || s.hero_subheadline || t("meta.defaultDescription");
  return {
    title: s.tagline ? `${s.business_name} | ${s.tagline}` : s.business_name,
    description,
    openGraph: { title: s.business_name, description, type: "website", siteName: s.business_name, locale: OG_LOCALE[locale] },
  };
}

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

export default async function HomePage() {
  const settings = await getPublicSettings();
  const { t, locale } = await getT();
  const configured = isSupabaseConfigured();
  const [featured, recent, testimonials, faqs, counts] = configured
    ? await Promise.all([
        safe<Product[]>(getFeatured(6), []),
        safe<Product[]>(getRecent(8), []),
        safe<Testimonial[]>(getTestimonials(), []),
        safe<Faq[]>(getFaqs(), []),
        safe(getStockCounts(), { available: 0, reserved: 0 }),
      ])
    : [[], [], [], [], { available: 0, reserved: 0 }];
  const faqsL = faqs.map((f) => localizeFaq(f, locale));
  const testimonialsL = testimonials.map((x) => localizeTestimonial(x, locale));
  const featuredIds = new Set(featured.map((p) => p.id));
  const recentOnly = recent.filter((p) => !featuredIds.has(p.id)).slice(0, 4);
  const newest = recent[0] ?? null;
  const contact = {
    phone: settings.phone,
    whatsapp_number: settings.whatsapp_number,
    messenger_url: settings.messenger_url,
    facebook_url: settings.facebook_url,
    instagram_url: settings.instagram_url,
  };
  const hasPolicies = Boolean(settings.delivery_info || settings.payment_methods || settings.warranty_policy);

  return (
    <>
      {/* The one bold moment: a flat BIOS-blue field holding the headline and the live stock readout. */}
      <section className="bg-brand text-brand-ink">
        <div className="container-page grid items-center gap-12 py-16 md:grid-cols-[1.2fr_1fr] md:py-24">
          <div>
            <h1 className="text-[clamp(3.25rem,9vw,7rem)]">{settings.hero_headline}</h1>
            {settings.hero_subheadline && <p className="mt-6 max-w-lg text-lg text-brand-muted">{settings.hero_subheadline}</p>}
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/catalog" className="btn-primary">{t("home.browse")}</Link>
              <Link href="/contact" className="btn-secondary">{t("home.contactSeller")}</Link>
            </div>
          </div>
          <StockReadout available={counts.available} reserved={counts.reserved} newest={newest} currency={settings.currency} />
        </div>
      </section>

      <section aria-labelledby="featured-heading" className="container-page section">
        <div className="mb-8 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 id="featured-heading" className="text-5xl md:text-6xl">{t("home.featured")}</h2>
          <Link href="/catalog" className="font-medium text-accent hover:text-accent-strong">{t("home.seeCatalog")}</Link>
        </div>
        {featured.length > 0 ? (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((p, i) => (
              <li key={p.id}><ProductCard product={p} currency={settings.currency} priority={i < 3} /></li>
            ))}
          </ul>
        ) : (
          <div className="grid gap-6 border-y border-line py-10 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="font-display text-3xl font-bold">{t("home.noFeatured")}</p>
              <p className="mt-2 max-w-xl text-muted">
                {counts.available > 0
                  ? t("home.allInCatalog")
                  : t("home.newStock")}
              </p>
            </div>
            <Link href="/catalog" className="btn-secondary">{t("home.openCatalog")}</Link>
          </div>
        )}
      </section>

      {recentOnly.length > 0 && (
        <section aria-labelledby="recent-heading" className="container-page section">
          <h2 id="recent-heading" className="mb-8 text-4xl md:text-5xl">{t("home.recent")}</h2>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {recentOnly.map((p) => (
              <li key={p.id}><ProductCard product={p} currency={settings.currency} /></li>
            ))}
          </ul>
        </section>
      )}

      {settings.highlights.length > 0 && (
        <section aria-labelledby="why-heading" className="container-page section">
          <h2 id="why-heading" className="mb-10 text-5xl md:text-6xl">{t("home.why")}</h2>
          <ul className="grid gap-x-12 gap-y-9 md:grid-cols-2">
            {settings.highlights.map((h) => (
              <li key={h.title} className="border-l-2 border-accent pl-5">
                <h3 className="text-3xl">{h.title}</h3>
                {h.description && <p className="mt-2 max-w-md text-muted">{h.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {settings.how_to_buy.length > 0 && (
        <section id="how-to-buy" aria-labelledby="how-heading" className="container-page section scroll-mt-16">
          <h2 id="how-heading" className="mb-10 text-5xl md:text-6xl">{t("home.how")}</h2>
          <ol className="grid gap-10 md:grid-cols-3 md:gap-8">
            {settings.how_to_buy.map((step, i) => (
              <li key={step.title} className="border-t-2 border-line pt-5">
                <span className="font-display text-6xl font-extrabold leading-none text-accent" aria-hidden>{i + 1}</span>
                <h3 className="mt-3 text-3xl">{step.title}</h3>
                {step.description && <p className="mt-2 max-w-sm text-muted">{step.description}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {hasPolicies && (
        <section aria-labelledby="policies-heading" className="container-page section">
          <h2 id="policies-heading" className="mb-10 text-4xl md:text-5xl">{t("home.policies")}</h2>
          <dl className="grid gap-10 md:grid-cols-3 md:gap-8">
            {settings.delivery_info && (
              <div className="border-t border-line pt-4"><dt className="font-display text-3xl font-bold">{t("home.delivery")}</dt><dd className="mt-2 whitespace-pre-line text-muted">{settings.delivery_info}</dd></div>
            )}
            {settings.payment_methods && (
              <div className="border-t border-line pt-4"><dt className="font-display text-3xl font-bold">{t("home.payment")}</dt><dd className="mt-2 whitespace-pre-line text-muted">{settings.payment_methods}</dd></div>
            )}
            {settings.warranty_policy && (
              <div className="border-t border-line pt-4"><dt className="font-display text-3xl font-bold">{t("home.warranty")}</dt><dd className="mt-2 whitespace-pre-line text-muted">{settings.warranty_policy}</dd></div>
            )}
          </dl>
        </section>
      )}

      {testimonialsL.length > 0 && (
        <section aria-labelledby="reviews-heading" className="container-page section">
          <h2 id="reviews-heading" className="mb-10 text-4xl md:text-5xl">{t("home.reviews")}</h2>
          <ul className="grid gap-10 md:grid-cols-3 md:gap-8">
            {testimonialsL.map((x) => (
              <li key={x.id} className="border-l-2 border-line pl-5">
                <blockquote className="text-lg">{x.body}</blockquote>
                <p className="mt-3 text-sm text-muted">{x.author_name}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {faqsL.length > 0 && (
        <section aria-labelledby="faq-heading" className="container-page section">
          <h2 id="faq-heading" className="mb-8 text-4xl md:text-5xl">{t("home.faq")}</h2>
          <div className="divide-y divide-line border-y border-line">
            {faqsL.map((f) => (
              <details key={f.id} className="faq-item py-5">
                <summary className="text-lg font-medium">{f.question}</summary>
                <p className="mt-3 max-w-2xl whitespace-pre-line text-muted">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* Closing band: the second and last use of the brand colour. */}
      <section aria-labelledby="contact-heading" className="mt-16 bg-brand text-brand-ink md:mt-24">
        <div className="container-page grid gap-10 py-16 md:grid-cols-2 md:items-center md:py-20">
          <div>
            <h2 id="contact-heading" className="text-5xl md:text-6xl">{t("home.talk")}</h2>
            <p className="mt-4 max-w-md text-brand-muted">
              {t("home.talkText")}
            </p>
            {(settings.location || settings.working_hours) && (
              <ul className="mt-6 space-y-1 text-brand-muted">
                {settings.location && <li>{settings.location}</li>}
                {settings.working_hours && <li className="whitespace-pre-line">{settings.working_hours}</li>}
              </ul>
            )}
          </div>
          <ContactActions contact={contact} layout="stack" />
        </div>
      </section>
    </>
  );
}
