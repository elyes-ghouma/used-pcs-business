import type { Metadata } from "next";
import { ContactActions } from "@/components/ContactActions";
import { InquiryForm } from "@/components/InquiryForm";
import { getPublicSettings, getT } from "@/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getPublicSettings();
  const { t } = await getT();
  return { title: t("contact.meta.title", { name: s.business_name }), description: t("contact.meta.desc", { name: s.business_name }), alternates: { canonical: "/contact" } };
}

export default async function ContactPage() {
  const s = await getPublicSettings();
  const { t } = await getT();
  const contact = {
    phone: s.phone,
    whatsapp_number: s.whatsapp_number,
    messenger_url: s.messenger_url,
    facebook_url: s.facebook_url,
    instagram_url: s.instagram_url,
  };
  return (
    <div className="container-page py-10">
      <h1 className="text-5xl">{t("contact.title")}</h1>
      <p className="mt-2 max-w-xl text-muted">{t("contact.intro")}</p>
      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <div className="space-y-6">
          <div className="panel p-6">
            <h2 className="mb-4 text-2xl">{t("contact.reach")}</h2>
            <ContactActions contact={contact} layout="stack" />
          </div>
          {(s.location || s.working_hours || s.phone) && (
            <dl className="panel divide-y divide-line-soft">
              {s.phone && <div className="px-6 py-4"><dt className="text-muted">{t("contact.phone")}</dt><dd className="mt-1">{s.phone}</dd></div>}
              {s.location && <div className="px-6 py-4"><dt className="text-muted">{t("contact.location")}</dt><dd className="mt-1 whitespace-pre-line">{s.location}</dd></div>}
              {s.working_hours && <div className="px-6 py-4"><dt className="text-muted">{t("contact.hours")}</dt><dd className="mt-1 whitespace-pre-line">{s.working_hours}</dd></div>}
            </dl>
          )}
        </div>
        <div className="panel p-6">
          <h2 className="mb-1 text-2xl">{t("contact.sendMessage")}</h2>
          <p className="mb-4 text-sm text-muted">{t("product.sendMessageHint")}</p>
          <InquiryForm />
        </div>
      </div>
    </div>
  );
}
