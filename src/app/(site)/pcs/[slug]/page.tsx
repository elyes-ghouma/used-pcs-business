import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SetChatProduct } from "@/components/chat/ChatProvider";
import { ContactActions } from "@/components/ContactActions";
import { InquiryForm } from "@/components/InquiryForm";
import { ProductGallery } from "@/components/ProductGallery";
import { StatusBadge } from "@/components/StatusBadge";
import { OG_LOCALE } from "@/i18n/config";
import { localizeProduct } from "@/i18n/content";
import { getPublicSettings, getT } from "@/i18n/server";
import { getProductBySlug, sortImages } from "@/lib/data";
import { formatDate, formatPrice } from "@/lib/format";
import { mediaUrl } from "@/lib/supabase/public";
import { SPEC_FIELDS } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const [found, settings, { t, locale }] = await Promise.all([getProductBySlug(slug), getPublicSettings(), getT()]);
  if (!found) return { title: t("product.notFound"), robots: { index: false } };
  const product = localizeProduct(found, locale);
  const price = formatPrice(product.price, settings.currency, locale);
  const specs = [product.cpu, product.gpu, product.ram, product.storage].filter(Boolean).join(" | ");
  const description = [price, specs, product.description].filter(Boolean).join(". ").slice(0, 200);
  const image = mediaUrl(sortImages(product)[0]?.storage_path);
  return {
    title: t("product.meta.title", { name: product.name, site: settings.business_name }),
    description,
    alternates: { canonical: `/pcs/${product.slug}` },
    openGraph: {
      type: "website",
      locale: OG_LOCALE[locale],
      title: `${product.name} - ${price}`,
      description,
      url: `/pcs/${product.slug}`,
      siteName: settings.business_name,
      ...(image ? { images: [{ url: image, alt: product.name }] } : {}),
    },
    twitter: { card: image ? "summary_large_image" : "summary", title: `${product.name} - ${price}`, description },
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const [found, settings, { t, locale }] = await Promise.all([getProductBySlug(slug), getPublicSettings(), getT()]);
  if (!found) notFound();
  const product = localizeProduct(found, locale);

  const images = sortImages(product)
    .map((i) => ({ id: i.id, url: mediaUrl(i.storage_path) }))
    .filter((i): i is { id: string; url: string } => Boolean(i.url));
  const specs = SPEC_FIELDS.map(([key]) => [t(`spec.${key}`), product[key]] as const).filter(([, v]) => v);
  const extras = product.extra_specs ?? [];
  const contact = {
    phone: settings.phone,
    whatsapp_number: settings.whatsapp_number,
    messenger_url: settings.messenger_url,
    facebook_url: settings.facebook_url,
    instagram_url: settings.instagram_url,
  };
  const available = product.status === "available";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description || undefined,
    image: images.map((i) => i.url),
    offers: {
      "@type": "Offer",
      price: Number(product.price),
      priceCurrency: settings.currency,
      availability: available ? "https://schema.org/InStock" : product.status === "reserved" ? "https://schema.org/LimitedAvailability" : "https://schema.org/SoldOut",
      itemCondition: "https://schema.org/UsedCondition",
    },
  };

  return (
    <div className="container-page py-8">
      <SetChatProduct product={{ id: product.id, name: product.name, slug: product.slug }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label={t("product.breadcrumb")} className="mb-5 text-sm text-muted">
        <Link href="/catalog" className="hover:text-text">{t("product.catalog")}</Link> <span aria-hidden>/</span> <span className="text-text">{product.name}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[1.25fr_1fr]">
        {/* On phones the order is photo, price and contact, then the details; on large screens the contact column is sticky on the right. */}
        <div className="max-lg:contents">
          <div className="max-lg:order-1">
            <ProductGallery images={images} name={product.name} soldOut={product.status === "sold"} />
          </div>
          <div className="max-lg:order-3 lg:mt-10">
          {product.description && (
            <section aria-labelledby="desc-heading">
              <h2 id="desc-heading" className="text-3xl">{t("product.description")}</h2>
              <p className="mt-3 max-w-prose whitespace-pre-line text-muted">{product.description}</p>
            </section>
          )}
          <section aria-labelledby="spec-heading" className="mt-10">
            <h2 id="spec-heading" className="text-3xl">{t("product.specs")}</h2>
            {specs.length + extras.length > 0 ? (
              <dl className="mt-5 border-t border-line">
                {specs.map(([label, value]) => (
                  <div key={label} className="leader border-b border-line-soft py-3">
                    <dt className="leader-label">{label}</dt>
                    <span className="leader-fill" aria-hidden />
                    <dd className="leader-value">{value}</dd>
                  </div>
                ))}
                {extras.map((e, i) => (
                  <div key={`${e.label}-${i}`} className="leader border-b border-line-soft py-3">
                    <dt className="leader-label">{e.label}</dt>
                    <span className="leader-fill" aria-hidden />
                    <dd className="leader-value">{e.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-3 text-muted">{t("product.noSpecs")}</p>
            )}
          </section>
          {(product.accessories || product.condition || product.testing_info || product.warranty_info) && (
            <section aria-labelledby="more-heading" className="mt-10">
              <h2 id="more-heading" className="text-3xl">{t("product.conditionTitle")}</h2>
              <dl className="mt-5 border-t border-line">
                {product.condition && <div className="border-b border-line-soft py-4"><dt className="text-muted">{t("product.condition")}</dt><dd className="mt-1 whitespace-pre-line">{product.condition}</dd></div>}
                {product.testing_info && <div className="border-b border-line-soft py-4"><dt className="text-muted">{t("product.testing")}</dt><dd className="mt-1 whitespace-pre-line">{product.testing_info}</dd></div>}
                {product.accessories && <div className="border-b border-line-soft py-4"><dt className="text-muted">{t("product.accessories")}</dt><dd className="mt-1 whitespace-pre-line">{product.accessories}</dd></div>}
                {product.warranty_info && <div className="border-b border-line-soft py-4"><dt className="text-muted">{t("product.warranty")}</dt><dd className="mt-1 whitespace-pre-line">{product.warranty_info}</dd></div>}
              </dl>
            </section>
          )}
          </div>
        </div>

        <aside className="max-lg:order-2 lg:sticky lg:top-24 lg:self-start">
          <div className="panel space-y-5 p-6">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-4xl">{product.name}</h1>
              <StatusBadge status={product.status} className="mt-1.5 shrink-0" />
            </div>
            <p className="font-display text-5xl font-bold text-accent-strong">{formatPrice(product.price, settings.currency, locale)}</p>
            {!available && (
              <p className="rounded-md border border-line bg-bg px-3 py-2 text-sm text-muted">
                {product.status === "reserved"
                  ? t("product.reservedNote")
                  : t("product.soldNote")}
              </p>
            )}
            <p className="text-sm text-muted">{t("product.added", { date: formatDate(product.created_at, false, locale) })}</p>
            <div>
              <h2 className="mb-3 text-xl">{available ? t("product.contactAvailable") : t("product.contactOther")}</h2>
              <ContactActions contact={contact} product={{ id: product.id, name: product.name }} layout="stack" />
            </div>
          </div>

          <div className="panel mt-6 p-6">
            <h2 className="mb-1 text-2xl">{t("product.sendMessage")}</h2>
            <p className="mb-4 text-sm text-muted">{t("product.sendMessageHint")}</p>
            <InquiryForm productId={product.id} productName={product.name} />
          </div>
        </aside>
      </div>
    </div>
  );
}
