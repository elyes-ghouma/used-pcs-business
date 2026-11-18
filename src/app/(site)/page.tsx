import type { Metadata } from "next";
import Link from "next/link";
import { ContactActions } from "@/components/ContactActions";
import { PcIllustration } from "@/components/PcIllustration";
import { ProductCard } from "@/components/ProductCard";
import { getFaqs, getFeatured, getRecent, getSettings, getTestimonials } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/public";
import type { Faq, Product, Testimonial } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  const description = s.description || s.hero_subheadline || "Tested used gaming PCs and components.";
  return {
    title: s.tagline ? `${s.business_name} | ${s.tagline}` : s.business_name,
    description,
    openGraph: { title: s.business_name, description, type: "website", siteName: s.business_name },
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
  const settings = await getSettings();
  const configured = isSupabaseConfigured();
  const [featured, recent, testimonials, faqs] = configured
    ? await Promise.all([
        safe<Product[]>(getFeatured(6), []),
        safe<Product[]>(getRecent(8), []),
        safe<Testimonial[]>(getTestimonials(), []),
        safe<Faq[]>(getFaqs(), []),
      ])
    : [[], [], [], []];
  const featuredIds = new Set(featured.map((p) => p.id));
  const recentOnly = recent.filter((p) => !featuredIds.has(p.id)).slice(0, 4);
  const contact = {
    phone: settings.phone,
    whatsapp_number: settings.whatsapp_number,
    messenger_url: settings.messenger_url,
    facebook_url: settings.facebook_url,
    instagram_url: settings.instagram_url,
  };

  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div className="container-page grid items-center gap-10 py-14 md:grid-cols-[1.15fr_0.85fr] md:py-20">
          <div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl">{settings.hero_headline}</h1>
            {settings.hero_subheadline && <p className="mt-5 max-w-xl text-lg text-muted">{settings.hero_subheadline}</p>}
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/catalog" className="btn-primary">
                Browse PCs
              </Link>
              <Link href="/contact" className="btn-secondary">
                Contact the seller
              </Link>
            </div>
          </div>
          <PcIllustration className="mx-auto h-auto w-full max-w-sm md:max-w-md" />
        </div>
      </section>

      <section aria-labelledby="featured-heading" className="container-page pt-16">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 id="featured-heading" className="text-4xl">Featured PCs</h2>
          <Link href="/catalog" className="text-sm font-medium text-copper hover:text-copper-strong">See all PCs</Link>
        </div>
        {featured.length > 0 ? (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((p, i) => (
              <li key={p.id}><ProductCard product={p} currency={settings.currency} priority={i < 3} /></li>
            ))}
          </ul>
        ) : (
          <div className="panel p-8 text-muted">
            <p>No featured PCs yet.</p>
            <Link href="/catalog" className="btn-secondary mt-4">Browse the catalog</Link>
          </div>
        )}
      </section>

      {settings.highlights.length > 0 && (
        <section aria-labelledby="why-heading" className="container-page pt-20">
          <h2 id="why-heading" className="mb-6 text-4xl">Why buy from us</h2>
          <ul className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {settings.highlights.map((h) => (
              <li key={h.title} className="bg-surface p-6">
                <h3 className="text-2xl text-copper-strong">{h.title}</h3>
                {h.description && <p className="mt-2 text-muted">{h.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {recentOnly.length > 0 && (
        <section aria-labelledby="recent-heading" className="container-page pt-20">
          <h2 id="recent-heading" className="mb-6 text-4xl">Recently added</h2>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {recentOnly.map((p) => (
              <li key={p.id}><ProductCard product={p} currency={settings.currency} /></li>
            ))}
          </ul>
        </section>
      )}

      {settings.how_to_buy.length > 0 && (
        <section id="how-to-buy" aria-labelledby="how-heading" className="container-page scroll-mt-20 pt-20">
          <h2 id="how-heading" className="mb-6 text-4xl">How to buy</h2>
          <ol className="grid gap-5 md:grid-cols-3">
            {settings.how_to_buy.map((step, i) => (
              <li key={step.title} className="panel p-6">
                <span className="font-display text-5xl text-copper">{i + 1}</span>
                <h3 className="mt-2 text-2xl">{step.title}</h3>
                {step.description && <p className="mt-2 text-muted">{step.description}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {(settings.delivery_info || settings.payment_methods || settings.warranty_policy) && (
        <section aria-labelledby="policies-heading" className="container-page pt-20">
          <h2 id="policies-heading" className="mb-6 text-4xl">Delivery, payment and warranty</h2>
          <dl className="grid gap-5 md:grid-cols-3">
            {settings.delivery_info && (
              <div className="panel p-6"><dt className="text-2xl font-display font-bold">Delivery</dt><dd className="mt-2 whitespace-pre-line text-muted">{settings.delivery_info}</dd></div>
            )}
            {settings.payment_methods && (
              <div className="panel p-6"><dt className="text-2xl font-display font-bold">Payment</dt><dd className="mt-2 whitespace-pre-line text-muted">{settings.payment_methods}</dd></div>
            )}
            {settings.warranty_policy && (
              <div className="panel p-6"><dt className="text-2xl font-display font-bold">Warranty</dt><dd className="mt-2 whitespace-pre-line text-muted">{settings.warranty_policy}</dd></div>
            )}
          </dl>
        </section>
      )}

      {testimonials.length > 0 && (
        <section aria-labelledby="reviews-heading" className="container-page pt-20">
          <h2 id="reviews-heading" className="mb-6 text-4xl">What customers say</h2>
          <ul className="grid gap-5 md:grid-cols-3">
            {testimonials.map((t) => (
              <li key={t.id} className="panel p-6">
                <blockquote className="text-text">&ldquo;{t.body}&rdquo;</blockquote>
                <p className="mt-4 text-sm text-muted">{t.author_name}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {faqs.length > 0 && (
        <section aria-labelledby="faq-heading" className="container-page pt-20">
          <h2 id="faq-heading" className="mb-6 text-4xl">Questions and answers</h2>
          <div className="panel divide-y divide-line">
            {faqs.map((f) => (
              <details key={f.id} className="group p-5">
                <summary className="cursor-pointer list-none text-lg font-medium [&::-webkit-details-marker]:hidden">
                  {f.question}
                </summary>
                <p className="mt-3 whitespace-pre-line text-muted">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="contact-heading" className="container-page pt-20">
        <div className="panel grid gap-8 p-8 md:grid-cols-2">
          <div>
            <h2 id="contact-heading" className="text-4xl">Talk to the seller</h2>
            <p className="mt-3 max-w-md text-muted">
              Ask about a PC, check that it is still available, or arrange a visit. Payment and delivery are agreed directly with the seller.
            </p>
            <ul className="mt-5 space-y-1 text-sm text-muted">
              {settings.location && <li>{settings.location}</li>}
              {settings.working_hours && <li className="whitespace-pre-line">{settings.working_hours}</li>}
            </ul>
          </div>
          <div className="self-center">
            <ContactActions contact={contact} layout="stack" />
          </div>
        </div>
      </section>
    </>
  );
}
