import Link from "next/link";
import { getT } from "@/i18n/server";

export default async function NotFound() {
  const { t, locale } = await getT();
  return (
    <main id="main" lang={locale} className="container-page flex min-h-dvh flex-col items-start justify-center gap-4 py-20">
      <h1 className="text-6xl">{t("notFound.title")}</h1>
      <p className="max-w-md text-muted">{t("notFound.text")}</p>
      <div className="flex gap-3">
        <Link href="/catalog" className="btn-primary">{t("notFound.browse")}</Link>
        <Link href="/" className="btn-secondary">{t("notFound.home")}</Link>
      </div>
    </main>
  );
}
